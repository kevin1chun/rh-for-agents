/** Market movers tool for Robinhood. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAuthenticatedRh, text, textError } from "./_helpers.js";

export function registerMarketTools(server: McpServer): void {
  server.tool(
    "robinhood_get_movers",
    "Get market movers and popular stocks.",
    {
      category: z
        .enum(["top_movers", "sp500", "top_100"])
        .default("top_movers")
        .describe("What to fetch."),
      direction: z.enum(["up", "down"]).optional().describe("For sp500 movers - direction."),
    },
    async ({ category, direction }) => {
      try {
        const rh = await getAuthenticatedRh();

        if (category === "sp500") {
          if (!direction) {
            return textError("direction ('up' or 'down') is required for sp500 movers");
          }
          const data = await rh.getTopMoversSp500(direction);
          return text({ category: "sp500", direction, movers: data });
        }

        if (category === "top_100") {
          const data = await rh.getTop100();
          return text({ category: "top_100", stocks: data });
        }

        const data = await rh.getTopMovers();
        return text({ category: "top_movers", movers: data });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_get_indexes",
    "Get all tradable market indexes (SPX, NDX, VIX, RUT, XSP, …).",
    {},
    async () => {
      try {
        const rh = await getAuthenticatedRh();
        const indexes = await rh.getIndexInstruments();
        return text({ indexes });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_get_index_quotes",
    "Get current values for one or more index symbols.",
    {
      symbols: z.array(z.string()).min(1).describe('Index symbols, e.g. ["SPX", "VIX"].'),
    },
    async ({ symbols }) => {
      try {
        const rh = await getAuthenticatedRh();
        const quotes = await rh.getIndexQuotes(symbols);
        return text({ quotes });
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
