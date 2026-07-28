import { describe, expect, it } from "bun:test";
import type { GatewayConfig } from "./config";
import {
  AuthGateway,
  createVerifier,
  SharedSecretVerifier,
  UnsafeStructuralVerifier,
} from "./gateway";

function makeConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    port: 3001,
    upstream: "http://localhost:3000",
    authEnabled: true,
    defaultPolicy: "deny",
    ...overrides,
  };
}

describe("UnsafeStructuralVerifier", () => {
  const v = new UnsafeStructuralVerifier();

  it("accepts valid credential", async () => {
    const cred = JSON.stringify({
      agentId: "test-agent",
      permissions: ["read"],
    });
    const r = await v.verify(cred);
    expect(r.verified).toBe(true);
    expect(r.agentId).toBe("test-agent");
    expect(r.permissions).toEqual(["read"]);
  });

  it("rejects invalid JSON", async () => {
    const r = await v.verify("not-json");
    expect(r.verified).toBe(false);
  });

  it("rejects missing agentId", async () => {
    const r = await v.verify(JSON.stringify({ permissions: ["read"] }));
    expect(r.verified).toBe(false);
  });

  it("rejects non-array permissions", async () => {
    const r = await v.verify(JSON.stringify({ agentId: "x", permissions: "read" }));
    expect(r.verified).toBe(false);
  });

  it("rejects non-string permission values", async () => {
    const r = await v.verify(JSON.stringify({ agentId: "x", permissions: [1, 2] }));
    expect(r.verified).toBe(false);
    expect(r.reason).toBe("permissions must be strings");
  });

  it("rejects expired credential", async () => {
    const r = await v.verify(
      JSON.stringify({
        agentId: "x",
        permissions: ["read"],
        expiry: Math.floor(Date.now() / 1000) - 60,
      }),
    );
    expect(r.verified).toBe(false);
    expect(r.reason).toBe("expired");
  });

  it("accepts non-expired credential", async () => {
    const r = await v.verify(
      JSON.stringify({
        agentId: "x",
        permissions: ["read"],
        expiry: Math.floor(Date.now() / 1000) + 3600,
      }),
    );
    expect(r.verified).toBe(true);
  });
});

// Helper: sign a credential with HMAC-SHA256
async function signCredential(
  secret: string,
  data: { agentId: string; permissions: string[]; expiry?: number },
): Promise<string> {
  const payload = JSON.stringify({
    agentId: data.agentId,
    permissions: data.permissions,
    ...(data.expiry != null ? { expiry: data.expiry } : {}),
  });
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const hmac = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return JSON.stringify({ ...data, hmac });
}

const TEST_SECRET = "a]3f9k2!xP7mN4qR1sT8vW5yZ0bC6dEf"; // 32 chars

describe("SharedSecretVerifier", () => {
  const v = new SharedSecretVerifier(TEST_SECRET);

  it("accepts validly signed credential", async () => {
    const cred = await signCredential(TEST_SECRET, {
      agentId: "test-agent",
      permissions: ["read"],
      expiry: Math.floor(Date.now() / 1000) + 3600,
    });
    const r = await v.verify(cred);
    expect(r.verified).toBe(true);
    expect(r.agentId).toBe("test-agent");
    expect(r.permissions).toEqual(["read"]);
  });

  it("rejects credential without expiry", async () => {
    const cred = await signCredential(TEST_SECRET, {
      agentId: "test-agent",
      permissions: ["read"],
    });
    const r = await v.verify(cred);
    expect(r.verified).toBe(false);
    expect(r.reason).toBe("missing or invalid expiry (required)");
  });

  it("rejects credential with wrong secret", async () => {
    const cred = await signCredential("wrong-secret-that-is-long-enough!!", {
      agentId: "test-agent",
      permissions: ["read"],
      expiry: Math.floor(Date.now() / 1000) + 3600,
    });
    const r = await v.verify(cred);
    expect(r.verified).toBe(false);
    expect(r.reason).toBe("invalid hmac");
  });

  it("rejects credential with missing hmac", async () => {
    const cred = JSON.stringify({
      agentId: "test-agent",
      permissions: ["read"],
      expiry: Math.floor(Date.now() / 1000) + 3600,
    });
    const r = await v.verify(cred);
    expect(r.verified).toBe(false);
    expect(r.reason).toBe("missing hmac");
  });

  it("rejects credential with tampered permissions", async () => {
    const cred = await signCredential(TEST_SECRET, {
      agentId: "test-agent",
      permissions: ["read"],
      expiry: Math.floor(Date.now() / 1000) + 3600,
    });
    // Tamper: change permissions to admin
    const tampered = JSON.parse(cred);
    tampered.permissions = ["admin"];
    const r = await v.verify(JSON.stringify(tampered));
    expect(r.verified).toBe(false);
    expect(r.reason).toBe("invalid hmac");
  });

  it("rejects expired credential", async () => {
    const cred = await signCredential(TEST_SECRET, {
      agentId: "test-agent",
      permissions: ["read"],
      expiry: Math.floor(Date.now() / 1000) - 60,
    });
    const r = await v.verify(cred);
    expect(r.verified).toBe(false);
    expect(r.reason).toBe("expired");
  });

  it("throws if secret is too short", () => {
    expect(() => new SharedSecretVerifier("short")).toThrow("at least 32 characters");
  });
});

