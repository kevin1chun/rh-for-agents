/**
 * Realized profit & loss tools — `robinhood_get_realized_pnl` and
 * `robinhood_get_pnl_trade_history`. They mirror the official Robinhood Trading MCP
 * tools of the same name, but the numbers are COMPUTED by us: Robinhood exposes no
 * standard-token REST endpoint for equity/option realized P&L (the app's PnL hub and
 * the official MCP's "Wormhole" service compute it; `/wormhole/*` returns 404).
 *
 * Fidelity, stated honestly in every result `note` (never inside the DTO objects):
 *  - Equity: independent ECONOMIC FIFO including fees — not Robinhood's booked or
 *    tax-adjusted figure (no wash-sale or non-FIFO lot-selection modeling; splits are
 *    not basis-adjusted; a sell exceeding recorded buys is flagged, not fabricated).
 *  - Crypto: Robinhood's native `gain_loss` (reshaped, not recomputed).
 *  - Options: NOT computed (expirations/assignments are not in the order history).
 *  - rate_of_realized_gain / total_rate_of_return: null — the denominator convention
 *    is not reproducible, and an invented percentage would mislead (scanner precedent).
 *
 * Results are complete, not paginated: `next_cursor` is always null (we never surface a
 * pagination cursor — those can encode account identifiers).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RealizedPnlData, RealizedPnlTrade } from "../../client/index.js";
import { bucketRealized, type Granularity } from "../../compute/realized-pnl.js";
import { getAuthenticatedRh, structured, textError } from "./_helpers.js";

const READ_ONLY = { readOnlyHint: true } as const;

const ASSET_CLASS = z.enum(["equity", "option", "crypto"]);

interface ResolvedWindow {
  start: string;
  end: string;
  window: string;
  granularity: Granularity;
}

/** Resolve a span/custom-date request into an absolute [start, end) window plus a bucket granularity. */
function resolveWindow(
  span: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
  trades: readonly RealizedPnlTrade[],
): ResolvedWindow {
  const now = new Date();
  let start: Date;
  let end: Date;
  let window: string;

  if (startDate) {
    start = new Date(`${startDate}T00:00:00Z`);
    // end_date is inclusive of the whole day → advance one day for the exclusive bound
    end = endDate ? new Date(new Date(`${endDate}T00:00:00Z`).getTime() + 86_400_000) : now;
    window = `${startDate}..${endDate ?? "now"}`;
  } else {
    const s = span ?? "3month";
    window = s;
    end = now;
    const d = new Date(now.getTime());
    if (s === "day") d.setUTCDate(d.getUTCDate() - 1);
    else if (s === "week") d.setUTCDate(d.getUTCDate() - 7);
    else if (s === "month") d.setUTCMonth(d.getUTCMonth() - 1);
    else if (s === "3month") d.setUTCMonth(d.getUTCMonth() - 3);
    else if (s === "year") d.setUTCFullYear(d.getUTCFullYear() - 1);
    else if (s === "ytd") d.setUTCFullYear(d.getUTCFullYear(), 0, 1);
    else if (s === "all") {
      const first = trades[0]?.closedAt;
      d.setTime(first ? new Date(first).getTime() : now.getTime());
    }
    start = d;
  }

  const days = (end.getTime() - start.getTime()) / 86_400_000;
  const granularity: Granularity = days <= 31 ? "day" : days <= 210 ? "week" : "month";
  return { start: start.toISOString(), end: end.toISOString(), window, granularity };
}

/** Fetch the full realized-P&L dataset for the computable asset classes (equity + crypto). */
async function fetchRealized(
  accountNumber: string,
  requested: string[] | undefined,
): Promise<{ data: RealizedPnlData; optionsRequested: boolean }> {
  const rh = await getAuthenticatedRh();
  // Default (omitted) means "all asset classes" per the official tool → includes options.
  const scope = requested ?? ["equity", "option", "crypto"];
  const optionsRequested = scope.includes("option");
  const computable = scope.filter(
    (c): c is "equity" | "crypto" => c === "equity" || c === "crypto",
  );
  const data = await rh.getRealizedPnl({ accountNumber, assetClasses: computable });
  return { data, optionsRequested };
}

/** Build the honest fidelity note shared by both tools, with conditional caveats. */
function buildNote(data: RealizedPnlData, optionsRequested: boolean, perTrade: boolean): string {
  const parts: string[] = [
    "Realized P&L is COMPUTED by robinhood-for-agents, not read from a Robinhood endpoint (none exists for equity/option). Equity: independent economic FIFO including fees — NOT Robinhood's booked or tax-adjusted numbers (wash sales and non-FIFO lot selection are not modeled; stock splits are not basis-adjusted). Crypto: Robinhood's native gain_loss.",
  ];
  if (perTrade) {
    parts.push("Results are complete (not paginated); next_cursor is always null.");
  } else {
    parts.push(
      "rate_of_realized_gain and total_rate_of_return are null: Robinhood's rate denominator convention is not reproducible, and an invented percentage would mislead. data_point buckets are our own time buckets — they tile the window exactly and their realized_gain sums to total_returns.",
    );
  }
  if (optionsRequested) {
    parts.push(
      "Options realized P&L is NOT included: option expirations and assignments/exercises are not in the order history. Use the Robinhood app for options P&L.",
    );
  }
  if (data.overrunSymbols.length > 0) {
    parts.push(
      `Basis is INCOMPLETE for: ${data.overrunSymbols.join(", ")} — a sell exceeded recorded buys (shares likely transferred in, a reward, or an unadjusted split). Their realized figures may be understated or partially omitted.`,
    );
  }
  return parts.join(" ");
}

