/**
 * Tool-permission mapping for robinhood-for-agents.
 * Matches the tiers documented in docs/AGENT-IDENTITY.md.
 */

export type Permission = "read" | "trade" | "account" | "admin";

export const TOOL_PERMISSIONS: Record<string, Permission[]> = {
  // Read tier — market data and portfolio viewing
  robinhood_get_portfolio: ["read"],
  robinhood_get_stock_quote: ["read"],
  robinhood_get_historicals: ["read"],
  robinhood_get_news: ["read"],
  robinhood_search: ["read"],
  robinhood_get_movers: ["read"],
  robinhood_get_crypto: ["read"],
  robinhood_get_options: ["read"],
  robinhood_get_orders: ["read"],
  robinhood_get_order_status: ["read"],
  robinhood_check_session: ["read"],

  // Trade tier — order management
  robinhood_place_stock_order: ["read", "trade"],
  robinhood_place_option_order: ["read", "trade"],
  robinhood_place_crypto_order: ["read", "trade"],
  robinhood_cancel_order: ["read", "trade"],

  // Account tier — sensitive account data
  robinhood_get_account: ["read", "account"],
  robinhood_get_accounts: ["read", "account"],

  // Admin-only — interactive login should only be triggered by admin agents
  robinhood_browser_login: ["admin"],
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
