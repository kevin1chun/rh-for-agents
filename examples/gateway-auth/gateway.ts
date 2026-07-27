/**
 * Auth gateway for robinhood-for-agents.
 *
 * Sits between agents and the MCP server, verifying identity and
 * enforcing per-tool permissions before forwarding requests.
 *
 * Implements the authorization proxy pattern from docs/AGENT-IDENTITY.md.
 */

import { type GatewayConfig, TOOL_PERMISSIONS } from "./config";

// ---------------------------------------------------------------------------
// Pluggable verifier interface
// ---------------------------------------------------------------------------

export interface VerificationResult {
  verified: boolean;
  agentId: string;
  permissions: string[];
  reason?: string;
}

export interface AgentVerifier {
  verify(credential: string): Promise<VerificationResult>;
}

/**
 * ⚠️  UNSAFE — development/demo verifier only.
 *
 * Checks JSON credential structure but performs NO cryptographic
 * verification. Any caller can self-assert any identity and permissions.
 * DO NOT use in production. Replace with a real verifier (JWT, DID, ZKP).
 */
export class UnsafeStructuralVerifier implements AgentVerifier {
  constructor() {
    console.warn(
      "[gateway] ⚠️  Using UnsafeStructuralVerifier — credentials are NOT verified. " +
        "For development only. Replace with a real AgentVerifier for production.",
    );
  }

  async verify(credential: string): Promise<VerificationResult> {
    try {
      const data = JSON.parse(credential);
      if (typeof data.agentId !== "string" || !data.agentId || !Array.isArray(data.permissions)) {
        return {
          verified: false,
          agentId: "",
          permissions: [],
          reason: "invalid credential format",
        };
      }
      // Validate permission values are strings
      if (!data.permissions.every((p: unknown) => typeof p === "string")) {
        return {
          verified: false,
          agentId: data.agentId,
          permissions: [],
          reason: "permissions must be strings",
        };
      }
      // Expiry is Unix seconds
      if (
        data.expiry != null &&
        (typeof data.expiry !== "number" || data.expiry < Date.now() / 1000)
      ) {
        return {
          verified: false,
          agentId: data.agentId,
          permissions: [],
          reason: "expired",
        };
      }
      return {
        verified: true,
        agentId: data.agentId,
        permissions: data.permissions,
      };
    } catch {
      return {
        verified: false,
        agentId: "",
        permissions: [],
        reason: "invalid credential",
      };
    }
  }
}

/**
 * Shared-secret verifier — minimal production-safe option.
 *
 * Validates credentials signed with a pre-shared secret (HMAC-SHA256).
 * The credential is a JSON object with an `hmac` field that must match
 * HMAC(secret, JSON.stringify({ agentId, permissions, expiry })).
 *
 * This is NOT equivalent to a proper identity system (JWT, DID, ZKP) but
 * it prevents callers from self-asserting arbitrary permissions.
 */
export class SharedSecretVerifier implements AgentVerifier {
  private secret: string;

  constructor(secret: string) {
    if (!secret || secret.length < 32) {
      throw new Error(
        "SharedSecretVerifier requires AGENT_AUTH_SECRET with at least 32 characters.",
      );
    }
    this.secret = secret;
  }

