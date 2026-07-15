/**
 * Realized profit & loss — pure computation (no I/O, no client, fully unit-testable).
 *
 * WHY THIS EXISTS: Robinhood exposes no standard-token REST endpoint for equity/option
 * realized P&L (the app's "PnL hub" and the official MCP's "Wormhole" service both compute
 * it; probing `/wormhole/*` etc. returns 404). So for architecture-B parity we compute it
 * ourselves from order executions. Crypto realized P&L, by contrast, is native (`gain_loss`
 * on nummus orders) and is reshaped elsewhere — it never flows through this module.
 *
 * METHODOLOGY: independent **economic FIFO** including fees. Buys open long lots; sells close
 * them first-in-first-out. This is NOT Robinhood's booked or tax-adjusted number:
 *   - it does not model wash-sale basis adjustments,
 *   - it does not honor a per-order non-FIFO `tax_lot_selection_type` (the chosen lots are not
 *     in the order object, so a non-FIFO selection can only be *detected*, never reproduced),
 *   - it models long round-trips only; a sell that exceeds accumulated long lots (a short, or
 *     shares acquired outside order history — transfers, rewards, unadjusted splits) is flagged
 *     via `overrunSymbols` rather than silently emitting a wrong number.
 * Callers surface these caveats in the tool-result note; they are never embedded in the DTO.
 */

export type Side = "buy" | "sell";

/** One normalized fill in split-adjusted terms. The caller (client layer) is responsible for
 *  building these from raw executions and for any split normalization. */
export interface Fill {
  symbol: string;
  side: Side;
  /** > 0 */
  quantity: number;
  /** per-share */
  price: number;
  /** total fees on this fill, >= 0 */
  fees: number;
  /** ISO-8601; used for FIFO ordering and time bucketing */
  timestamp: string;
}

/** A realized (closed) trade — the per-trade unit behind `get_pnl_trade_history`. */
export interface RealizedTrade {
  symbol: string;
  /** closing side; long-only v1 always closes with a sell */
  side: "sell";
  /** matched/closed quantity (may be less than the sell quantity on an overrun) */
  quantity: number;
  /** closing (sell) price per share */
  price: number;
  /** quantity*price minus allocated sell fees */
  proceeds: number;
  /** matched buy cost including allocated buy fees */
  costBasis: number;
  /** proceeds - costBasis */
  realizedGain: number;
  /** earliest matched buy timestamp */
  openedAt: string;
  /** sell timestamp */
  closedAt: string;
}

export interface RealizedResult {
  /** chronological by closedAt */
  trades: RealizedTrade[];
  /** symbols where a sell exceeded available long lots — basis is incomplete for these */
  overrunSymbols: string[];
  /** sum of realizedGain across all trades */
  totalRealizedGain: number;
}

interface Lot {
  remaining: number;
  price: number;
  /** buy fees allocated per share (fees / original quantity) */
  feePerShare: number;
  openedAt: string;
}

const EPS = 1e-9;

function chronological(a: Fill, b: Fill): number {
  if (a.timestamp < b.timestamp) return -1;
  if (a.timestamp > b.timestamp) return 1;
  return 0;
}

/**
 * FIFO-match a flat list of fills across any number of symbols into realized trades.
 * Pure and deterministic; fills are grouped per symbol and processed in timestamp order.
 */
