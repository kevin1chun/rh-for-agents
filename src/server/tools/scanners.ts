/**
 * Scanner (screener) read tools for Robinhood.
 *
 * Both tools are read-only. They mirror the official Robinhood Trading MCP's
 * `get_scanner_filter_specs` and `get_scans`, reimplemented over the standard
 * surface with two deliberate, documented fidelity notes:
 *
 *  - `get_scanner_filter_specs` is served from an EMBEDDED static catalog
 *    captured verbatim from the official tool (the live Beacon filter-spec
 *    route isn't reachable with a standard token, and its raw wire shape
 *    differs from the DTO). Provenance is reported in the tool result's `note`
 *    and the description — never inside the spec objects, which stay byte-parity
 *    with the official DTO. See `src/client/scanner-filter-specs.ts`.
 *
 *  - `get_scans` passes through the live Beacon read but can only faithfully
 *    derive `scan_id`/`title`/`column_count`. The official DTO's
 *    `filter_summary` (filter i18n render), `cortex_managed` (a derived flag),
 *    and `sorting` (a human-readable column label) are produced MCP-side and
 *    are NOT reproduced — they are returned as `null`, with the complete raw
 *    Beacon object preserved under `raw` so nothing is hidden or fabricated.
 *
 * Scanner WRITES (create_scan / run_scan / update_scan_*) are Phase 4 and are
 * intentionally not implemented here.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Scan } from "../../client/index.js";
import { getAuthenticatedRh, text, textError } from "./_helpers.js";

const READ_ONLY = { readOnlyHint: true } as const;

/**
 * Map a raw Beacon scan to the official-DTO field names we can derive
 * faithfully, null the three we cannot reproduce, and preserve the full raw
 * object. `column_count` prefers the wire `columnCount`, falling back to the
 * length of the configured columns.
 */
function reshapeScan(raw: Scan) {
  const cfg = raw.activeScanConfiguration ?? undefined;
  const columns = cfg?.columns;
  const column_count =
    typeof raw.columnCount === "number"
      ? raw.columnCount
      : Array.isArray(columns)
        ? columns.length
        : null;
  return {
    scan_id: raw.scanId ?? raw.id ?? null,
    title: raw.title ?? null,
    column_count,
    // Rendered/derived by Robinhood's official MCP — not reproducible from raw
    // Beacon data. Explicitly null so their absence is never read as meaningful.
    filter_summary: null,
    cortex_managed: null,
    sorting: null,
    // Full raw Beacon object (camelCase) preserved for fidelity.
    raw,
  };
}

export function registerScannerTools(server: McpServer): void {
  server.tool(
    "robinhood_get_scanner_filter_specs",
    "List every valid scanner filter type and how to use it — the vocabulary for building a scan (fundamentals, price/volume, options, and technical indicators like RSI/MACD/EMA), each with its supported predicates, unit, and any supported lengths/intervals/plots. Call this before constructing scan filters; do not guess filter_type names. Note: this catalog is served from a static snapshot captured from Robinhood's official scanner service (it is account-agnostic and rarely changes), not a live per-request read — see the `note` in the result.",
    {},
    READ_ONLY,
    async () => {
      try {
        const rh = await getAuthenticatedRh();
        const filterSpecs = await rh.getScannerFilterSpecs();
        return text({
          count: filterSpecs.length,
          filter_specs: filterSpecs,
          note: 'Embedded static catalog captured verbatim from Robinhood\'s official scanner-filter-specs service; account-agnostic and not a live read. Usage: match filter_type exactly (e.g. FILTER_TYPE_PERCENT_CHANGE_FROM_CLOSE, not FILTER_TYPE_PERCENT_CHANGE); when a filter\'s supported_intervals is non-empty, pass an interval (omitting it is the leading cause of a valid filter returning nothing); use supported_predicates symbols exactly (e.g. ">", "BETWEEN").',
        });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_get_scans",
    "List your saved scanners (also called screeners) — each a saved set of filters and columns that screens the market (e.g. 'RSI > 70 and Volume > 1M'). Returns one entry per scan; empty when you have none (you create scans in Robinhood Legend). Each entry gives `scan_id`, `title`, and `column_count` derived from Robinhood's data, plus the complete raw scan under `raw`. The official fields `filter_summary`, `cortex_managed`, and `sorting` are rendered by Robinhood's own service and are returned as null here — see the result's `note`.",
    {},
    READ_ONLY,
    async () => {
      try {
        const rh = await getAuthenticatedRh();
        const scans = await rh.getScans();
        return text({
          count: scans.length,
          scans: scans.map(reshapeScan),
          note: "scan_id/title/column_count are derived faithfully from Robinhood's raw scan data. filter_summary (a human-readable filter list), cortex_managed (whether Robinhood's Cortex AI manages the scan), and sorting (a human-readable sort label) are produced by Robinhood's official MCP and are NOT reproduced here — they are null. Do NOT read their null as 'no filters', 'not Cortex-managed', or 'unsorted'; the underlying data is in `raw` (e.g. raw.activeScanConfiguration.filters / .sortingColumnId / .sortingDirection). Empty scans means you have no saved scanners.",
        });
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
