/** Redact sensitive tokens from strings before they reach the LLM. */

const REDACTED = "[REDACTED]";

// Matches JWT-shaped strings: three dot-separated base64url segments, each 20+ chars.
// All JWTs start with eyJ (base64url of '{"').
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g;

// Matches "Authorization: Bearer <token>" in plain-text headers/logs.
const BEARER_HEADER_PATTERN = /\bBearer\s+[A-Za-z0-9_.-]{10,}\b/gi;

// Matches values of known sensitive keys in JSON-serialized strings.
// e.g. "access_token":"some-value" → "access_token":"[REDACTED]"
const SENSITIVE_KEY_PATTERN =
  /"(access_token|refresh_token|device_token|bearer_token|authorization|password|secret)":\s*"([^"]*)"/gi;

// The follow/unfollow endpoints embed the caller's OWN profile uuid in the URL
// path (`/discovery/lists/{list}/followers/{user_id}/`). We never surface that
// uuid in a success result (follow/unfollow report declaratively), but a failed
// write can carry the request URL inside an APIError message — strip the uuid
// segment structurally so it can't leak through error text or any echoed body.
const FOLLOWER_URL_PATTERN = /(\/followers\/)[^/"?\s]+/g;

/** Redact JWT tokens, known sensitive key values, and profile-uuid follower URLs. */
export function redactTokens(input: string): string {
  let result = input;
  result = result.replace(SENSITIVE_KEY_PATTERN, `"$1":"${REDACTED}"`);
  result = result.replace(JWT_PATTERN, REDACTED);
  result = result.replace(BEARER_HEADER_PATTERN, `Bearer ${REDACTED}`);
  result = result.replace(FOLLOWER_URL_PATTERN, "$1[USER]");
  return result;
}

// Account identifiers are not tokens, but must never be surfaced to a
// transcript unless the *caller* supplied them (a PII classifier blocks the
// assistant from discovering an account number). Robinhood responses embed
// `account_number` and `/accounts/{id}/` URLs in nested fields the caller never
// passed — strip both from any response body we echo, so the only account
// identifier that ever appears in tool output is the caller-echoed one.
const ACCOUNT_URL_PATTERN = /(\/accounts\/)[^/"?\s]+/g;
const ACCOUNT_ID_KEYS = new Set([
  "account_number",
  "account_id",
  "account",
  "brokerage_account_id",
  "account_url",
]);

/**
 * Deep-clone `value`, dropping keys that carry an account identifier and
 * redacting `/accounts/{id}/` URL segments inside any string. Structural, not
 * value-based — so it can't miss an id it hasn't been told about.
 */
export function scrubAccountIdentifiers<T>(value: T): T {
  if (typeof value === "string") {
    return value
      .replace(ACCOUNT_URL_PATTERN, "$1[ACCOUNT]")
      .replace(FOLLOWER_URL_PATTERN, "$1[USER]") as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => scrubAccountIdentifiers(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (ACCOUNT_ID_KEYS.has(k)) continue; // drop identifier-bearing fields entirely
      out[k] = scrubAccountIdentifiers(v);
    }
    return out as unknown as T;
  }
  return value;
}

// Account objects (from get_accounts / get_account) carry `account_number` as
// their canonical, intentionally-visible identifier — callers need it to
// select an account in later tool calls. But the same objects also embed the
// identical identifier a second and third time, in `url`/`can_downgrade_to_cash`
// (a `/accounts/{id}/...` URL) and the legacy numeric `rhs_account_number`.
// Nothing in this codebase ever reads those three back — every client method
// that accepts an accountNumber rebuilds any URL it needs internally (see
// resolveAccountUrl) — so they're pure redundant exposure. Scoped to only
// fire alongside a sibling `account_number` key, so it never touches the
// `account` URL field on positions/orders, which IS the sole identifier
// there (no parallel plain field) and is load-bearing for multi-account
// attribution.
const REDUNDANT_ACCOUNT_OBJECT_KEYS = new Set([
  "url",
  "can_downgrade_to_cash",
  "rhs_account_number",
]);

/** Strip redundant account-identifier fields, keeping `account_number` itself intact. */
export function scrubRedundantAccountFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => scrubRedundantAccountFields(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const isAccountShaped = "account_number" in obj;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (isAccountShaped && REDUNDANT_ACCOUNT_OBJECT_KEYS.has(k)) continue;
      out[k] = scrubRedundantAccountFields(v);
    }
    return out as unknown as T;
  }
  return value;
}

const SENSITIVE_KEYS = new Set([
  "access_token",
  "refresh_token",
  "device_token",
  "bearer_token",
  "token",
  "password",
  "secret",
]);

/** Deep-clone an object, replacing known sensitive key values with [REDACTED]. */
export function scrubSensitiveKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key)) {
      scrubbed[key] = REDACTED;
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      scrubbed[key] = scrubSensitiveKeys(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      scrubbed[key] = value.map((item) =>
        typeof item === "object" && item !== null && !Array.isArray(item)
          ? scrubSensitiveKeys(item as Record<string, unknown>)
          : item,
      );
    } else {
      scrubbed[key] = value;
    }
  }
  return scrubbed;
}
