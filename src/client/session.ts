/** HTTP session wrapper for Robinhood API using native fetch. */

import { VERSION } from "../version.js";
import { trustedOrigins } from "./urls.js";

export const DEFAULT_HEADERS: Record<string, string> = {
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=1",
  "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
  "X-Robinhood-API-Version": "1.431.4",
  "User-Agent": `robinhood-for-agents/${VERSION}`,
};

const DEFAULT_TIMEOUT_MS = 16_000;

/**
 * Follow redirects manually, refusing to send auth headers to untrusted hosts.
 * Returns the final response after following up to `maxRedirects` hops.
 */
async function safeFetch(
  url: string,
  init: RequestInit & { signal: AbortSignal },
  maxRedirects = 5,
): Promise<Response> {
  let currentUrl = url;
  for (let i = 0; i <= maxRedirects; i++) {
    const resp = await fetch(currentUrl, { ...init, redirect: "manual" });

    if (resp.status < 300 || resp.status >= 400) {
      return resp;
    }

    // 3xx redirect
    const location = resp.headers.get("location");
    if (!location) return resp;

    // Resolve relative redirects
    const resolved = new URL(location, currentUrl).href;
    const target = new URL(resolved);
    if (!trustedOrigins().has(target.origin)) {
      throw new Error(`Refusing redirect to untrusted host: ${target.hostname}`);
    }
    currentUrl = resolved;
  }
  throw new Error("Too many redirects");
}

export class RobinhoodSession {
  private headers: Record<string, string>;
  private timeoutMs: number;
  private accessToken: string | null = null;

  /**
   * Called when a 401 is received. Should refresh the token and return
   * the new access token, or null if refresh failed.
   */
  onUnauthorized: (() => Promise<string | null>) | null = null;

  /**
   * Called before each request. Should renew the access token if it is close
   * to expiring and update it via `setAccessToken`. Failures are swallowed —
   * a proactive refresh that does not work simply falls through to the
   * reactive `onUnauthorized` path.
   */
  ensureFreshToken: (() => Promise<void>) | null = null;

  constructor(opts?: { timeoutMs?: number }) {
    this.headers = { ...DEFAULT_HEADERS };
    this.timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Set the access token for Bearer auth injection. */
  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  /** Clear the access token. */
  clearAccessToken(): void {
    this.accessToken = null;
  }

  /** Build headers with Authorization injected if token is set. */
  private authHeaders(base: Record<string, string>): Record<string, string> {
    if (this.accessToken) {
      return { ...base, Authorization: `Bearer ${this.accessToken}` };
    }
    return base;
  }

  async get(url: string, params?: Record<string, string>): Promise<Response> {
    const target = params ? `${url}?${new URLSearchParams(params)}` : url;
    return this.fetchWithRetry(target, {
      method: "GET",
      headers: this.authHeaders(this.headers),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }

  async post(
    url: string,
    body?: Record<string, unknown>,
    opts?: { asJson?: boolean; timeoutMs?: number },
  ): Promise<Response> {
    const timeout = opts?.timeoutMs ?? this.timeoutMs;
    const headers = this.authHeaders({ ...this.headers });

    let requestBody: string;
    if (opts?.asJson) {
      headers["Content-Type"] = "application/json";
      requestBody = JSON.stringify(body ?? {});
    } else {
      for (const [k, v] of Object.entries(body ?? {})) {
        if (v !== null && typeof v === "object") {
          throw new Error(
            `Cannot form-encode nested object at key "${k}". Use asJson: true for complex payloads.`,
          );
        }
      }
      requestBody = new URLSearchParams(
        Object.entries(body ?? {}).map(([k, v]) => [k, String(v)]),
      ).toString();
    }

    return this.fetchWithRetry(url, {
      method: "POST",
      headers,
      body: requestBody,
      signal: AbortSignal.timeout(timeout),
    });
  }

  async patch(
    url: string,
    body?: Record<string, unknown>,
    opts?: { timeoutMs?: number },
  ): Promise<Response> {
    const timeout = opts?.timeoutMs ?? this.timeoutMs;
    const headers = this.authHeaders({ ...this.headers });
    headers["Content-Type"] = "application/json";
    return this.fetchWithRetry(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(timeout),
    });
  }

  async delete(url: string): Promise<Response> {
    return this.fetchWithRetry(url, {
      method: "DELETE",
      headers: this.authHeaders(this.headers),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }

  /** Return a copy of `init` with the Authorization header re-stamped. */
  private withAuthHeader(
    init: RequestInit & { signal: AbortSignal },
    token: string,
  ): RequestInit & { signal: AbortSignal } {
    const headers =
      init.headers instanceof Headers
        ? Object.fromEntries(init.headers)
        : { ...(init.headers as Record<string, string>) };
    headers.Authorization = `Bearer ${token}`;
    return { ...init, headers };
  }

  /**
   * Fetch with proactive renewal plus single-retry on 401.
   *
   * Callers bake the Authorization header before calling this, so a proactive
   * refresh that swaps the token must re-stamp the header or the request would
   * still go out with the stale one.
   */
  private async fetchWithRetry(
    url: string,
    init: RequestInit & { signal: AbortSignal },
  ): Promise<Response> {
    let req = init;

    if (this.ensureFreshToken) {
      const before = this.accessToken;
      try {
        await this.ensureFreshToken();
      } catch {
        // Proactive renewal is best-effort; fall through to the 401 path.
      }
      if (this.accessToken && this.accessToken !== before) {
        req = this.withAuthHeader(req, this.accessToken);
      }
    }

    const resp = await safeFetch(url, req);

    if (resp.status === 401 && this.onUnauthorized) {
      const newToken = await this.onUnauthorized();
      if (newToken) {
        this.accessToken = newToken;
        return safeFetch(url, this.withAuthHeader(req, newToken));
      }
    }

    return resp;
  }
}

export function createSession(opts?: { timeoutMs?: number }): RobinhoodSession {
  return new RobinhoodSession(opts);
}