describe("createVerifier", () => {
  it("creates structural verifier", () => {
    expect(createVerifier("structural")).toBeInstanceOf(UnsafeStructuralVerifier);
  });

  it("throws for unknown type", () => {
    expect(() => createVerifier("magic")).toThrow("Unknown verifier type");
  });

  it("creates shared-secret verifier when AGENT_AUTH_SECRET is set", () => {
    const origSecret = process.env.AGENT_AUTH_SECRET;
    process.env.AGENT_AUTH_SECRET = TEST_SECRET;
    try {
      expect(createVerifier("shared-secret")).toBeInstanceOf(SharedSecretVerifier);
    } finally {
      if (origSecret === undefined) delete process.env.AGENT_AUTH_SECRET;
      else process.env.AGENT_AUTH_SECRET = origSecret;
    }
  });

  it("throws for shared-secret without AGENT_AUTH_SECRET", () => {
    const origSecret = process.env.AGENT_AUTH_SECRET;
    delete process.env.AGENT_AUTH_SECRET;
    try {
      expect(() => createVerifier("shared-secret")).toThrow("AGENT_AUTH_SECRET");
    } finally {
      if (origSecret !== undefined) process.env.AGENT_AUTH_SECRET = origSecret;
    }
  });
});

describe("AuthGateway", () => {
  function makeGateway(configOverrides: Partial<GatewayConfig> = {}) {
    return new AuthGateway(makeConfig(configOverrides), new UnsafeStructuralVerifier());
  }

  const readCred = JSON.stringify({
    agentId: "reader",
    permissions: ["read"],
  });
  const tradeCred = JSON.stringify({
    agentId: "trader",
    permissions: ["read", "trade"],
  });
  const adminCred = JSON.stringify({
    agentId: "admin",
    permissions: ["admin"],
  });

  it("allows everything when auth disabled", async () => {
    const gw = makeGateway({ authEnabled: false });
    expect(await gw.authorize(undefined, "robinhood_place_stock_order")).toBeNull();
  });

  it("denies missing credential", async () => {
    const gw = makeGateway();
    expect(await gw.authorize(undefined, "robinhood_get_portfolio")).toBe("Access denied");
  });

  it("denies invalid credential", async () => {
    const gw = makeGateway();
    expect(await gw.authorize("garbage", "robinhood_get_portfolio")).toBe("Access denied");
  });

  it("allows read agent to read", async () => {
    const gw = makeGateway();
    expect(await gw.authorize(readCred, "robinhood_get_portfolio")).toBeNull();
    expect(await gw.authorize(readCred, "robinhood_get_news")).toBeNull();
  });

  it("denies read agent from trading", async () => {
    const gw = makeGateway();
    expect(await gw.authorize(readCred, "robinhood_place_stock_order")).toBe("Access denied");
  });

  it("allows trade agent to trade", async () => {
    const gw = makeGateway();
    expect(await gw.authorize(tradeCred, "robinhood_place_stock_order")).toBeNull();
    expect(await gw.authorize(tradeCred, "robinhood_cancel_order")).toBeNull();
  });

  it("denies trade agent from account data", async () => {
    const gw = makeGateway();
    expect(await gw.authorize(tradeCred, "robinhood_get_account")).toBe("Access denied");
  });

  it("admin bypasses all permission checks", async () => {
    const gw = makeGateway();
    expect(await gw.authorize(adminCred, "robinhood_get_portfolio")).toBeNull();
    expect(await gw.authorize(adminCred, "robinhood_place_stock_order")).toBeNull();
    expect(await gw.authorize(adminCred, "robinhood_get_account")).toBeNull();
    expect(await gw.authorize(adminCred, "unknown-tool")).toBeNull();
  });

  it("denies unmapped tool with default-deny", async () => {
    const gw = makeGateway({ defaultPolicy: "deny" });
    expect(await gw.authorize(readCred, "unknown-tool")).toBe("Access denied");
  });

  it("allows unmapped tool with default-allow", async () => {
    const gw = makeGateway({ defaultPolicy: "allow" });
    expect(await gw.authorize(readCred, "unknown-tool")).toBeNull();
  });

  it("does not leak tool names or permissions in error messages", async () => {
    const gw = makeGateway();
    const result = await gw.authorize(readCred, "robinhood_place_stock_order");
    expect(result).toBe("Access denied");
    expect(result).not.toContain("robinhood_place_stock_order");
    expect(result).not.toContain("trade");
  });

  it("records decisions", async () => {
    const gw = makeGateway();
    await gw.authorize(readCred, "robinhood_get_portfolio");
    await gw.authorize(readCred, "robinhood_place_stock_order");
    const decisions = gw.getDecisions();
    expect(decisions).toHaveLength(2);
    expect(decisions[0].action).toBe("allow");
    expect(decisions[1].action).toBe("deny");
  });
});
