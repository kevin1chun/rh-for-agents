/**
 * Order-review tools — `robinhood_review_equity_order` and
 * `robinhood_review_option_order`. They mirror the official Robinhood Trading MCP
 * tools of the same name: a pre-trade SIMULATION that places NOTHING. They are
 * the "review" half of the review → show-user → place two-step gate.
 *
 * Reimplemented over read-only, standard-token GETs (the app's own order-preview
 * preflight: `order_checks/presubmit_data`, options `collateral`) plus a live
 * quote — NOT the agentic-account-only order-checks POST. Read-only.
 *
 * Fidelity (honest-fidelity rule — provenance lives in the result `note`, never
 * inside the DTO):
 *  - `order_checks` reproduces Robinhood's "extremely marketable / unmarketable"
 *    limit/stop PRICE COLLAR from the account's live `threshold_servars` — the
 *    single highest-value check for an agent caller (it catches a fat-fingered
 *    price, e.g. a buy limit 10× above the market). It is `{}` ONLY when the
 *    collar actually ran and found no problem; `evaluated_checks` lists what ran
 *    and `not_evaluated_checks` lists what could not — so an empty `order_checks`
 *    is never read as a blanket "all clear".
 *  - Checks Robinhood computes server-side that are NOT reproducible from a
 *    standard token (priceband, day-trade suitability, killswitches, order-type
 *    selector) are NOT emitted — they are named in `not_evaluated_checks`.
 *  - `market_data_disclosure` is returned null (Robinhood renders it MCP-side).
 *  - Account identifiers read from response bodies are scrubbed; the only
 *    account number in the output is the caller-supplied one, echoed back.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAuthenticatedRh, structured, textError } from "./_helpers.js";

const READ_ONLY = { readOnlyHint: true } as const;

export function registerReviewTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // Review equity order (pre-trade simulation)
  // -------------------------------------------------------------------------
  server.registerTool(
    "robinhood_review_equity_order",
    {
      title: "Review Equity Order",
      description:
        "Simulate a stock order WITHOUT placing it — the required 'review' step before robinhood_place_stock_order. Returns the order echoed back, the live quote (so the user sees the cost), and order_checks: a reproduction of Robinhood's price collar that flags a mis-priced limit/stop order (e.g. a buy limit far above the market). order_checks is {} only when the collar ran and found no problem — read evaluated_checks/not_evaluated_checks to see what was and wasn't checked. Nothing is placed. ALWAYS show the review to the user before placing.",
      inputSchema: {
        symbol: z.string().describe("Stock ticker symbol (e.g. AAPL)."),
        side: z.enum(["buy", "sell"]).describe("Order side."),
        quantity: z.number().positive().describe("Number of shares (supports fractional)."),
        limit_price: z
          .number()
          .positive()
          .optional()
          .describe("Limit price. Provide for limit / stop-limit orders."),
        stop_price: z
          .number()
          .positive()
          .optional()
          .describe("Stop price. Provide for stop / stop-limit orders."),
        account_number: z
          .string()
          .describe("Robinhood account number. Get from robinhood_get_accounts."),
      },
      outputSchema: {
        symbol: z.string(),
        side: z.string(),
        type: z.string(),
        quantity: z.number(),
        limit_price: z.unknown(),
        order_checks: z.unknown(),
        quote_data: z.unknown(),
        market_data_disclosure: z.null(),
        account_number: z.string(),
        stop_price: z.unknown(),
        evaluated_checks: z.array(z.string()),
        not_evaluated_checks: z.array(z.string()),
        quote_timestamp: z.unknown(),
        note: z.string(),
      },
      annotations: READ_ONLY,
    },
    async ({ symbol, side, quantity, limit_price, stop_price, account_number }) => {
      try {
        const rh = await getAuthenticatedRh();
        const review = await rh.reviewEquityOrder({
          symbol,
          side,
          quantity,
          limitPrice: limit_price,
          stopPrice: stop_price,
          accountNumber: account_number,
        });

        const hasAlert = Object.keys(review.order_checks).length > 0;
        const noteParts: string[] = [
          "SIMULATION ONLY — no order was placed. This is the review step before robinhood_place_stock_order; show it to the user before placing.",
          hasAlert
            ? "order_checks contains a reproduced price-collar ALERT (Robinhood's extremely-marketable/unmarketable check) — surface it prominently and re-confirm the price with the user."
            : review.evaluated_checks.length > 0
              ? "order_checks is {} because the price collar ran and found no problem (see evaluated_checks). This is NOT a blanket approval — only the price collar was reproduced."
              : "order_checks is {} but the price collar could NOT be evaluated (see not_evaluated_checks) — do not read this as 'all clear'.",
          "Only the price collar is reproduced. Robinhood's server-side priceband, day-trade suitability, killswitch, and short-eligibility checks are NOT reproduced.",
          "market_data_disclosure is null (Robinhood renders it in its own MCP, not reproducible from a standard token).",
          "TOCTOU: the quote and thresholds can move — if quote_timestamp is stale by the time you place, re-review first.",
        ];
        if (review.type === "market") {
          noteParts.push("Market order: no limit/stop price to collar-check.");
        }

        return structured({
          // Official DTO fields:
          symbol: review.symbol,
          side: review.side,
          type: review.type,
          quantity: review.quantity,
          limit_price: review.limit_price,
          order_checks: review.order_checks,
          quote_data: review.quote,
          market_data_disclosure: null,
          // Envelope (honest-fidelity additions — never inside the DTO):
          account_number, // caller-supplied, echoed
          stop_price: review.stop_price,
          evaluated_checks: review.evaluated_checks,
          not_evaluated_checks: review.not_evaluated_checks,
          quote_timestamp: review.quote_timestamp,
          note: noteParts.join(" "),
        });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  // -------------------------------------------------------------------------
  // Review option order (pre-trade simulation)
  // -------------------------------------------------------------------------
  server.registerTool(
    "robinhood_review_option_order",
    {
      title: "Review Option Order",
      description:
        "Simulate a single- or multi-leg option order WITHOUT placing it — the required 'review' step before robinhood_place_option_order. Returns the order echoed back with per-leg market data (mark/bid/ask/greeks) and the collateral the order would require. Nothing is placed. The reproduced check set is intentionally thin for options (see not_evaluated_checks) — options have no simple last-trade price collar. ALWAYS show the review to the user before placing.",
      inputSchema: {
        symbol: z.string().describe("Underlying stock ticker symbol."),
        legs: z
          .array(
            z.object({
              expiration_date: z.string().describe("Expiration date (YYYY-MM-DD)."),
              strike: z.number().describe("Strike price."),
              option_type: z.enum(["call", "put"]).describe("Option type."),
              side: z.enum(["buy", "sell"]).describe("Buy or sell this leg."),
              position_effect: z.enum(["open", "close"]).describe("Opening or closing."),
              ratio_quantity: z.number().default(1).describe("Ratio quantity for this leg."),
            }),
          )
          .describe("Option legs. Single-leg for simple orders, multiple for spreads."),
        price: z
          .number()
          .positive()
          .describe("Limit price per contract (single-leg) or net price (spreads)."),
        quantity: z.number().positive().describe("Number of contracts."),
        direction: z
          .enum(["debit", "credit"])
          .describe("Debit for buys/debit spreads, credit for sells/credit spreads."),
        account_number: z
          .string()
          .describe("Robinhood account number. Get from robinhood_get_accounts."),
      },
      outputSchema: {
        account_number: z.string(),
        symbol: z.string(),
        direction: z.string(),
        price: z.number(),
        quantity: z.number(),
        legs: z.array(z.unknown()),
        collateral: z.unknown(),
        order_checks: z.unknown(),
        evaluated_checks: z.array(z.string()),
        not_evaluated_checks: z.array(z.string()),
        note: z.string(),
      },
      annotations: READ_ONLY,
    },
    async ({ symbol, legs, price, quantity, direction, account_number }) => {
      try {
        const rh = await getAuthenticatedRh();
        const review = await rh.reviewOptionOrder({
          symbol,
          legs: legs.map((l) => ({
            expirationDate: l.expiration_date,
            strike: l.strike,
            optionType: l.option_type,
            side: l.side,
            positionEffect: l.position_effect,
            ratioQuantity: l.ratio_quantity,
          })),
          price,
          quantity,
          direction,
          accountNumber: account_number,
        });

        return structured({
          account_number, // caller-supplied, echoed
          symbol: review.symbol,
          direction: review.direction,
          price: review.price,
          quantity: review.quantity,
          legs: review.legs,
          collateral: review.collateral,
          order_checks: review.order_checks,
          evaluated_checks: review.evaluated_checks,
          not_evaluated_checks: review.not_evaluated_checks,
          note: "SIMULATION ONLY — no order was placed. This is the review step before robinhood_place_option_order; show it to the user before placing. Per-leg market_data (mark/bid/ask/greeks) and the required collateral are included. order_checks is intentionally thin for options (no simple last-trade collar) — not_evaluated_checks lists what was NOT reproduced, so do not read the empty order_checks as a blanket approval. Options are the higher-stakes side (contract multiplier ×100): double-check the net debit/credit and quantity with the user.",
        });
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
