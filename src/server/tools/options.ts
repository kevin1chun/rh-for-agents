/** Options data tool for Robinhood. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { OptionInstrument } from "../../client/types.js";
import { getAuthenticatedRh, structured, textError } from "./_helpers.js";

const READ_ONLY = { readOnlyHint: true } as const;

/** Keep only the N strikes closest to the current price. */
function filterNearestStrikes(
  options: OptionInstrument[],
  currentPrice: number,
  maxStrikes: number,
): OptionInstrument[] {
  const uniqueStrikes = [...new Set(options.map((o) => Number(o.strike_price)))];
  uniqueStrikes.sort((a, b) => Math.abs(a - currentPrice) - Math.abs(b - currentPrice));
  const keepStrikes = new Set(uniqueStrikes.slice(0, maxStrikes));
  return options.filter((o) => keepStrikes.has(Number(o.strike_price)));
}

export function registerOptionsTools(server: McpServer): void {
  server.registerTool(
    "robinhood_get_options",
    {
      title: "Get Options Chain",
      description:
        "Get options chain with greeks for a stock or index symbol (SPX, NDX, VIX, RUT, XSP supported).",
      inputSchema: {
        symbol: z.string().describe("Stock or index ticker symbol."),
        expiration_date: z.string().optional().describe("Filter by expiration date (YYYY-MM-DD)."),
        strike_price: z.number().optional().describe("Filter by strike price."),
        option_type: z.enum(["call", "put"]).optional().describe("Filter by type."),
        max_strikes: z
          .number()
          .optional()
          .describe("Limit to N strikes nearest to current price (ATM). Reduces response size."),
      },
      outputSchema: {
        chain_info: z.unknown().optional(),
        index_value: z.unknown().optional(),
        market_data: z.unknown().optional(),
        options: z.array(z.unknown()).optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ symbol, expiration_date, strike_price, option_type, max_strikes }) => {
      try {
        const rh = await getAuthenticatedRh();
        const s = symbol.trim().toUpperCase();
        const result: Record<string, unknown> = {};

        const chain = await rh.getChains(s, { expirationDate: expiration_date });
        result.chain_info = chain;

        const indexValue = await rh.getIndexValue(s);
        if (indexValue) {
          result.index_value = indexValue;
        }

        let options = await rh.findTradableOptions(s, {
          expirationDate: expiration_date,
          strikePrice: strike_price,
          optionType: option_type,
        });

        // Filter to nearest strikes if requested
        if (max_strikes != null && strike_price == null && options.length > 0) {
          let currentPrice = 0;
          if (indexValue?.value) {
            currentPrice = Number(indexValue.value);
          } else {
            const quotes = await rh.getQuotes([s]);
            const price = quotes[0]?.last_trade_price;
            if (price) currentPrice = Number(price);
          }
          if (currentPrice > 0) {
            options = filterNearestStrikes(options, currentPrice, max_strikes);
          }
        }

        if (expiration_date && strike_price != null && option_type) {
          const marketData = await rh.getOptionMarketData(
            s,
            expiration_date,
            strike_price,
            option_type,
          );
          result.market_data = marketData;
        }

        result.options = options;
        return structured(result);
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_option_positions",
    {
      title: "Get Option Positions",
      description:
        "Get open option positions. Per-leg by default, or grouped by strategy (spreads, condors).",
      inputSchema: {
        account_number: z.string().optional().describe("Specific account number, or omit for all."),
        aggregate: z
          .boolean()
          .default(false)
          .describe("Group by strategy instead of returning individual legs."),
        nonzero: z.boolean().default(true).describe("Only positions with a non-zero quantity."),
      },
      outputSchema: {
        positions: z.array(z.unknown()),
        aggregate: z.boolean(),
      },
      annotations: READ_ONLY,
    },
    async ({ account_number, aggregate, nonzero }) => {
      try {
        const rh = await getAuthenticatedRh();
        const positions = aggregate
          ? await rh.getOptionAggregatePositions({ accountNumber: account_number, nonzero })
          : await rh.getOptionPositions({ accountNumber: account_number, nonzero });
        return structured({ positions, aggregate });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_option_orders",
    {
      title: "Get Option Orders",
      description:
        "Get option order history (filled, cancelled, and open multi-leg orders) — the dedicated, official-parity option order-history view: no account_number scoping, no result limit (mirrors Robinhood's own option-orders tool exactly). Prefer robinhood_get_orders when you need account_number scoping, a result limit, or a single tool that also covers stock/crypto order history.",
      inputSchema: {
        open_only: z.boolean().default(false).describe("Only return open (unfilled) orders."),
      },
      outputSchema: {
        orders: z.array(z.unknown()),
      },
      annotations: READ_ONLY,
    },
    async ({ open_only }) => {
      try {
        const rh = await getAuthenticatedRh();
        const orders = open_only ? await rh.getOpenOptionOrders() : await rh.getAllOptionOrders();
        return structured({ orders });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_option_historicals",
    {
      title: "Get Option Historicals",
      description: "Get historical OHLC price series for a specific option contract.",
      inputSchema: {
        symbol: z.string().describe("Underlying ticker symbol."),
        expiration_date: z.string().describe("Option expiration date (YYYY-MM-DD)."),
        strike_price: z.number().describe("Strike price."),
        option_type: z.enum(["call", "put"]).describe("Option type."),
        span: z
          .enum(["day", "week", "month", "3month", "year", "5year"])
          .default("day")
          .describe("Time span of the series."),
        interval: z
          .enum(["5minute", "10minute", "hour", "day", "week"])
          .default("hour")
          .describe("Candle interval."),
      },
      outputSchema: {
        historicals: z.unknown(),
      },
      annotations: READ_ONLY,
    },
    async ({ symbol, expiration_date, strike_price, option_type, span, interval }) => {
      try {
        const rh = await getAuthenticatedRh();
        const historicals = await rh.getOptionHistoricals(
          symbol.trim().toUpperCase(),
          expiration_date,
          strike_price,
          option_type,
          { span, interval },
        );
        return structured({ historicals });
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
