/**
 * Short selling with robinhood-for-agents.
 *
 * Robinhood does not infer a short from the absence of a position. A short sale
 * is its own side value:
 *
 *   open a short   ->  side: "sell_short"   (margin account, whole shares)
 *   cover a short  ->  side: "buy"          (there is no "buy_to_cover" side)
 *
 * A plain `sell` only closes an existing long, and on an account holding no
 * shares Robinhood rejects it with `Not enough shares to sell.` — the symptom
 * that usually sends people looking for a short-selling flag that doesn't exist.
 *
 * Run it:
 *
 *   bun examples/short-selling.ts                      # dry run: reviews only, places NOTHING
 *   bun examples/short-selling.ts --place              # places a real 1-share order
 *   bun examples/short-selling.ts --place --session=extended_hours
 *
 * The dry run is the default on purpose. `--place` spends real money, and the
 * round trip is a day trade.
 */

import { type OrderMarketHours, RobinhoodClient, type StockOrder } from "robinhood-for-agents";

const SYMBOL = "SPY";
const QUANTITY = 1;
const PLACE = Bun.argv.includes("--place");

const SESSIONS: OrderMarketHours[] = ["regular_hours", "extended_hours", "all_day_hours"];
const sessionArg = Bun.argv.find((a) => a.startsWith("--session="))?.split("=")[1];
if (sessionArg && !SESSIONS.includes(sessionArg as OrderMarketHours)) {
  throw new Error(`--session must be one of: ${SESSIONS.join(", ")}`);
}
/** Trading session. Only limit orders execute outside regular hours. */
const SESSION = (sessionArg as OrderMarketHours) ?? "regular_hours";

const rh = new RobinhoodClient();
await rh.restoreSession();

