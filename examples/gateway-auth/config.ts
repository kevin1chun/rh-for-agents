/**
 * Tool-permission mapping for robinhood-for-agents.
 * Matches the tiers documented in docs/AGENT-IDENTITY.md.
 */

export type Permission = "read" | "trade" | "account" | "admin";

export const TOOL_PERMISSIONS: Record<string, Permission[]> = {
  // Read tier — market data and portfolio viewing
  "get-portfolio": ["read"],
  "get-watchlist": ["read"],
  "get-positions": ["read"],
  "get-holdings": ["read"],
  "search-stocks": ["read"],
  "get-stock-quote": ["read"],
  "get-stock-history": ["read"],
  "get-options-chain": ["read"],
  "get-news": ["read"],
  "get-orders": ["read"],

  // Trade tier — order management
  "place-order": ["read", "trade"],
  "cancel-order": ["read", "trade"],

  // Account tier — sensitive account data
  "get-account": ["read", "account"],
  "get-transfers": ["read", "account"],
};

export interface GatewayConfig {
  /** Gateway listen port */
  port: number;
  /** Upstream MCP server URL */
  upstream: string;
  /** Enable identity verification */
  authEnabled: boolean;
  /** Default policy for unmapped tools: "deny" blocks, "allow" passes */
  defaultPolicy: "allow" | "deny";
}

export function configFromEnv(): GatewayConfig {
  const port = parseInt(process.env.GATEWAY_PORT || "3001", 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid GATEWAY_PORT: ${process.env.GATEWAY_PORT}`);
  }

  const rawPolicy = process.env.AGENT_AUTH_DEFAULT_POLICY || "deny";
  if (rawPolicy !== "allow" && rawPolicy !== "deny") {
    throw new Error(
      `Invalid AGENT_AUTH_DEFAULT_POLICY: "${rawPolicy}". Must be "allow" or "deny".`,
    );
  }

  return {
    port,
    upstream: process.env.MCP_UPSTREAM || "http://localhost:3000",
    authEnabled: process.env.AGENT_AUTH_ENABLED === "true",
    defaultPolicy: rawPolicy,
  };
}
