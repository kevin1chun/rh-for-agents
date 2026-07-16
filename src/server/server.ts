/** MCP server for robinhood-for-agents. */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VERSION } from "../version.js";
import { registerAuthTools } from "./tools/auth.js";
import { registerCryptoTools } from "./tools/crypto.js";
import { registerMarketTools } from "./tools/markets.js";
import { registerOptionsTools } from "./tools/options.js";
import { registerOrderTools } from "./tools/orders.js";
import { registerPnlTools } from "./tools/pnl.js";
import { registerPortfolioTools } from "./tools/portfolio.js";
import { registerReviewTools } from "./tools/review.js";
import { registerScannerTools } from "./tools/scanners.js";
import { registerStockTools } from "./tools/stocks.js";
import { registerTaxLotTools } from "./tools/tax-lots.js";
import { registerWatchlistTools } from "./tools/watchlists.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "robinhood-for-agents",
    version: VERSION,
  });

  registerAuthTools(server);
  registerPortfolioTools(server);
  registerStockTools(server);
  registerOptionsTools(server);
  registerCryptoTools(server);
  registerOrderTools(server);
  registerMarketTools(server);
  registerWatchlistTools(server);
  registerScannerTools(server);
  registerPnlTools(server);
  registerReviewTools(server);
  registerTaxLotTools(server);

  return server;
}
