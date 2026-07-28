/**
 * The skill docs quote the exact error text an agent will see, and agents match
 * on those strings. If a guard's wording changes without the docs changing, an
 * agent silently stops recognising the failure — so pin them together.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RobinhoodClient } from "../../src/client/client.js";

vi.mock("../../src/client/http.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/client/http.js")>();
  return { ...actual, requestGet: vi.fn(), requestPost: vi.fn(), requestDelete: vi.fn() };
});

vi.mock("../../src/client/auth.js", () => ({
  restoreSession: vi
    .fn()
    .mockResolvedValue({ status: "logged_in", method: "cached", device_token: "dt" }),
  logout: vi.fn().mockResolvedValue(undefined),
  TOKEN_EXPIRY_SECONDS: 86400,
}));

const SKILL_DIR = join(import.meta.dirname, "../../skills/robinhood-for-agents");
const docs = ["trade.md", "reference.md", "client-api.md", "SKILL.md", "portfolio.md"].map((f) => ({
  name: f,
  text: readFileSync(join(SKILL_DIR, f), "utf8"),
}));
const docText = docs.map((d) => d.text).join("\n");

describe("skill docs match the code", () => {
  let client: RobinhoodClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    client = new RobinhoodClient();
    await client.restoreSession();
  });

  // Each case: the guard, and the docs that must quote its message verbatim.
  const guards: Array<{ what: string; run: () => Promise<unknown>; docs: string[] }> = [
    {
      what: "fractional short",
      run: () =>
        client.orderStock("AAPL", "sell_short", 1.5, { timeInForce: "gfd", accountNumber: "1" }),
      docs: ["trade.md", "client-api.md"],
    },
    {
      what: "gtc short",
      run: () =>
        client.orderStock("AAPL", "sell_short", 1, {
          limitPrice: 1,
          timeInForce: "gtc",
          marketHours: "regular_hours",
          accountNumber: "1",
        }),
      docs: ["trade.md", "client-api.md"],
    },
    {
      what: "short in the 24 Hour Market",
      run: () =>
        client.orderStock("AAPL", "sell_short", 1, {
          limitPrice: 1,
          timeInForce: "gfd",
          marketHours: "all_day_hours",
          accountNumber: "1",
        }),
      docs: ["trade.md", "client-api.md"],
    },
  ];

  for (const g of guards) {
    it(`documents the exact message for: ${g.what}`, async () => {
      let message = "";
      try {
        await g.run();
        throw new Error(`guard for "${g.what}" did not fire`);
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).not.toBe("");
      for (const docName of g.docs) {
        const doc = docs.find((d) => d.name === docName);
        expect(doc, `missing doc ${docName}`).toBeDefined();
        // The docs quote the message; allow a trailing detail like a quoted value.
        const quoted = message.split(" — ")[0] as string;
        expect(
          doc?.text.includes(quoted),
          `${docName} does not quote "${quoted}" — update the docs alongside the guard`,
        ).toBe(true);
      }
    });
  }

  // Facts an agent acts on that live only in prose.
  it("documents the short-sale accepted state", () => {
    expect(docText).toContain("locate_completed");
  });

  it("documents that a short position is a negative quantity", () => {
    expect(/negative/i.test(docText)).toBe(true);
  });
});