export function registerPnlTools(server: McpServer): void {
  server.registerTool(
    "robinhood_get_realized_pnl",
    {
      title: "Get Realized P&L",
      description:
        "Realized profit & loss for an account over a time window — bucketed realized gain and the number of closing trades per bucket, plus window totals. COMPUTED by this server from your order history (Robinhood has no realized-P&L REST endpoint): equity uses independent economic FIFO including fees (not Robinhood's booked/tax number), crypto uses Robinhood's native gain_loss, and options are NOT included. rate_of_realized_gain and total_rate_of_return are returned as null — see the result `note`. Fetches full order history, so it can be slow on large accounts. For the per-trade list use robinhood_get_pnl_trade_history.",
      inputSchema: {
        account_number: z
          .string()
          .describe("Brokerage account number (from robinhood_get_accounts)."),
        asset_classes: z
          .array(ASSET_CLASS)
          .optional()
          .describe("Filter to equity/crypto (option is accepted but not computed). Omit for all."),
        span: z
          .enum(["day", "week", "month", "3month", "year", "all"])
          .optional()
          .describe("Preset window (default 3month). Mutually exclusive with start_date/end_date."),
        start_date: z
          .string()
          .optional()
          .describe("Custom window start, YYYY-MM-DD (with end_date)."),
        end_date: z.string().optional().describe("Custom window end, YYYY-MM-DD, inclusive."),
        display_currency: z.string().optional().describe("Currency for amounts; USD only."),
      },
      outputSchema: {
        account_number: z.string(),
        window: z.string(),
        display_currency: z.string(),
        data_points: z.array(
          z.object({
            start_time: z.string(),
            end_time: z.string(),
            realized_gain: z.number(),
            rate_of_realized_gain: z.null(),
            number_of_trades: z.number(),
          }),
        ),
        total_returns: z.number(),
        total_rate_of_return: z.null(),
        note: z.string(),
      },
      annotations: READ_ONLY,
    },
    async ({ account_number, asset_classes, span, start_date, end_date, display_currency }) => {
      try {
        const { data, optionsRequested } = await fetchRealized(account_number, asset_classes);
        const { start, end, window, granularity } = resolveWindow(
          span,
          start_date,
          end_date,
          data.trades,
        );
        const inWindow = data.trades.filter((t) => t.closedAt >= start && t.closedAt < end);
        const buckets = bucketRealized(inWindow, start, end, granularity);
        const total_returns = inWindow.reduce((s, t) => s + t.realizedGain, 0);
        return structured({
          account_number,
          window,
          display_currency: display_currency ?? "USD",
          data_points: buckets.map((b) => ({
            start_time: b.startTime,
            end_time: b.endTime,
            realized_gain: b.realizedGain,
            rate_of_realized_gain: null,
            number_of_trades: b.numberOfTrades,
          })),
          total_returns,
          total_rate_of_return: null,
          note: buildNote(data, optionsRequested, false),
        });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_pnl_trade_history",
    {
      title: "Get P&L Trade History",
      description:
        "Per-trade realized profit & loss — a chronological list of closing trades with symbol, side, quantity, price, and realized gain/loss. COMPUTED by this server from your order history: equity uses independent economic FIFO including fees (not Robinhood's booked/tax number), crypto uses Robinhood's native gain_loss, and options are NOT included. Results are complete (next_cursor is always null). For bucketed totals use robinhood_get_realized_pnl.",
      inputSchema: {
        account_number: z
          .string()
          .describe("Brokerage account number (from robinhood_get_accounts)."),
        span: z
          .enum(["week", "month", "3month", "ytd", "all"])
          .optional()
          .describe("Preset window (default week)."),
        symbol: z
          .string()
          .optional()
          .describe("Optional single stock/crypto symbol filter (uppercased)."),
      },
      outputSchema: {
        account_number: z.string(),
        span: z.string(),
        trades: z.array(
          z.object({
            symbol: z.string(),
            side: z.string(),
            quantity: z.number(),
            price: z.number(),
            realized_gain: z.number(),
          }),
        ),
        next_cursor: z.null(),
        note: z.string(),
      },
      annotations: READ_ONLY,
    },
    async ({ account_number, span, symbol }) => {
      try {
        const { data, optionsRequested } = await fetchRealized(account_number, undefined);
        const { start, end, window } = resolveWindow(
          span ?? "week",
          undefined,
          undefined,
          data.trades,
        );
        const wantSymbol = symbol?.trim().toUpperCase();
        const inWindow = data.trades.filter(
          (t) =>
            t.closedAt >= start &&
            t.closedAt < end &&
            (wantSymbol === undefined || t.symbol.toUpperCase() === wantSymbol),
        );
        return structured({
          account_number,
          span: window,
          trades: inWindow.map((t) => ({
            symbol: t.symbol,
            side: t.side,
            quantity: t.quantity,
            price: t.price,
            realized_gain: t.realizedGain,
          })),
          next_cursor: null,
          note: buildNote(data, optionsRequested, true),
        });
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
