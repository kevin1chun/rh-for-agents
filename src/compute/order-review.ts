/**
 * Pure pre-trade order-review logic (no I/O).
 *
 * Reproduces Robinhood's "extremely marketable / unmarketable" limit- and
 * stop-price collar — the pre-trade alert that catches a fat-fingered price
 * (e.g. a buy limit set 10× above the market). The collar parameters come from
 * the account's live `order_checks/presubmit_data` `threshold_servars`; this
 * module is the account-agnostic math over them.
 *
 * Design constraints (from the Phase-3 review, honest-fidelity + fail-safe):
 *  - The thresholds are RUNTIME-PARSED (not cast). A silent upstream shape
 *    change must degrade a check to `not_evaluated`, never to a false
 *    "no alert" — under-flagging a bad price is the dangerous failure.
 *  - Every check that cannot run (missing reference price, unparseable servar)
 *    is reported in `notEvaluated`, so a `null` alert never silently means
 *    "all clear" — only "the checks we could run passed".
 *  - When in doubt the collar fires (OR across the last-trade and bid/ask
 *    criteria): over-flagging costs a re-confirm; under-flagging risks a trade.
 */

import { z } from "zod";

/** The collar servars we consume, runtime-validated. Extra keys are ignored. */
export const ThresholdServarsSchema = z.object({
  extremely_marketable_limit_order_last_trade_percent: z.string().optional(),
  extremely_marketable_limit_order_ask_bid_percent: z.string().optional(),
  extremely_unmarketable_limit_order_last_trade_multiplier: z.string().optional(),
  extremely_unmarketable_limit_order_ask_bid_multiplier: z.string().optional(),
  extremely_marketable_stop_order_last_trade_percent: z.string().optional(),
  extremely_marketable_stop_order_ask_bid_percent: z.string().optional(),
  extremely_unmarketable_stop_order_last_trade_multiplier: z.string().optional(),
  extremely_unmarketable_stop_order_ask_bid_multiplier: z.string().optional(),
});

export type ThresholdServars = z.infer<typeof ThresholdServarsSchema>;

export type Side = "buy" | "sell";
/** Order type as reproduced from (limit_price, stop_price) — mirrors orderStock. */
export type ReviewOrderType = "market" | "limit" | "stop_loss" | "stop_limit";

/** Reference prices for the collar; any may be absent (e.g. no bid/ask off-hours). */
export interface RefPrices {
  lastTradePrice?: number | null;
  bidPrice?: number | null;
  askPrice?: number | null;
}

export interface CollarInput {
  side: Side;
  orderType: ReviewOrderType;
  limitPrice?: number | null;
  stopPrice?: number | null;
  refs: RefPrices;
  thresholds: ThresholdServars;
}

/**
 * One reproduced order-check alert (shape mirrors the official order_checks).
 * A `type` alias (not an interface) so it satisfies `Record<string, unknown>`.
 */
export type OrderCheckAlert = {
  alert_type: string;
  details: {
    entered_price: { amount: string; currency: "USD" };
    last_trade_price: { amount: string; currency: "USD" } | null;
    bid_price: { amount: string; currency: "USD" } | null;
    ask_price: { amount: string; currency: "USD" } | null;
    side: Side;
  };
};

export interface CollarResult {
  /** The official DTO's `order_checks`: `{}` when no alert, else one alert. */
  orderChecks: Record<string, never> | OrderCheckAlert;
  /** Human-readable ids of the collar criteria that actually ran. */
  evaluated: string[];
  /** Criteria that could not run (missing input) — never counted as "passed". */
  notEvaluated: string[];
}

