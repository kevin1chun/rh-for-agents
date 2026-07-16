import { describe, expect, it } from "vitest";
import {
  SCANNER_FILTER_SPECS,
  SCANNER_FILTER_SPECS_CAPTURED_AT,
} from "../../src/client/scanner-filter-specs.js";
import { ScannerFilterSpecSchema } from "../../src/client/types.js";

/**
 * Structural drift-guard for the embedded scanner filter-spec catalog.
 *
 * The catalog is captured verbatim from the official Robinhood Trading MCP's
 * `get_scanner_filter_specs` (see `src/client/scanner-filter-specs.ts`). The
 * Vitest runner can't speak MCP to the official server, so the authoritative
 * live diff is a maintenance step performed at capture time. These assertions
 * lock the embedded catalog's integrity — count, uniqueness, official-DTO
 * conformance, and the known filter groups — so an accidental edit or a bad
 * regeneration fails CI rather than silently shipping a corrupted catalog.
 */
describe("SCANNER_FILTER_SPECS (embedded catalog)", () => {
  it("has the expected number of specs, all with unique filter_type", () => {
    expect(SCANNER_FILTER_SPECS.length).toBe(56);
    const ids = SCANNER_FILTER_SPECS.map((s) => s.filter_type);
    expect(new Set(ids).size).toBe(SCANNER_FILTER_SPECS.length);
  });

  it("every spec conforms to the official filter-spec DTO schema", () => {
    for (const spec of SCANNER_FILTER_SPECS) {
      expect(() => ScannerFilterSpecSchema.parse(spec)).not.toThrow();
    }
  });

  it("every filter_type uses the FILTER_TYPE_ prefix and carries predicates", () => {
    for (const spec of SCANNER_FILTER_SPECS) {
      expect(spec.filter_type).toMatch(/^FILTER_TYPE_[A-Z_]+$/);
      expect(spec.supported_predicates.length).toBeGreaterThan(0);
    }
  });

  it("covers exactly the four known filter groups", () => {
    const groups = new Set(SCANNER_FILTER_SPECS.map((s) => s.filter_group));
    expect([...groups].sort()).toEqual(["FUNDAMENTAL", "OPTION", "PRICE_VOLUME", "TECHNICAL"]);
  });

  it("optional array fields, when present, are non-empty and correctly typed", () => {
    for (const spec of SCANNER_FILTER_SPECS) {
      if (spec.supported_lengths !== undefined) {
        expect(spec.supported_lengths.length).toBeGreaterThan(0);
        expect(spec.supported_lengths.every((n) => typeof n === "number")).toBe(true);
      }
      if (spec.supported_intervals !== undefined) {
        expect(spec.supported_intervals.length).toBeGreaterThan(0);
      }
      if (spec.supported_plots !== undefined) {
        expect(spec.supported_plots.length).toBeGreaterThan(0);
      }
    }
  });

  it("includes representative well-known filters with expected shape", () => {
    const byType = new Map(SCANNER_FILTER_SPECS.map((s) => [s.filter_type, s]));
    expect(byType.has("FILTER_TYPE_MARKET_CAP")).toBe(true);
    // RSI is a technical indicator carrying both lengths and intervals.
    const rsi = byType.get("FILTER_TYPE_RSI");
    expect(rsi?.filter_group).toBe("TECHNICAL");
    expect(rsi?.supported_lengths?.length).toBeGreaterThan(0);
    expect(rsi?.supported_intervals?.length).toBeGreaterThan(0);
  });

  it("records a capture date (provenance)", () => {
    expect(SCANNER_FILTER_SPECS_CAPTURED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