export function computeFifoRealized(fills: Fill[]): RealizedResult {
  const bySymbol = new Map<string, Fill[]>();
  for (const f of fills) {
    const list = bySymbol.get(f.symbol);
    if (list) list.push(f);
    else bySymbol.set(f.symbol, [f]);
  }

  const trades: RealizedTrade[] = [];
  const overrun = new Set<string>();

  for (const [symbol, symbolFills] of bySymbol) {
    const ordered = [...symbolFills].sort(chronological);
    const lots: Lot[] = [];

    for (const fill of ordered) {
      if (fill.side === "buy") {
        lots.push({
          remaining: fill.quantity,
          price: fill.price,
          feePerShare: fill.quantity > 0 ? fill.fees / fill.quantity : 0,
          openedAt: fill.timestamp,
        });
        continue;
      }

      // sell: close against long lots FIFO
      let remaining = fill.quantity;
      const sellFeePerShare = fill.quantity > 0 ? fill.fees / fill.quantity : 0;
      let cost = 0;
      let proceeds = 0;
      let matched = 0;
      let openedAt: string | undefined;

      while (remaining > EPS && lots.length > 0) {
        const lot = lots[0];
        if (lot === undefined) break;
        const take = Math.min(remaining, lot.remaining);
        cost += take * (lot.price + lot.feePerShare);
        proceeds += take * (fill.price - sellFeePerShare);
        matched += take;
        openedAt ??= lot.openedAt; // FIFO: the first lot consumed is the earliest open
        lot.remaining -= take;
        remaining -= take;
        if (lot.remaining <= EPS) lots.shift();
      }

      if (remaining > EPS) overrun.add(symbol);

      if (matched > EPS) {
        trades.push({
          symbol,
          side: "sell",
          quantity: matched,
          price: fill.price,
          proceeds,
          costBasis: cost,
          realizedGain: proceeds - cost,
          openedAt: openedAt ?? fill.timestamp,
          closedAt: fill.timestamp,
        });
      }
    }
  }

  trades.sort((a, b) => (a.closedAt < b.closedAt ? -1 : a.closedAt > b.closedAt ? 1 : 0));
  const totalRealizedGain = trades.reduce((sum, t) => sum + t.realizedGain, 0);
  return { trades, overrunSymbols: [...overrun].sort(), totalRealizedGain };
}

// ---------------------------------------------------------------------------
// Time bucketing — the aggregate view behind `get_realized_pnl`.
// Granularity is a display convention (unvalidated against the official service);
// the invariant that matters — buckets tile the window with no gap/overlap and the
// bucket sum equals total_returns — holds by construction.
// ---------------------------------------------------------------------------

export type Granularity = "day" | "week" | "month";

export interface RealizedBucket {
  /** ISO-8601 inclusive start */
  startTime: string;
  /** ISO-8601 exclusive end */
  endTime: string;
  realizedGain: number;
  numberOfTrades: number;
}

/** Minimal shape needed to bucket — satisfied by both RealizedTrade and the client's RealizedPnlTrade. */
export interface Bucketable {
  realizedGain: number;
  closedAt: string;
}

function addPeriod(d: Date, granularity: Granularity): Date {
  const next = new Date(d.getTime());
  if (granularity === "day") next.setUTCDate(next.getUTCDate() + 1);
  else if (granularity === "week") next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

/** Floor a date to the start of its granularity period (UTC). Week floors to Monday. */
function floorTo(d: Date, granularity: Granularity): Date {
  const f = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (granularity === "month") f.setUTCDate(1);
  else if (granularity === "week") {
    const dow = (f.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
    f.setUTCDate(f.getUTCDate() - dow);
  }
  return f;
}

/**
 * Bucket realized trades into a continuous, gap-free series of periods spanning
 * [windowStart, windowEnd). Every period in range is emitted (including empty ones),
 * so the buckets tile the window exactly and their realizedGain sums to the total.
 */
export function bucketRealized(
  trades: readonly Bucketable[],
  windowStart: string,
  windowEnd: string,
  granularity: Granularity,
): RealizedBucket[] {
  const start = floorTo(new Date(windowStart), granularity);
  const end = new Date(windowEnd);
  const buckets: RealizedBucket[] = [];

  let cursor = start;
  while (cursor < end) {
    const next = addPeriod(cursor, granularity);
    buckets.push({
      startTime: cursor.toISOString(),
      endTime: next.toISOString(),
      realizedGain: 0,
      numberOfTrades: 0,
    });
    cursor = next;
  }
  const first = buckets[0];
  if (first === undefined) return buckets;

  const firstStart = new Date(first.startTime).getTime();
  for (const t of trades) {
    const closed = new Date(t.closedAt).getTime();
    if (closed < firstStart) continue;
    let idx = buckets.findIndex((b) => closed < new Date(b.endTime).getTime());
    if (idx === -1) idx = buckets.length - 1; // clamp trades at/after the window end into the last bucket
    const bucket = buckets[idx];
    if (bucket === undefined) continue;
    bucket.realizedGain += t.realizedGain;
    bucket.numberOfTrades += 1;
  }
  return buckets;
}
