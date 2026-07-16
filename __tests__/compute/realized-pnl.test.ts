import { describe, expect, it } from "vitest";
import {
  bucketRealized,
  computeFifoRealized,
  type Fill,
  type RealizedTrade,
} from "../../src/compute/realized-pnl.js";

/**
 * Golden vectors are hand-built with textbook-known FIFO outcomes. They are NEVER
 * captured from a live account — a captured realized-P&L response embeds real trade
 * history (PII). Every number here is synthetic.
 */

function buy(symbol: string, quantity: number, price: number, timestamp: string, fees = 0): Fill {
  return { symbol, side: "buy", quantity, price, fees, timestamp };
}
function sell(symbol: string, quantity: number, price: number, timestamp: string, fees = 0): Fill {
  return { symbol, side: "sell", quantity, price, fees, timestamp };
}

describe("computeFifoRealized", () => {
  it("closes a simple round-trip with no fees", () => {
    const r = computeFifoRealized([
      buy("AAA", 10, 100, "2026-01-01T00:00:00Z"),
      sell("AAA", 10, 110, "2026-01-02T00:00:00Z"),
    ]);
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]?.quantity).toBe(10);
    expect(r.trades[0]?.proceeds).toBeCloseTo(1100, 9);
    expect(r.trades[0]?.costBasis).toBeCloseTo(1000, 9);
    expect(r.trades[0]?.realizedGain).toBeCloseTo(100, 9);
    expect(r.trades[0]?.openedAt).toBe("2026-01-01T00:00:00Z");
    expect(r.trades[0]?.closedAt).toBe("2026-01-02T00:00:00Z");
    expect(r.overrunSymbols).toEqual([]);
    expect(r.totalRealizedGain).toBeCloseTo(100, 9);
  });

  it("subtracts buy and sell fees from the basis and proceeds", () => {
    const r = computeFifoRealized([
      buy("AAA", 10, 100, "2026-01-01T00:00:00Z", 1),
      sell("AAA", 10, 110, "2026-01-02T00:00:00Z", 1),
    ]);
    expect(r.trades[0]?.proceeds).toBeCloseTo(1099, 9); // 1100 - 1 sell fee
    expect(r.trades[0]?.costBasis).toBeCloseTo(1001, 9); // 1000 + 1 buy fee
    expect(r.trades[0]?.realizedGain).toBeCloseTo(98, 9);
  });

  it("realizes only the closed portion of a partial sell (rest stays open)", () => {
    const r = computeFifoRealized([
      buy("AAA", 10, 100, "2026-01-01T00:00:00Z"),
      sell("AAA", 4, 110, "2026-01-02T00:00:00Z"),
    ]);
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]?.quantity).toBe(4);
    expect(r.trades[0]?.realizedGain).toBeCloseTo(40, 9);
    expect(r.overrunSymbols).toEqual([]);
  });

  it("matches multiple buy lots FIFO against one sell", () => {
    const r = computeFifoRealized([
      buy("AAA", 5, 100, "2026-01-01T00:00:00Z"),
      buy("AAA", 5, 120, "2026-01-02T00:00:00Z"),
      sell("AAA", 8, 130, "2026-01-03T00:00:00Z"),
    ]);
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]?.quantity).toBe(8);
    expect(r.trades[0]?.costBasis).toBeCloseTo(5 * 100 + 3 * 120, 9); // 860
    expect(r.trades[0]?.proceeds).toBeCloseTo(8 * 130, 9); // 1040
    expect(r.trades[0]?.realizedGain).toBeCloseTo(180, 9);
    expect(r.trades[0]?.openedAt).toBe("2026-01-01T00:00:00Z"); // earliest matched lot
  });

  it("flags an overrun when a sell exceeds accumulated long lots, matching what it can", () => {
    const r = computeFifoRealized([
      buy("AAA", 5, 100, "2026-01-01T00:00:00Z"),
      sell("AAA", 8, 110, "2026-01-02T00:00:00Z"),
    ]);
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]?.quantity).toBe(5); // only the 5 real shares
    expect(r.trades[0]?.realizedGain).toBeCloseTo(50, 9);
    expect(r.overrunSymbols).toEqual(["AAA"]);
  });

  it("keeps symbols independent and sums the total", () => {
    const r = computeFifoRealized([
      buy("AAA", 1, 10, "2026-01-01T00:00:00Z"),
      buy("BBB", 1, 20, "2026-01-01T00:00:00Z"),
      sell("AAA", 1, 15, "2026-01-02T00:00:00Z"), // +5
      sell("BBB", 1, 18, "2026-01-02T00:00:00Z"), // -2
    ]);
    expect(r.trades).toHaveLength(2);
    expect(r.totalRealizedGain).toBeCloseTo(3, 9);
    const bySym = Object.fromEntries(r.trades.map((t) => [t.symbol, t.realizedGain]));
    expect(bySym.AAA).toBeCloseTo(5, 9);
    expect(bySym.BBB).toBeCloseTo(-2, 9);
  });

  it("sorts fills chronologically regardless of input order", () => {
    const r = computeFifoRealized([
      sell("AAA", 10, 110, "2026-01-02T00:00:00Z"),
      buy("AAA", 10, 100, "2026-01-01T00:00:00Z"),
    ]);
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]?.realizedGain).toBeCloseTo(100, 9);
  });

  it("emits no trade for a buy-only history", () => {
    const r = computeFifoRealized([buy("AAA", 10, 100, "2026-01-01T00:00:00Z")]);
    expect(r.trades).toEqual([]);
    expect(r.totalRealizedGain).toBe(0);
  });

  it("handles fractional (dollar-based) quantities", () => {
    const r = computeFifoRealized([
      buy("AAA", 0.5, 200, "2026-01-01T00:00:00Z"),
      sell("AAA", 0.5, 220, "2026-01-02T00:00:00Z"),
    ]);
    expect(r.trades[0]?.realizedGain).toBeCloseTo(10, 9);
  });
});

