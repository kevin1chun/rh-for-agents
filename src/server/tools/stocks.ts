/** Stock data tools for Robinhood. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAuthenticatedRh, structured, textError } from "./_helpers.js";

const READ_ONLY = { readOnlyHint: true } as const;

export function registerStockTools(server: McpServer): void {
  server.registerTool(
    "robinhood_get_stock_quote",
    {
      title: "Get Stock Quote",
      description:
        "Get a live quote plus fundamentals for one or more stock or index tickers (SPX, NDX, VIX, RUT, XSP supported). Use this when you need the current price. For fundamentals only (no live quote), use robinhood_get_fundamentals.",
      inputSchema: {
        symbols: z
          .string()
          .max(200)
          .describe('Comma-separated ticker symbols (e.g. "AAPL" or "AAPL,MSFT,GOOGL").'),
      },
      // Keyed dynamically by uppercased symbol — a raw shape can't express
      // that. z.record() would be the natural fit, but the installed SDK's
      // normalizeObjectSchema() only recognizes actual ZodObject schemas
      // (checks def.type === 'object'); a bare z.record() crashes output
      // validation (its def.type is 'record'). A loose empty object schema
      // IS a ZodObject and validates any key/value shape.
      outputSchema: z.looseObject({}),
      annotations: READ_ONLY,
    },
    async ({ symbols }) => {
      try {
        const rh = await getAuthenticatedRh();
        const symbolList = symbols.split(",").map((s) => s.trim().toUpperCase());
        const quotes = await rh.getQuotes(symbolList);
        const fundamentals = await rh.getFundamentals(symbolList);

        const results: Record<string, unknown> = {};
        for (let i = 0; i < symbolList.length; i++) {
          const sym = symbolList[i] as string;
          const quote = quotes[i];
          if (quote && Object.keys(quote).length > 0) {
            results[sym] = {
              quote,
              fundamentals: fundamentals[i] ?? {},
            };
          } else {
            // Fallback: try index value for symbols like SPX, NDX, VIX
            const indexValue = await rh.getIndexValue(sym);
            if (indexValue) {
              results[sym] = { index_value: indexValue };
            } else {
              results[sym] = { quote: {}, fundamentals: fundamentals[i] ?? {} };
            }
          }
        }
        return structured(results);
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_historicals",
    {
      title: "Get Stock Historicals",
      description: "Get OHLCV price history for one or more stock tickers.",
      inputSchema: {
        symbols: z.string().describe("Comma-separated ticker symbols."),
        interval: z
          .enum(["5minute", "10minute", "hour", "day", "week"])
          .default("day")
          .describe("Candle interval."),
        span: z
          .enum(["day", "week", "month", "3month", "year", "5year"])
          .default("month")
          .describe("Time span."),
        bounds: z
          .enum(["regular", "extended", "trading"])
          .default("regular")
          .describe("Trading session."),
      },
      outputSchema: {
        historicals: z.unknown(),
      },
      annotations: READ_ONLY,
    },
    async ({ symbols, interval, span, bounds }) => {
      try {
        const rh = await getAuthenticatedRh();
        const symbolList = symbols.split(",").map((s) => s.trim().toUpperCase());
        const data = await rh.getStockHistoricals(symbolList, { interval, span, bounds });
        return structured({ historicals: data });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_fundamentals",
    {
      title: "Get Fundamentals",
      description:
        "Get company fundamentals for one or more stocks: float, shares outstanding, market cap, P/E and P/B ratios, dividend schedule, 52-week range, and company profile (sector, industry, CEO, description). Fundamentals only — no live quote; use robinhood_get_stock_quote if you also need the current price.",
      inputSchema: {
        symbols: z
          .string()
          .max(200)
          .describe('Comma-separated ticker symbols (e.g. "AAPL" or "AAPL,MSFT,GOOGL").'),
      },
      // Keyed dynamically by uppercased symbol — see robinhood_get_stock_quote
      // for why a loose empty object (not z.record()) is used here.
      outputSchema: z.looseObject({}),
      annotations: READ_ONLY,
    },
    async ({ symbols }) => {
      try {
        const rh = await getAuthenticatedRh();
        const symbolList = symbols.split(",").map((s) => s.trim().toUpperCase());
        const fundamentals = await rh.getFundamentals(symbolList);

        const results: Record<string, unknown> = {};
        for (let i = 0; i < symbolList.length; i++) {
          const sym = symbolList[i] as string;
          results[sym] = fundamentals[i] ?? {};
        }
        return structured(results);
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_short_interest",
    {
      title: "Get Short Interest",
      description:
        "Get Robinhood's daily short-interest time series for a stock: modeled shares sold short and short interest as a percent of free float, each with upper/lower confidence bounds. NOTE: this is a modeled DAILY estimate (hence the bounds), NOT the official biweekly FINRA settlement figure. `pc_freefloat` is a percent (e.g. 8.23 = 8.23%). Omitting start_date returns the full available history (RH's series began ~mid-2025).",
      inputSchema: {
        symbol: z.string().describe('Stock ticker symbol (e.g. "AAPL").'),
        start_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "start_date must be YYYY-MM-DD")
          .optional()
          .describe(
            "Earliest date (YYYY-MM-DD) to include; narrows the series. Omit for full history.",
          ),
      },
      outputSchema: {
        symbol: z.string(),
        short_interest: z.unknown(),
      },
      annotations: READ_ONLY,
    },
    async ({ symbol, start_date }) => {
      try {
        const rh = await getAuthenticatedRh();
        const sym = symbol.trim().toUpperCase();
        const shortInterest = await rh.getShortInterest(sym, { startDate: start_date });
        return structured({ symbol: sym, short_interest: shortInterest });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_news",
    {
      title: "Get Stock News",
      description: "Get news, analyst ratings, and earnings for a stock symbol.",
      inputSchema: {
        symbol: z.string().describe("Stock ticker symbol."),
      },
      outputSchema: {
        news: z.unknown(),
        ratings: z.unknown(),
        earnings: z.unknown(),
      },
      annotations: READ_ONLY,
    },
    async ({ symbol }) => {
      try {
        const rh = await getAuthenticatedRh();
        const s = symbol.trim().toUpperCase();
        const [news, ratings, earnings] = await Promise.all([
          rh.getNews(s),
          rh.getRatings(s),
          rh.getEarnings(s),
        ]);
        return structured({ news, ratings, earnings });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_search",
    {
      title: "Search Stocks",
      description: "Search stocks by keyword or browse by market category tag.",
      inputSchema: {
        query: z
          .string()
          .describe(
            'Search keyword (e.g. "Apple", "electric vehicles"). Ignored if tag is provided.',
          ),
        tag: z
          .string()
          .optional()
          .describe('Market category tag (e.g. "technology", "most-popular-under-25").'),
      },
      outputSchema: {
        query: z.string().optional(),
        tag: z.string().optional(),
        results: z.array(z.unknown()),
      },
      annotations: READ_ONLY,
    },
    async ({ query, tag }) => {
      try {
        const rh = await getAuthenticatedRh();
        if (tag) {
          const data = await rh.getAllStocksFromMarketTag(tag);
          return structured({ tag, results: data });
        }
        const data = await rh.findInstruments(query);
        return structured({ query, results: data });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_equity_price_book",
    {
      title: "Get Equity Price Book",
      description:
        "Get the Level-2 price book (aggregated bid/ask depth) for a stock. Depth is populated during market hours.",
      inputSchema: {
        symbol: z.string().describe("Stock ticker symbol."),
      },
      outputSchema: {
        price_book: z.unknown(),
      },
      annotations: READ_ONLY,
    },
    async ({ symbol }) => {
      try {
        const rh = await getAuthenticatedRh();
        const price_book = await rh.getPriceBook(symbol.trim().toUpperCase());
        return structured({ price_book });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_earnings_results",
    {
      title: "Get Earnings Results",
      description:
        "Get historical and upcoming earnings (EPS estimate vs. actual, report date/timing) for one symbol.",
      inputSchema: {
        symbol: z.string().describe("Stock ticker symbol."),
      },
      outputSchema: {
        symbol: z.string(),
        earnings: z.unknown(),
      },
      annotations: READ_ONLY,
    },
    async ({ symbol }) => {
      try {
        const rh = await getAuthenticatedRh();
        const earnings = await rh.getEarnings(symbol.trim().toUpperCase());
        return structured({ symbol: symbol.trim().toUpperCase(), earnings });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_earnings_calendar",
    {
      title: "Get Earnings Calendar",
      description:
        "Get the market-wide earnings calendar for a window of days (all reporting companies).",
      inputSchema: {
        range_days: z
          .number()
          .int()
          .default(7)
          .describe(
            "Window size: positive = upcoming (e.g. 7 = next 7 days), negative = look-back.",
          ),
      },
      outputSchema: {
        range_days: z.number(),
        count: z.number(),
        calendar: z.array(z.unknown()),
      },
      annotations: READ_ONLY,
    },
    async ({ range_days }) => {
      try {
        const rh = await getAuthenticatedRh();
        const calendar = await rh.getEarningsCalendar(range_days);
        return structured({ range_days, count: calendar.length, calendar });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_equity_tradability",
    {
      title: "Get Equity Tradability",
      description:
        "Get tradability flags (tradeable, fractional, short-selling, per-account) for one or more symbols.",
      inputSchema: {
        symbols: z.array(z.string()).min(1).describe('Ticker symbols, e.g. ["AAPL", "MSFT"].'),
      },
      outputSchema: {
        tradability: z.array(z.unknown()),
      },
      annotations: READ_ONLY,
    },
    async ({ symbols }) => {
      try {
        const rh = await getAuthenticatedRh();
        const tradability = await rh.getTradability(symbols);
        return structured({ tradability });
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
