import { describe, expect, it } from "vitest";
import {
  type CollarInput,
  deriveOrderType,
  evaluateEquityCollar,
  type OrderCheckAlert,
  type ThresholdServars,
} from "../../src/compute/order-review.js";

/**
 * Golden vectors for the pre-trade price collar. Thresholds mirror the shape of
 * a live `threshold_servars` (percent for the marketable band, multiplier for
 * the unmarketable band) but every value here is synthetic.
 */
const THRESHOLDS: ThresholdServars = {
  extremely_marketable_limit_order_last_trade_percent: "0.1", // >10% through last trade
  extremely_marketable_limit_order_ask_bid_percent: "0.05", // >5% through the touch
  extremely_unmarketable_limit_order_last_trade_multiplier: "10", // <last/10 or >last*10
  extremely_unmarketable_limit_order_ask_bid_multiplier: "9",
  extremely_marketable_stop_order_last_trade_percent: "0.1",
  extremely_marketable_stop_order_ask_bid_percent: "0.05",
  extremely_unmarketable_stop_order_last_trade_multiplier: "10",
  extremely_unmarketable_stop_order_ask_bid_multiplier: "9",
};

// A market centered ~ $100 with a tight touch.
const REFS = { lastTradePrice: 100, bidPrice: 99.9, askPrice: 100.1 };

function input(over: Partial<CollarInput>): CollarInput {
  return {
    side: "buy",
    orderType: "limit",
    limitPrice: 100,
    stopPrice: null,
    refs: REFS,
    thresholds: THRESHOLDS,
    ...over,
  };
}

function asAlert(oc: Record<string, unknown>): OrderCheckAlert {
  return oc as OrderCheckAlert;
}

describe("evaluateEquityCollar — buy limit", () => {
  it("does not alert for a reasonable price and records the criteria that ran", () => {
    const r = evaluateEquityCollar(input({ limitPrice: 100 }));
    expect(r.orderChecks).toEqual({});
    // A non-empty evaluated list is what makes an empty order_checks meaningful.
    expect(r.evaluated.length).toBeGreaterThan(0);
    expect(r.notEvaluated).toEqual([]);
  });

  it("flags an extremely marketable buy limit (far above the market)", () => {
    const r = evaluateEquityCollar(input({ limitPrice: 130 })); // >100*1.1 and >100.1*1.05
    const alert = asAlert(r.orderChecks);
    expect(alert.alert_type).toBe("EQUITY_EXTREMELY_MARKETABLE_LIMIT_PRICE");
    expect(alert.details.side).toBe("buy");
    expect(alert.details.entered_price.amount).toBe("130");
    expect(alert.details.last_trade_price?.amount).toBe("100");
  });

  it("flags an extremely unmarketable buy limit (far below the market)", () => {
    const r = evaluateEquityCollar(input({ limitPrice: 5 })); // <100/10 and <99.9/9
    expect(asAlert(r.orderChecks).alert_type).toBe("EQUITY_EXTREMELY_UNMARKETABLE_LIMIT_PRICE");
  });

  it("does not alert just above last trade but within the band", () => {
    const r = evaluateEquityCollar(input({ limitPrice: 104 })); // <100*1.1, and 104 vs ask 100.1*1.05=105.1 → within
    expect(r.orderChecks).toEqual({});
  });
});

describe("evaluateEquityCollar — sell limit (mirror)", () => {
  it("flags an extremely marketable sell limit (far below the market)", () => {
    const r = evaluateEquityCollar(input({ side: "sell", limitPrice: 70 })); // <100*0.9
    expect(asAlert(r.orderChecks).alert_type).toBe("EQUITY_EXTREMELY_MARKETABLE_LIMIT_PRICE");
  });

  it("flags an extremely unmarketable sell limit (far above the market)", () => {
    const r = evaluateEquityCollar(input({ side: "sell", limitPrice: 2000 })); // >100*10
    expect(asAlert(r.orderChecks).alert_type).toBe("EQUITY_EXTREMELY_UNMARKETABLE_LIMIT_PRICE");
  });
});

describe("evaluateEquityCollar — order types", () => {
  it("market orders have nothing to collar", () => {
    const r = evaluateEquityCollar(input({ orderType: "market", limitPrice: null }));
    expect(r.orderChecks).toEqual({});
    expect(r.evaluated).toEqual([]);
    expect(r.notEvaluated).toEqual([]);
  });

  it("stop-loss checks the stop price and emits a STOP_PRICE alert", () => {
    const r = evaluateEquityCollar(
      input({ orderType: "stop_loss", limitPrice: null, stopPrice: 300 }),
    );
    expect(asAlert(r.orderChecks).alert_type).toBe("EQUITY_EXTREMELY_MARKETABLE_STOP_PRICE");
  });

  it("stop-limit checks the limit price and emits a STOP_LIMIT_PRICE alert", () => {
    const r = evaluateEquityCollar(
      input({ orderType: "stop_limit", limitPrice: 300, stopPrice: 290 }),
    );
    expect(asAlert(r.orderChecks).alert_type).toBe("EQUITY_EXTREMELY_MARKETABLE_STOP_LIMIT_PRICE");
  });
});

describe("evaluateEquityCollar — fail toward not_evaluated", () => {
  it("degrades to not_evaluated (never a false pass) when the reference prices are absent", () => {
    const r = evaluateEquityCollar(
      input({ limitPrice: 130, refs: { lastTradePrice: null, bidPrice: null, askPrice: null } }),
    );
    // No basis to evaluate → no alert AND no evaluated criteria → the note layer
    // must not read this as "all clear".
    expect(r.orderChecks).toEqual({});
    expect(r.evaluated).toEqual([]);
    expect(r.notEvaluated.length).toBeGreaterThan(0);
  });

  it("still evaluates the last-trade criteria when only bid/ask are missing", () => {
    const r = evaluateEquityCollar(
      input({ limitPrice: 130, refs: { lastTradePrice: 100, bidPrice: null, askPrice: null } }),
    );
    expect(asAlert(r.orderChecks).alert_type).toBe("EQUITY_EXTREMELY_MARKETABLE_LIMIT_PRICE");
    // Touch criteria could not run.
    expect(r.notEvaluated.some((s) => s.includes("touch"))).toBe(true);
  });

  it("degrades when the servars are missing entirely", () => {
    const r = evaluateEquityCollar(input({ limitPrice: 130, thresholds: {} as ThresholdServars }));
    expect(r.orderChecks).toEqual({});
    expect(r.notEvaluated.length).toBeGreaterThan(0);
  });

  it("does not alert or throw when a limit price is missing on a limit order", () => {
    const r = evaluateEquityCollar(input({ orderType: "limit", limitPrice: null }));
    expect(r.orderChecks).toEqual({});
    expect(r.evaluated).toEqual([]);
    expect(r.notEvaluated.length).toBeGreaterThan(0);
  });
});

describe("deriveOrderType", () => {
  it("maps price parameters to an order type", () => {
    expect(deriveOrderType()).toBe("market");
    expect(deriveOrderType(100)).toBe("limit");
    expect(deriveOrderType(null, 90)).toBe("stop_loss");
    expect(deriveOrderType(100, 90)).toBe("stop_limit");
  });
});