describe("bucketRealized", () => {
  const trades: RealizedTrade[] = [
    {
      symbol: "AAA",
      side: "sell",
      quantity: 1,
      price: 15,
      proceeds: 15,
      costBasis: 10,
      realizedGain: 5,
      openedAt: "2026-01-01T00:00:00Z",
      closedAt: "2026-01-02T12:00:00Z",
    },
    {
      symbol: "BBB",
      side: "sell",
      quantity: 1,
      price: 18,
      proceeds: 18,
      costBasis: 20,
      realizedGain: -2,
      openedAt: "2026-01-01T00:00:00Z",
      closedAt: "2026-01-04T12:00:00Z",
    },
  ];

  it("produces a continuous, gap-free daily series that tiles the window", () => {
    const buckets = bucketRealized(trades, "2026-01-01T00:00:00Z", "2026-01-06T00:00:00Z", "day");
    expect(buckets).toHaveLength(5); // Jan 1..5
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i]?.startTime).toBe(buckets[i - 1]?.endTime); // no gap / no overlap
    }
  });

  it("assigns each trade to the bucket containing its closedAt", () => {
    const buckets = bucketRealized(trades, "2026-01-01T00:00:00Z", "2026-01-06T00:00:00Z", "day");
    const jan2 = buckets.find((b) => b.startTime.startsWith("2026-01-02"));
    const jan4 = buckets.find((b) => b.startTime.startsWith("2026-01-04"));
    expect(jan2?.realizedGain).toBeCloseTo(5, 9);
    expect(jan2?.numberOfTrades).toBe(1);
    expect(jan4?.realizedGain).toBeCloseTo(-2, 9);
    expect(jan4?.numberOfTrades).toBe(1);
  });

  it("bucket realizedGain sums to the total (invariant)", () => {
    const buckets = bucketRealized(trades, "2026-01-01T00:00:00Z", "2026-01-06T00:00:00Z", "day");
    const sum = buckets.reduce((a, b) => a + b.realizedGain, 0);
    const count = buckets.reduce((a, b) => a + b.numberOfTrades, 0);
    expect(sum).toBeCloseTo(3, 9);
    expect(count).toBe(2);
  });

  it("buckets by month and by week without gaps", () => {
    for (const g of ["week", "month"] as const) {
      const buckets = bucketRealized(trades, "2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z", g);
      for (let i = 1; i < buckets.length; i++) {
        expect(buckets[i]?.startTime).toBe(buckets[i - 1]?.endTime);
      }
      const sum = buckets.reduce((a, b) => a + b.realizedGain, 0);
      expect(sum).toBeCloseTo(3, 9);
    }
  });
});