/** Poll an order until it reaches a terminal state. */
async function settle(orderId: string, seconds = 30): Promise<StockOrder> {
  for (let i = 0; i < seconds; i++) {
    const order = await rh.getStockOrder(orderId);
    if (["filled", "cancelled", "rejected", "failed"].includes(order.state)) return order;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return await rh.getStockOrder(orderId);
}

// ---------------------------------------------------------------------------
// 1. Pick the account. Shorting requires margin — a cash account is rejected
//    with "You need to have margin investing enabled to short."
// ---------------------------------------------------------------------------
const accounts = await rh.getAccounts();
const margin = accounts.find((a) => a.type === "margin" && !a.deactivated);
if (!margin) {
  throw new Error("No margin account found — short selling requires margin investing.");
}
console.log(`account: ${margin.account_number} (${margin.type})`);

// ---------------------------------------------------------------------------
// 2. Confirm the symbol is shortable before doing anything else.
// ---------------------------------------------------------------------------
const [tradability] = await rh.getTradability([SYMBOL]);
console.log(`${SYMBOL} short_selling_tradability: ${tradability?.short_selling_tradability}`);
if (tradability?.short_selling_tradability !== "tradable") {
  throw new Error(`${SYMBOL} is not shortable.`);
}

// ---------------------------------------------------------------------------
// 3. Check which session is actually live, so the order is tagged correctly.
//    An order tagged to the wrong session queues instead of executing.
// ---------------------------------------------------------------------------
const hours = await rh.getMarketHours();
console.log(
  hours.is_open
    ? `market: trading day — regular ${hours.opens_at} to ${hours.closes_at}`
    : "market: NOT a trading day (weekend or holiday) — orders will queue",
);
console.log(`session: ${SESSION}`);

// ---------------------------------------------------------------------------
// 4. Price the order. Only limit orders execute outside regular hours, so this
//    example always uses a limit and names the session explicitly.
// ---------------------------------------------------------------------------
const [quote] = await rh.getQuotes([SYMBOL]);
const bid = Number(quote?.bid_price);
const ask = Number(quote?.ask_price);
// Off-hours the book can be empty, which would produce a nonsense limit price.
if (!(bid > 0) || !(ask > 0)) {
  throw new Error(`No two-sided market for ${SYMBOL} right now (bid ${bid} / ask ${ask}).`);
}
// Marketable: a short sells into the bid, a cover buys from the ask.
const shortLimit = Number((bid - 0.05).toFixed(2));
const coverLimit = Number((ask + 0.05).toFixed(2));
console.log(`quote: bid ${bid} / ask ${ask}`);

// ---------------------------------------------------------------------------
// 4. Review first — read-only, places nothing. Show this to the user and get an
//    explicit confirmation before placing. `order_checks` flags a mis-priced
//    order; it is `{}` only when the collar ran and found nothing (check
//    `evaluated_checks`), never a blanket all-clear.
// ---------------------------------------------------------------------------
const review = await rh.reviewEquityOrder({
  symbol: SYMBOL,
  side: "sell_short",
  quantity: QUANTITY,
  limitPrice: shortLimit,
  accountNumber: margin.account_number,
});
console.log("\nreview (nothing placed):");
console.log(
  `  ${review.side} ${review.quantity} ${review.symbol} @ ${review.limit_price} ${review.type}`,
);
console.log(`  order_checks:  ${JSON.stringify(review.order_checks)}`);
console.log(`  evaluated:     ${review.evaluated_checks.join(", ") || "none"}`);
console.log(`  not evaluated: ${review.not_evaluated_checks.join(", ") || "none"}`);

if (!PLACE) {
  console.log("\nDry run — pass --place to submit a real order.");
} else {
  // -------------------------------------------------------------------------
  // 5. Open the short.
  //
  //    Short sales are session-scoped: outside regular hours the API rejects
  //    them unless `marketHours` names the session. The library sends
  //    `position_effect: "open"` alongside `sell_short` for you.
  // -------------------------------------------------------------------------
  const short = await rh.orderStock(SYMBOL, "sell_short", QUANTITY, {
    limitPrice: shortLimit,
    timeInForce: "gfd",
    marketHours: SESSION,
    accountNumber: margin.account_number,
  });
  console.log(`\nshort submitted: state=${short.state}`);

  const shortFilled = await settle(short.id);
  console.log(
    `short: state=${shortFilled.state} filled=${shortFilled.cumulative_quantity} @ ${shortFilled.average_price}`,
  );

  let openQuantity = Number(shortFilled.cumulative_quantity ?? 0);

  if (shortFilled.state !== "filled") {
    // Not filled *as of the last poll* — but it may fill between that poll and
    // the cancel, so never assume the cancel means nothing was opened. Cancel
    // best-effort, then re-read the order and go by what actually executed.
    if (shortFilled.cancel) {
      try {
        await rh.cancelStockOrder(short.id);
      } catch (err) {
        console.warn(`cancel failed (it may have just filled): ${(err as Error).message}`);
      }
    }
    const settled = await rh.getStockOrder(short.id);
    openQuantity = Number(settled.cumulative_quantity ?? 0);
    console.log(`after cancel: state=${settled.state} filled=${settled.cumulative_quantity}`);
  }

  if (openQuantity === 0) {
    console.log("short did not fill — nothing to cover.");
  } else {
    // -----------------------------------------------------------------------
    // 6. Cover with an ordinary buy. Robinhood recognises it as closing the
    //    short and stamps `position_effect: "close"` on the order itself.
    // -----------------------------------------------------------------------
    // Cover exactly what was opened — a partial fill must not be over- or
    // under-bought, which would leave a long or a residual short.
    const cover = await rh.orderStock(SYMBOL, "buy", openQuantity, {
      limitPrice: coverLimit,
      timeInForce: "gfd",
      marketHours: SESSION,
      accountNumber: margin.account_number,
    });
    const coverFilled = await settle(cover.id);
    console.log(
      `cover: state=${coverFilled.state} filled=${coverFilled.cumulative_quantity} @ ${coverFilled.average_price}`,
    );

    const stillShort = openQuantity - Number(coverFilled.cumulative_quantity ?? 0);
    if (stillShort > 0) {
      // Loud and unambiguous: this is real, unbounded-risk exposure.
      console.error(`
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
!!! OPEN SHORT POSITION REMAINS: ${stillShort} ${SYMBOL}
!!! The cover did not fully fill (state=${coverFilled.state}).
!!! Buy ${stillShort} ${SYMBOL} to close it, or do it in the app NOW.
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
      throw new Error(`Cover incomplete — ${stillShort} ${SYMBOL} still short.`);
    }

    const pnl =
      (Number(shortFilled.average_price) - Number(coverFilled.average_price)) * openQuantity;
    console.log(`\nround trip complete — P&L ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} before fees`);
  }
}