  async verify(credential: string): Promise<VerificationResult> {
    try {
      const data = JSON.parse(credential);
      if (typeof data.agentId !== "string" || !data.agentId || !Array.isArray(data.permissions)) {
        return {
          verified: false,
          agentId: "",
          permissions: [],
          reason: "invalid credential format",
        };
      }
      if (!data.permissions.every((p: unknown) => typeof p === "string")) {
        return {
          verified: false,
          agentId: data.agentId,
          permissions: [],
          reason: "permissions must be strings",
        };
      }
      // Expiry is required for shared-secret credentials
      if (!Number.isFinite(data.expiry) || data.expiry <= 0 || !Number.isInteger(data.expiry)) {
        return {
          verified: false,
          agentId: data.agentId,
          permissions: [],
          reason: "missing or invalid expiry (required)",
        };
      }
      if (data.expiry < Date.now() / 1000) {
        return {
          verified: false,
          agentId: data.agentId,
          permissions: [],
          reason: "expired",
        };
      }
      // Verify HMAC
      if (typeof data.hmac !== "string") {
        return {
          verified: false,
          agentId: data.agentId,
          permissions: [],
          reason: "missing hmac",
        };
      }
      const payload = JSON.stringify({
        agentId: data.agentId,
        permissions: data.permissions,
        ...(data.expiry != null ? { expiry: data.expiry } : {}),
      });
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(this.secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
      const expected = Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      // Constant-time comparison (length-safe)
      if (expected.length !== data.hmac.length || !timingSafeEqual(expected, data.hmac)) {
        return {
          verified: false,
          agentId: data.agentId,
          permissions: [],
          reason: "invalid hmac",
        };
      }
      return {
        verified: true,
        agentId: data.agentId,
        permissions: data.permissions,
      };
    } catch {
      return {
        verified: false,
        agentId: "",
        permissions: [],
        reason: "invalid credential",
      };
    }
  }
}

/** Constant-time string comparison to prevent timing attacks. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ---------------------------------------------------------------------------
// Verifier factory
// ---------------------------------------------------------------------------

export function createVerifier(type: string): AgentVerifier {
  if (type === "structural") return new UnsafeStructuralVerifier();
  if (type === "shared-secret") {
    const secret = process.env.AGENT_AUTH_SECRET;
    if (!secret) {
      throw new Error(
        "AGENT_AUTH_SECRET environment variable is required for shared-secret verifier. " +
          "Generate one with: openssl rand -hex 32",
      );
    }
    return new SharedSecretVerifier(secret);
  }
  throw new Error(
    `Unknown verifier type: "${type}". Available: structural (dev only), shared-secret. ` +
      `For production, use shared-secret or implement the AgentVerifier interface.`,
  );
}

// ---------------------------------------------------------------------------
// Decision log (ring buffer)
// ---------------------------------------------------------------------------

export interface AuthDecision {
  action: "allow" | "deny";
  agentId: string;
  tool: string;
  reason: string;
  timestamp: number;
}

const MAX_DECISIONS = 1000;

class DecisionLog {
  private buf: (AuthDecision | null)[];
  private idx = 0;
  private count = 0;

  constructor(capacity = MAX_DECISIONS) {
    this.buf = new Array(capacity).fill(null);
  }

  push(d: AuthDecision) {
    this.buf[this.idx] = d;
    this.idx = (this.idx + 1) % this.buf.length;
    if (this.count < this.buf.length) this.count++;
  }

  toArray(): AuthDecision[] {
    const out: AuthDecision[] = [];
    const start = this.count < this.buf.length ? 0 : this.idx;
    for (let i = 0; i < this.count; i++) {
      const entry = this.buf[(start + i) % this.buf.length];
      if (entry) out.push(entry);
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Gateway
// ---------------------------------------------------------------------------

export class AuthGateway {
  private config: GatewayConfig;
  private verifier: AgentVerifier;
  private decisions = new DecisionLog();

  constructor(config: GatewayConfig, verifier: AgentVerifier) {
    this.config = config;
    this.verifier = verifier;
  }

  /**
   * Check if a request should be forwarded to the upstream MCP server.
   *
   * @param credential - Agent credential from X-Agent-Credential header
   * @param toolName - The MCP tool being called
   * @returns null if authorized, error message if denied
   */
  async authorize(credential: string | undefined, toolName: string): Promise<string | null> {
    if (!this.config.authEnabled) return null;

    if (!credential) {
      this.record("deny", "", toolName, "no credential");
      return "Access denied";
    }

    const result = await this.verifier.verify(credential);
    if (!result.verified) {
      this.record("deny", result.agentId, toolName, result.reason || "verification failed");
      return "Access denied";
    }

    // Admin bypasses per-tool checks
    if (result.permissions.includes("admin")) {
      this.record("allow", result.agentId, toolName, "admin");
      return null;
    }

    // Check tool permissions
    const required = TOOL_PERMISSIONS[toolName];
    if (!required) {
      if (this.config.defaultPolicy === "deny") {
        this.record("deny", result.agentId, toolName, "unmapped tool");
        return "Access denied";
      }
      this.record("allow", result.agentId, toolName, "unmapped (policy: allow)");
      return null;
    }

    const missing = required.filter((p) => !result.permissions.includes(p));
    if (missing.length > 0) {
      this.record("deny", result.agentId, toolName, `missing: ${missing.join(", ")}`);
      return "Access denied";
    }

    this.record("allow", result.agentId, toolName, "authorized");
    return null;
  }

  private record(action: "allow" | "deny", agentId: string, tool: string, reason: string) {
    const decision: AuthDecision = {
      action,
      agentId,
      tool,
      reason,
      timestamp: Date.now(),
    };
    this.decisions.push(decision);
    // Structured log for durable audit trail
    const level = action === "deny" ? "warn" : "info";
    console[level](
      `[gateway] ${action.toUpperCase()} agent=${agentId || "(none)"} tool=${tool} reason=${reason}`,
    );
  }

  getDecisions(): AuthDecision[] {
    return this.decisions.toArray();
  }
}
