/** Stock data tools for Robinhood. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAuthenticatedRh, text, textError } from "./_helpers.js";

export function registerStockTools(server: McpServer): void {
  server.tool(
    "robinhood_get_stock_quote",
    "Get quote and fundamentals for one or more stock or index tickers (SPX, NDX, VIX, RUT, XSP supported).",
    {
      symbols: z
        .string()
        .max(200)
        .describe('Comma-separated ticker symbols (e.g. "AAPL" or "AAPL,MSFT,GOOGL").'),
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
        return text(results);
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_get_historicals",
    "Get OHLCV price history for one or more stock tickers.",
    {
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
    async ({ symbols, interval, span, bounds }) => {
      try {
        const rh = await getAuthenticatedRh();
        const symbolList = symbols.split(",").map((s) => s.trim().toUpperCase());
        const data = await rh.getStockHistoricals(symbolList, { interval, span, bounds });
        return text({ historicals: data });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_get_fundamentals",
    "Get company fundamentals for one or more stocks: float, shares outstanding, market cap, P/E and P/B ratios, dividend schedule, 52-week range, and company profile (sector, industry, CEO, description). Fundamentals only — no live quote; use robinhood_get_stock_quote if you also need the current price.",
    {
      symbols: z
        .string()
        .max(200)
        .describe('Comma-separated ticker symbols (e.g. "AAPL" or "AAPL,MSFT,GOOGL").'),
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
        return text(results);
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_get_short_interest",
    "Get Robinhood's daily short-interest time series for a stock: modeled shares sold short and short interest as a percent of free float, each with upper/lower confidence bounds. NOTE: this is a modeled DAILY estimate (hence the bounds), NOT the official biweekly FINRA settlement figure. `pc_freefloat` is a percent (e.g. 8.23 = 8.23%). Omitting start_date returns the full available history (RH's series began ~mid-2025).",
    {
      symbol: z.string().describe('Stock ticker symbol (e.g. "AAPL").'),
      start_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "start_date must be YYYY-MM-DD")
        .optional()
        .describe(
          "Earliest date (YYYY-MM-DD) to include; narrows the series. Omit for full history.",
        ),
    },
    async ({ symbol, start_date }) => {
      try {
        const rh = await getAuthenticatedRh();
        const sym = symbol.trim().toUpperCase();
        const shortInterest = await rh.getShortInterest(sym, { startDate: start_date });
        return text({ symbol: sym, short_interest: shortInterest });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_get_news",
    "Get news, analyst ratings, and earnings for a stock symbol.",
    {
      symbol: z.string().describe("Stock ticker symbol."),
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
        return text({ news, ratings, earnings });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_search",
    "Search stocks by keyword or browse by market category tag.",
    {
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
    async ({ query, tag }) => {
      try {
        const rh = await getAuthenticatedRh();
        if (tag) {
          const data = await rh.getAllStocksFromMarketTag(tag);
          return text({ tag, results: data });
        }
        const data = await rh.findInstruments(query);
        return text({ query, results: data });
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