function num(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function money(amount: number): { amount: string; currency: "USD" } {
  return { amount: String(amount), currency: "USD" };
}

/**
 * Evaluate the price collar for an equity order. Only limit and stop prices are
 * collar-checked; market orders have no price to collar (returns `{}` with the
 * criterion noted as not-applicable via `evaluated: []`).
 */
export function evaluateEquityCollar(input: CollarInput): CollarResult {
  const { side, orderType, limitPrice, stopPrice, refs, thresholds } = input;
  const evaluated: string[] = [];
  const notEvaluated: string[] = [];

  // Which price does this order type collar, and with which servar family?
  let pricedField: "limit" | "stop" | null = null;
  let checkedPrice: number | null | undefined;
  let servarPrefix: "limit_order" | "stop_order";
  let alertBase: string;

  if (orderType === "limit") {
    pricedField = "limit";
    checkedPrice = limitPrice;
    servarPrefix = "limit_order";
    alertBase = "LIMIT_PRICE";
  } else if (orderType === "stop_limit") {
    pricedField = "limit";
    checkedPrice = limitPrice;
    servarPrefix = "limit_order";
    alertBase = "STOP_LIMIT_PRICE";
  } else if (orderType === "stop_loss") {
    pricedField = "stop";
    checkedPrice = stopPrice;
    servarPrefix = "stop_order";
    alertBase = "STOP_PRICE";
  } else {
    // market — nothing to collar.
    return { orderChecks: {}, evaluated: [], notEvaluated: [] };
  }

  if (checkedPrice == null || !Number.isFinite(checkedPrice) || checkedPrice <= 0) {
    notEvaluated.push(`${pricedField}_price_collar (no ${pricedField} price provided)`);
    return { orderChecks: {}, evaluated, notEvaluated };
  }

  const last = refs.lastTradePrice ?? undefined;
  const bid = refs.bidPrice ?? undefined;
  const ask = refs.askPrice ?? undefined;

  // Dynamic servar keys — read through a string index (the schema validated shape).
  const tv = thresholds as Record<string, string | undefined>;
  const marketablePct = num(tv[`extremely_marketable_${servarPrefix}_last_trade_percent`]);
  const marketableAskBidPct = num(tv[`extremely_marketable_${servarPrefix}_ask_bid_percent`]);
  const unmarketableMult = num(tv[`extremely_unmarketable_${servarPrefix}_last_trade_multiplier`]);
  const unmarketableAskBidMult = num(
    tv[`extremely_unmarketable_${servarPrefix}_ask_bid_multiplier`],
  );

  // "Extremely marketable" = priced far through the market in the aggressive
  // direction (buy set too high / sell set too low) — a likely fat-finger that
  // would fill instantly at a bad price. "Extremely unmarketable" = priced so
  // far away it can never fill. Both are checked against last-trade (percent)
  // and against the touch (multiplier); the alert fires if any criterion trips.
  let marketableHit = false;
  let unmarketableHit = false;

  // --- last-trade criteria ---
  if (last != null && last > 0) {
    if (marketablePct != null) {
      evaluated.push(`${pricedField}_vs_last_trade_marketable`);
      const trips =
        side === "buy"
          ? checkedPrice > last * (1 + marketablePct)
          : checkedPrice < last * (1 - marketablePct);
      if (trips) marketableHit = true;
    } else {
      notEvaluated.push(`${pricedField}_vs_last_trade_marketable (servar missing)`);
    }
    if (unmarketableMult != null && unmarketableMult > 0) {
      evaluated.push(`${pricedField}_vs_last_trade_unmarketable`);
      const trips =
        side === "buy"
          ? checkedPrice < last / unmarketableMult
          : checkedPrice > last * unmarketableMult;
      if (trips) unmarketableHit = true;
    } else {
      notEvaluated.push(`${pricedField}_vs_last_trade_unmarketable (servar missing)`);
    }
  } else {
    notEvaluated.push(`${pricedField}_vs_last_trade (no last trade price)`);
  }

  // --- bid/ask (touch) criteria ---
  const marketableRef = side === "buy" ? ask : bid;
  const unmarketableRef = side === "buy" ? bid : ask;
  if (marketableRef != null && marketableRef > 0 && marketableAskBidPct != null) {
    evaluated.push(`${pricedField}_vs_touch_marketable`);
    const trips =
      side === "buy"
        ? checkedPrice > marketableRef * (1 + marketableAskBidPct)
        : checkedPrice < marketableRef * (1 - marketableAskBidPct);
    if (trips) marketableHit = true;
  } else {
    notEvaluated.push(
      `${pricedField}_vs_touch_marketable (no ${side === "buy" ? "ask" : "bid"} price or servar)`,
    );
  }
  if (
    unmarketableRef != null &&
    unmarketableRef > 0 &&
    unmarketableAskBidMult != null &&
    unmarketableAskBidMult > 0
  ) {
    evaluated.push(`${pricedField}_vs_touch_unmarketable`);
    const trips =
      side === "buy"
        ? checkedPrice < unmarketableRef / unmarketableAskBidMult
        : checkedPrice > unmarketableRef * unmarketableAskBidMult;
    if (trips) unmarketableHit = true;
  } else {
    notEvaluated.push(
      `${pricedField}_vs_touch_unmarketable (no ${side === "buy" ? "bid" : "ask"} price or servar)`,
    );
  }

  // If nothing could be evaluated, there is no basis for a "no alert" result.
  if (evaluated.length === 0) {
    return { orderChecks: {}, evaluated, notEvaluated };
  }

  const flavor = marketableHit ? "MARKETABLE" : unmarketableHit ? "UNMARKETABLE" : null;
  if (flavor === null) {
    return { orderChecks: {}, evaluated, notEvaluated };
  }

  const alert: OrderCheckAlert = {
    alert_type: `EQUITY_EXTREMELY_${flavor}_${alertBase}`,
    details: {
      entered_price: money(checkedPrice),
      last_trade_price: last != null ? money(last) : null,
      bid_price: bid != null ? money(bid) : null,
      ask_price: ask != null ? money(ask) : null,
      side,
    },
  };
  return { orderChecks: alert, evaluated, notEvaluated };
}

/** Derive the reproduced order type from the price parameters (mirrors orderStock). */
export function deriveOrderType(
  limitPrice?: number | null,
  stopPrice?: number | null,
): ReviewOrderType {
  if (stopPrice != null && limitPrice != null) return "stop_limit";
  if (stopPrice != null) return "stop_loss";
  if (limitPrice != null) return "limit";
  return "market";
}
