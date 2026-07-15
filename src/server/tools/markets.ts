/** Market movers tool for Robinhood. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAuthenticatedRh, structured, textError } from "./_helpers.js";

const READ_ONLY = { readOnlyHint: true } as const;

export function registerMarketTools(server: McpServer): void {
  server.registerTool(
    "robinhood_get_movers",
    {
      title: "Get Market Movers",
      description: "Get market movers and popular stocks.",
      inputSchema: {
        category: z
          .enum(["top_movers", "sp500", "top_100"])
          .default("top_movers")
          .describe("What to fetch."),
        direction: z.enum(["up", "down"]).optional().describe("For sp500 movers - direction."),
      },
      outputSchema: {
        category: z.string(),
        direction: z.string().optional(),
        movers: z.array(z.unknown()).optional(),
        stocks: z.array(z.unknown()).optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ category, direction }) => {
      try {
        const rh = await getAuthenticatedRh();

        if (category === "sp500") {
          if (!direction) {
            return textError("direction ('up' or 'down') is required for sp500 movers");
          }
          const data = await rh.getTopMoversSp500(direction);
          return structured({ category: "sp500", direction, movers: data });
        }

        if (category === "top_100") {
          const data = await rh.getTop100();
          return structured({ category: "top_100", stocks: data });
        }

        const data = await rh.getTopMovers();
        return structured({ category: "top_movers", movers: data });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_indexes",
    {
      title: "Get Market Indexes",
      description: "Get all tradable market indexes (SPX, NDX, VIX, RUT, XSP, …).",
      inputSchema: {},
      outputSchema: {
        indexes: z.array(z.unknown()),
      },
      annotations: READ_ONLY,
    },
    async () => {
      try {
        const rh = await getAuthenticatedRh();
        const indexes = await rh.getIndexInstruments();
        return structured({ indexes });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_index_quotes",
    {
      title: "Get Index Quotes",
      description: "Get current values for one or more index symbols.",
      inputSchema: {
        symbols: z.array(z.string()).min(1).describe('Index symbols, e.g. ["SPX", "VIX"].'),
      },
      outputSchema: {
        quotes: z.array(z.unknown()),
      },
      annotations: READ_ONLY,
    },
    async ({ symbols }) => {
      try {
        const rh = await getAuthenticatedRh();
        const quotes = await rh.getIndexQuotes(symbols);
        return structured({ quotes });
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
