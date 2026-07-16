/**
 * Realized-P&L oracle harness — RUN THIS LOCALLY to sanity-check the computed
 * realized P&L against Robinhood's own numbers.
 *
 *   bun run pnl:harness
 *   # or with an encrypted token file:
 *   ROBINHOOD_TOKENS_FILE=~/.robinhood-for-agents/tokens.enc bun run pnl:harness
 *
 * WHY A LOCAL SCRIPT: `robinhood-for-agents` computes equity realized P&L itself
 * (Robinhood exposes no realized-P&L REST endpoint for a standard token). The only
 * ground-truth oracle is Robinhood's own app / official MCP, and validating against
 * it requires your account number — which must never enter an assistant transcript.
 * Running here, on your machine, keeps your account number and figures entirely local.
 *
 * WHAT TO DO: compare the totals below against the Robinhood app's
 * "Realized profit & loss" hub (or the official Trading MCP's get_realized_pnl) for the
 * same spans. Expect differences from: options (excluded here), wash-sale basis
 * adjustments, and any non-FIFO lot selection — this computes independent economic FIFO.
 * Large unexplained gaps, or symbols listed under "basis incomplete", warrant a look.
 */
import { getClient } from "../src/client/index.js";

const SPANS: Array<[string, number | null]> = [
  ["week", 7],
  ["month", 30],
  ["3month", 90],
  ["year", 365],
  ["all", null],
];

const rh = getClient();
await rh.restoreSession();

const data = await rh.getRealizedPnl();
const fmt = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
const now = Date.now();

console.log("Realized P&L (independent economic FIFO incl. fees; equity + crypto; options excluded)\n");
console.log("span     trades   realized_gain");
console.log("-------  ------   -------------");
for (const [label, days] of SPANS) {
  const cutoff = days === null ? 0 : now - days * 86_400_000;
  const inWindow = data.trades.filter((t) => new Date(t.closedAt).getTime() >= cutoff);
  const total = inWindow.reduce((s, t) => s + t.realizedGain, 0);
  console.log(`${label.padEnd(7)}  ${String(inWindow.length).padStart(6)}   ${fmt(total)}`);
}

if (data.overrunSymbols.length > 0) {
  console.log(
    `\n⚠ basis incomplete for: ${data.overrunSymbols.join(", ")} ` +
      "(a sell exceeded recorded buys — transfer-in, reward, or unadjusted split). " +
      "These figures may be understated.",
  );
}
console.log("\nCompare the totals above to Robinhood's app 'Realized profit & loss' hub for the same spans.");
