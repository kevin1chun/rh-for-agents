/**
 * Authentication — load tokens from a TokenStore and inject into the session.
 *
 * Token refresh (on 401) is handled automatically via the session's
 * onUnauthorized callback. The refresh logic is ported from the former
 * auth proxy (proxy.ts).
 */

import { AuthenticationError } from "./errors.js";
import type { RobinhoodSession } from "./session.js";
import { deriveExpiresAt, type TokenData, type TokenStore } from "./token-store.js";

const CLIENT_ID = "c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS";
const EXPIRATION_TIME = 734000;

/**
 * Renew this far ahead of expiry rather than waiting for a 401.
 *
 * Robinhood grants roughly 8.5 days on a refresh, so a day of slack leaves
 * plenty of room while keeping the refresh chain alive: every renewal issues a
 * fresh refresh token, and it is the chain lapsing — not the access token
 * expiring — that forces a new browser login.
 */
const REFRESH_SKEW_SEC = 24 * 60 * 60;

export interface LoginResult {
  status: "logged_in";
  method: "keychain" | "encrypted_file" | "token";
}

const MIN_REFRESH_INTERVAL_MS = 5_000;

/** State held per-client for token management. */
export interface AuthState {
  tokens: TokenData;
  store: TokenStore;
  refreshing: Promise<string | null> | null;
  lastRefreshAt: number;
}

/**
 * A refresh attempt failed. Another process may have already rotated the token
 * and persisted a working one, so reload the store before giving up rather than
 * failing while a valid credential sits on disk.
 *
 * Refresh tokens are single-use: once any process refreshes, every other
 * process is holding a token the server has already invalidated, and its
 * in-memory copy can never recover on its own.
 */
async function adoptFromStore(state: AuthState, attempted: string): Promise<string | null> {
  let stored: TokenData | null;
  try {
    stored = await state.store.load();
  } catch {
    return null;
  }

  // Same token we just tried means nobody else refreshed — nothing to adopt.
  if (!stored || stored.refresh_token === attempted) return null;

  state.tokens = stored;
  return stored.access_token;
}

/**
 * Refresh the access token using the refresh_token + device_token.
 * Returns the new access token on success, null on failure.
 */
