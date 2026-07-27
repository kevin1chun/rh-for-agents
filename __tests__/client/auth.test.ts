import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthState } from "../../src/client/auth.js";
import { logout, restoreSession, restoreSessionFromToken } from "../../src/client/auth.js";
import { AuthenticationError } from "../../src/client/errors.js";
import type { RobinhoodSession } from "../../src/client/session.js";
import type { TokenData, TokenStore } from "../../src/client/token-store.js";

const sampleTokens: TokenData = {
  access_token: "tok123",
  refresh_token: "ref456",
  token_type: "Bearer",
  device_token: "dev789",
  saved_at: Date.now() / 1000,
};

function mockSession(): RobinhoodSession {
  return {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    setAccessToken: vi.fn(),
    clearAccessToken: vi.fn(),
    onUnauthorized: null,
    ensureFreshToken: null,
  } as unknown as RobinhoodSession;
}

function mockStore(tokens: TokenData | null = sampleTokens): TokenStore {
  return {
    load: vi.fn().mockResolvedValue(tokens),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

describe("restoreSession (token store)", () => {
  let session: RobinhoodSession;

  beforeEach(() => {
    vi.clearAllMocks();
    session = mockSession();
  });

  it("loads tokens from store and sets access token", async () => {
    const store = mockStore();
    const { result } = await restoreSession(session, store);
    expect(result.status).toBe("logged_in");
    expect(result.method).toBe("keychain");
    expect(store.load).toHaveBeenCalled();
    expect(session.setAccessToken).toHaveBeenCalledWith("tok123");
  });

  it("throws AuthenticationError when no tokens found", async () => {
    const store = mockStore(null);
    await expect(restoreSession(session, store)).rejects.toThrow(AuthenticationError);
  });

  it("registers onUnauthorized callback", async () => {
    const store = mockStore();
    await restoreSession(session, store);
    expect(session.onUnauthorized).toBeTypeOf("function");
  });
});

describe("refresh: rotation and recovery", () => {
  const originalFetch = globalThis.fetch;
  const tokenUrl = "https://api.robinhood.com/oauth2/token/";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  function grantResponse(body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rejected = () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 401 });

  /** Install a typed fetch mock and hand back the spy. */
  function mockFetch(response: () => Response) {
    const fn = vi.fn(async () => response());
    globalThis.fetch = fn as unknown as typeof fetch;
    return fn;
  }

  function savedToken(store: TokenStore, call = 0): TokenData {
    return (store.save as ReturnType<typeof vi.fn>).mock.calls[call]?.[0] as TokenData;
  }

  it("persists rotated tokens before returning the new access token", async () => {
    const store = mockStore();
    const session = mockSession();
    const fetchSpy = mockFetch(() =>
      grantResponse({ access_token: "new-access", refresh_token: "rotated", expires_in: 734000 }),
    );

    await restoreSession(session, store);
    const token = await session.onUnauthorized?.();

    expect(token).toBe("new-access");
    expect(store.save).toHaveBeenCalledWith(
      expect.objectContaining({ access_token: "new-access", refresh_token: "rotated" }),
    );
    // Saved before the caller could use it — ordering matters under rotation.
    const saveOrder = (store.save as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0] ?? 0;
    expect(saveOrder).toBeGreaterThan(fetchSpy.mock.invocationCallOrder[0] ?? 0);
  });

  it("records expires_at from the grant so renewal can run ahead of expiry", async () => {
    const store = mockStore();
    const session = mockSession();
    mockFetch(() =>
      grantResponse({ access_token: "opaque-not-a-jwt", refresh_token: "r2", expires_in: 1000 }),
    );

    await restoreSession(session, store);
    await session.onUnauthorized?.();

    const saved = savedToken(store);
    expect(saved.expires_at).toBeCloseTo(saved.saved_at + 1000, 0);
  });

  it("adopts a token another process persisted when refresh is rejected", async () => {
    // Rotation is single-use: if another process refreshed first, ours is dead
    // but a working token is already sitting in the store.
    const store = mockStore();
    (store.load as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleTokens)
      .mockResolvedValueOnce({ ...sampleTokens, access_token: "fresh", refresh_token: "other" });
    const session = mockSession();
    mockFetch(rejected);

    await restoreSession(session, store);

    expect(await session.onUnauthorized?.()).toBe("fresh");
  });

  it("gives up when the store holds the same token that was just rejected", async () => {
    const store = mockStore();
    const session = mockSession();
    mockFetch(rejected);

    await restoreSession(session, store);

    expect(await session.onUnauthorized?.()).toBeNull();
  });

  it("registers a pre-request hook that does not renew while expiry is far off", async () => {
    const store = mockStore({
      ...sampleTokens,
      expires_at: Date.now() / 1000 + 30 * 24 * 60 * 60,
    });
    const session = mockSession();
    const fetchSpy = mockFetch(() => grantResponse({ access_token: "unused" }));

    await restoreSession(session, store);
    expect(session.ensureFreshToken).toBeTypeOf("function");

    await session.ensureFreshToken?.();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renews through the pre-request hook once inside the skew window", async () => {
    const store = mockStore({ ...sampleTokens, expires_at: Date.now() / 1000 + 60 });
    const session = mockSession();
    const fetchSpy = mockFetch(() =>
      grantResponse({ access_token: "renewed", refresh_token: "r3" }),
    );

    await restoreSession(session, store);
    await session.ensureFreshToken?.();

    expect(fetchSpy).toHaveBeenCalledWith(tokenUrl, expect.objectContaining({ method: "POST" }));
    expect(session.setAccessToken).toHaveBeenCalledWith("renewed");
  });

  it("skips renewal when expiry is unknown, leaving it to the 401 path", async () => {
    const store = mockStore({ ...sampleTokens, access_token: "opaque", expires_at: undefined });
    const session = mockSession();
    const fetchSpy = mockFetch(() => grantResponse({ access_token: "unused" }));

    await restoreSession(session, store);
    await session.ensureFreshToken?.();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("restoreSessionFromToken", () => {
  it("sets access token directly", () => {
    const session = mockSession();
    const result = restoreSessionFromToken(session, "direct-token");
    expect(result.status).toBe("logged_in");
    expect(result.method).toBe("token");
    expect(session.setAccessToken).toHaveBeenCalledWith("direct-token");
  });
});

describe("logout", () => {
  // Mock global fetch for token revocation
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("{}")) as any;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it("clears access token and onUnauthorized", async () => {
    const session = mockSession();
    const store = mockStore();
    const state: AuthState = { tokens: sampleTokens, store, refreshing: null, lastRefreshAt: 0 };

    await logout(session, state);

    expect(session.clearAccessToken).toHaveBeenCalled();
    expect(session.onUnauthorized).toBeNull();
  });

  it("attempts to revoke token at Robinhood", async () => {
    const session = mockSession();
    const store = mockStore();
    const state: AuthState = { tokens: sampleTokens, store, refreshing: null, lastRefreshAt: 0 };

    await logout(session, state);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.robinhood.com/oauth2/revoke_token/",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("deletes from store", async () => {
    const session = mockSession();
    const store = mockStore();
    const state: AuthState = { tokens: sampleTokens, store, refreshing: null, lastRefreshAt: 0 };

    await logout(session, state);

    expect(store.delete).toHaveBeenCalled();
  });

  it("does not throw when state is null", async () => {
    const session = mockSession();
    await expect(logout(session, null)).resolves.toBeUndefined();
  });
});
