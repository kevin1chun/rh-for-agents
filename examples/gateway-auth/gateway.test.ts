import { describe, it, expect } from "bun:test";
import { AuthGateway, UnsafeStructuralVerifier, createVerifier } from "./gateway";
import type { GatewayConfig } from "./config";

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
    const r = await v.verify(
      JSON.stringify({ agentId: "x", permissions: "read" }),
    );
    expect(r.verified).toBe(false);
  });

  it("rejects non-string permission values", async () => {
    const r = await v.verify(
      JSON.stringify({ agentId: "x", permissions: [1, 2] }),
    );
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

describe("createVerifier", () => {
  it("creates structural verifier", () => {
    expect(createVerifier("structural")).toBeInstanceOf(
      UnsafeStructuralVerifier,
    );
  });

  it("throws for unknown type", () => {
    expect(() => createVerifier("magic")).toThrow("Unknown verifier type");
  });
});

describe("AuthGateway", () => {
  function makeGateway(configOverrides: Partial<GatewayConfig> = {}) {
    return new AuthGateway(
      makeConfig(configOverrides),
      new UnsafeStructuralVerifier(),
    );
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
    expect(await gw.authorize(undefined, "place-order")).toBeNull();
  });

  it("denies missing credential", async () => {
    const gw = makeGateway();
    expect(await gw.authorize(undefined, "get-portfolio")).toBe(
      "Access denied",
    );
  });

  it("denies invalid credential", async () => {
    const gw = makeGateway();
    expect(await gw.authorize("garbage", "get-portfolio")).toBe(
      "Access denied",
    );
  });

  it("allows read agent to read", async () => {
    const gw = makeGateway();
    expect(await gw.authorize(readCred, "get-portfolio")).toBeNull();
    expect(await gw.authorize(readCred, "get-news")).toBeNull();
  });

  it("denies read agent from trading", async () => {
    const gw = makeGateway();
    expect(await gw.authorize(readCred, "place-order")).toBe("Access denied");
  });

  it("allows trade agent to trade", async () => {
    const gw = makeGateway();
    expect(await gw.authorize(tradeCred, "place-order")).toBeNull();
    expect(await gw.authorize(tradeCred, "cancel-order")).toBeNull();
  });

  it("denies trade agent from account data", async () => {
    const gw = makeGateway();
    expect(await gw.authorize(tradeCred, "get-account")).toBe("Access denied");
  });

  it("admin bypasses all permission checks", async () => {
    const gw = makeGateway();
    expect(await gw.authorize(adminCred, "get-portfolio")).toBeNull();
    expect(await gw.authorize(adminCred, "place-order")).toBeNull();
    expect(await gw.authorize(adminCred, "get-account")).toBeNull();
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
    const result = await gw.authorize(readCred, "place-order");
    expect(result).toBe("Access denied");
    expect(result).not.toContain("place-order");
    expect(result).not.toContain("trade");
  });

  it("records decisions", async () => {
    const gw = makeGateway();
    await gw.authorize(readCred, "get-portfolio");
    await gw.authorize(readCred, "place-order");
    const decisions = gw.getDecisions();
    expect(decisions).toHaveLength(2);
    expect(decisions[0].action).toBe("allow");
    expect(decisions[1].action).toBe("deny");
  });
});