async function refreshTokens(state: AuthState): Promise<string | null> {
  const { tokens, store } = state;
  if (!tokens.refresh_token || !tokens.device_token) return null;

  const attempted = tokens.refresh_token;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: attempted,
    scope: "internal",
    client_id: CLIENT_ID,
    expires_in: String(EXPIRATION_TIME),
    device_token: tokens.device_token,
  });

  let resp: Response;
  try {
    resp = await fetch("https://api.robinhood.com/oauth2/token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
        "X-Robinhood-API-Version": "1.431.4",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return adoptFromStore(state, attempted);
  }

  if (!resp.ok) return adoptFromStore(state, attempted);

  let data: Record<string, unknown>;
  try {
    data = (await resp.json()) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (!("access_token" in data)) return null;

  const accessToken = data.access_token as string;
  const savedAt = Date.now() / 1000;
  const newTokens: TokenData = {
    access_token: accessToken,
    refresh_token: (data.refresh_token as string) ?? attempted,
    token_type: (data.token_type as string) ?? "Bearer",
    device_token: tokens.device_token,
    account_hint: tokens.account_hint,
    saved_at: savedAt,
    expires_at: deriveExpiresAt(accessToken, {
      expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
      issuedAt: savedAt,
    }),
  };

  // Update in-memory state
  state.tokens = newTokens;

  // Persist before the caller uses the new access token. Rotation is enforced
  // server-side: `attempted` is already dead, so a lost save leaves the only
  // copy of the new refresh token in memory and strands the next process start.
  // That is not a benign degradation, so it must not be swallowed silently.
  try {
    await store.save(newTokens);
  } catch (e) {
    console.error(
      "[robinhood-for-agents] CRITICAL: refreshed tokens could not be persisted " +
        `(${e instanceof Error ? e.message : String(e)}). The rotated refresh token now ` +
        "exists only in memory — once this process exits a new browser login will be required.",
    );
  }

  return newTokens.access_token;
}

/**
 * Create a 401-refresh callback with a per-instance concurrency guard.
 * Multiple concurrent 401s share a single refresh attempt.
 */
function createRefreshCallback(state: AuthState): () => Promise<string | null> {
  return async () => {
    if (state.refreshing) {
      return state.refreshing;
    }
    // Rate limit: refuse to refresh if the last attempt was too recent
    if (Date.now() - state.lastRefreshAt < MIN_REFRESH_INTERVAL_MS) {
      return null;
    }
    state.lastRefreshAt = Date.now();
    state.refreshing = refreshTokens(state).finally(() => {
      state.refreshing = null;
    });
    return state.refreshing;
  };
}

/**
 * Create the pre-request hook that renews the token before it expires.
 *
 * Waiting for a 401 is not enough on its own: nothing refreshes while the
 * process is idle, so a gap longer than the refresh-token lifetime lets the
 * chain lapse and forces a new browser login. Renewing ahead of expiry keeps
 * the chain alive for as long as the client is actually being used.
 */
function createEnsureFreshCallback(
  state: AuthState,
  session: RobinhoodSession,
  refresh: () => Promise<string | null>,
): () => Promise<void> {
  return async () => {
    const expiresAt = state.tokens.expires_at;
    // Unknown expiry (non-JWT token, or a store entry predating the field):
    // leave it to the reactive 401 path rather than refreshing on every call.
    if (expiresAt === undefined) return;
    if (Date.now() / 1000 < expiresAt - REFRESH_SKEW_SEC) return;

    const token = await refresh();
    if (token) session.setAccessToken(token);
  };
}

/**
 * Restore a session by loading tokens from the store and configuring
 * the session for direct API access with automatic token refresh.
 */
export async function restoreSession(
  session: RobinhoodSession,
  store: TokenStore,
): Promise<{ result: LoginResult; state: AuthState }> {
  const tokens = await store.load();
  if (!tokens) {
    throw new AuthenticationError(
      "No tokens found. Run 'robinhood-for-agents onboard' to authenticate.",
    );
  }

  // Backfill expiry for entries persisted before `expires_at` existed, so
  // proactive renewal works without waiting for a re-login.
  if (tokens.expires_at === undefined) {
    tokens.expires_at = deriveExpiresAt(tokens.access_token, { issuedAt: tokens.saved_at });
  }

  // Set access token on the session for Bearer injection
  session.setAccessToken(tokens.access_token);

  // Build auth state for refresh management
  const state: AuthState = {
    tokens,
    store,
    refreshing: null,
    lastRefreshAt: 0,
  };

  // Register 401 callback for automatic token refresh, plus the pre-request
  // hook that renews ahead of expiry so the refresh chain does not lapse.
  const refresh = createRefreshCallback(state);
  session.onUnauthorized = refresh;
  session.ensureFreshToken = createEnsureFreshCallback(state, session, refresh);

  const method = store.constructor.name.includes("Encrypted") ? "encrypted_file" : "keychain";

  return {
    result: { status: "logged_in", method },
    state,
  };
}

/**
 * Restore a session from a direct access token (no store, no refresh).
 */
export function restoreSessionFromToken(
  session: RobinhoodSession,
  accessToken: string,
): LoginResult {
  session.setAccessToken(accessToken);
  // No onUnauthorized — 401 will propagate as TokenExpiredError
  return { status: "logged_in", method: "token" };
}

/**
 * Logout — revoke the token and clear the store.
 */
export async function logout(session: RobinhoodSession, state: AuthState | null): Promise<void> {
  if (state?.tokens.access_token) {
    // Attempt to revoke the token at Robinhood
    try {
      await fetch("https://api.robinhood.com/oauth2/revoke_token/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
        },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          token: state.tokens.access_token,
        }).toString(),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Best effort
    }

    // Clear the store
    try {
      await state.store.delete();
    } catch {
      // Best effort
    }
  }

  session.clearAccessToken();
  session.onUnauthorized = null;
  session.ensureFreshToken = null;
}
