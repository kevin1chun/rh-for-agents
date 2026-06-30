/**
 * Auth gateway for robinhood-for-agents.
 *
 * Sits between agents and the MCP server, verifying identity and
 * enforcing per-tool permissions before forwarding requests.
 *
 * Implements the authorization proxy pattern from docs/AGENT-IDENTITY.md.
 */

import { TOOL_PERMISSIONS, type GatewayConfig, type Permission } from "./config";

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
      if (
        typeof data.agentId !== "string" ||
        !data.agentId ||
        !Array.isArray(data.permissions)
      ) {
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

// ---------------------------------------------------------------------------
// Verifier factory
// ---------------------------------------------------------------------------

export function createVerifier(type: string): AgentVerifier {
  if (type === "structural") return new UnsafeStructuralVerifier();
  throw new Error(
    `Unknown verifier type: "${type}". Available: structural. ` +
      `For production, implement the AgentVerifier interface.`,
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
  async authorize(
    credential: string | undefined,
    toolName: string,
  ): Promise<string | null> {
    if (!this.config.authEnabled) return null;

    if (!credential) {
      this.record("deny", "", toolName, "no credential");
      return "Access denied";
    }

    const result = await this.verifier.verify(credential);
    if (!result.verified) {
      this.record(
        "deny",
        result.agentId,
        toolName,
        result.reason || "verification failed",
      );
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
      this.record(
        "allow",
        result.agentId,
        toolName,
        "unmapped (policy: allow)",
      );
      return null;
    }

    const missing = required.filter(
      (p) => !result.permissions.includes(p),
    );
    if (missing.length > 0) {
      this.record(
        "deny",
        result.agentId,
        toolName,
        `missing: ${missing.join(", ")}`,
      );
      return "Access denied";
    }

    this.record("allow", result.agentId, toolName, "authorized");
    return null;
  }

  private record(
    action: "allow" | "deny",
    agentId: string,
    tool: string,
    reason: string,
  ) {
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
