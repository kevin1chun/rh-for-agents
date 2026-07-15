/**
 * Equity tax-lot tool — `robinhood_get_equity_tax_lots`. Mirrors the official
 * Robinhood Trading MCP tool of the same name over standard REST
 * (`GET /tax_lots/open/{account}/{instrument}/`, standard-token readable).
 *
 * Fidelity / safety:
 *  - The symbol is resolved by EXACT match (a fuzzy first-hit would silently
 *    return the wrong security's lots for the account — the lookup keys account
 *    data, so the "tolerant on reads" clause does not apply here).
 *  - Each lot echoes an `account_number`; that key is scrubbed from the lot
 *    bodies and the single caller-SUPPLIED account_number is echoed once at the
 *    envelope, matching the project-wide account-identifier rule.
 *  - Results are COMPLETE (all pages collected). We never surface a pagination
 *    cursor: a tax-lots `next` URL embeds the account number in its path, so
 *    `next_cursor` is always null and `cursor` is accepted only for API parity.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { scrubAccountIdentifiers } from "../../redact.js";
import { getAuthenticatedRh, text, textError } from "./_helpers.js";

const READ_ONLY = { readOnlyHint: true } as const;

export function registerTaxLotTools(server: McpServer): void {
  server.tool(
    "robinhood_get_equity_tax_lots",
    "List the open tax lots for one equity holding in an account — each lot is a separate acquisition with its own quantity, cost basis, acquisition date, and long/short-term status (`term`). Use it for cost-basis, holding-period, or which-lots-would-sell questions. Requires a symbol (tax lots are tracked per instrument, one symbol per call). Results are complete — all lots are returned and `next_cursor` is always null.",
    {
      account_number: z
        .string()
        .describe(
          "Brokerage account number whose lots you want (from robinhood_get_accounts). Must come from the user or be clearly implied.",
        ),
      symbol: z
        .string()
        .describe("Ticker symbol of the holding, e.g. AAPL. Tax lots are per instrument."),
      cursor: z
        .string()
        .nullish()
        .describe(
          "Accepted for API parity only — this server returns complete results, so pagination is unnecessary and next_cursor is always null.",
        ),
    },
    READ_ONLY,
    async ({ account_number, symbol }) => {
      try {
        const rh = await getAuthenticatedRh();
        const lots = await rh.getEquityTaxLots(symbol, { accountNumber: account_number });
        // Drop the per-lot account_number key; echo only the caller-supplied one.
        const scrubbed = scrubAccountIdentifiers(lots);
        return text({
          account_number,
          symbol: symbol.trim().toUpperCase(),
          count: scrubbed.length,
          tax_lots: scrubbed,
          next_cursor: null,
          note: "Open tax lots for this holding (a separate lot per acquisition still held). `term` is long/short-term; `book_cost_basis`/`tax_cost_basis`/`book_proceeds` are decimal-string amounts; `open_lot_id` is the id a sell-by-lot order would reference. Results are complete (all pages collected); no pagination cursor is surfaced because a tax-lots page URL embeds the account number.",
        });
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
