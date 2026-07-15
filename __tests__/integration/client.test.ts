/**
 * Integration tests — hit the REAL Robinhood API. Read-only by default; no
 * orders placed. Every assertion checks response SHAPE (field presence /
 * types), never values, so no account data or PII enters the repo.
 *
 * Plug in a token one of three ways, then run `bun run test:integration`:
 *   1. Direct token:   ROBINHOOD_ACCESS_TOKEN=<token> bun run test:integration
 *   2. Encrypted file: ROBINHOOD_TOKENS_FILE=<path> ROBINHOOD_TOKEN_KEY=<key> bun run test:integration
 *   3. OS keychain:    robinhood-for-agents onboard   (then) ROBINHOOD_INTEGRATION=1 bun run test:integration
 *
 * With none of the above set, the whole suite auto-skips (safe for CI).
 *
 * The ONE write test (watchlist add→remove) is additionally gated behind
 * ROBINHOOD_TEST_WRITES=1. It is fully reversible — it adds a symbol the list
 * does not already contain, verifies, removes it, and asserts the list is
 * restored — so it never leaves a lasting change.
 *
 * Uses Bun's test runner (not Vitest) because Bun.secrets is needed to load
 * tokens from the OS keychain, and Vitest runs in Node where it's unavailable.
 */

import { beforeAll, describe, expect, it } from "bun:test";
import { RobinhoodClient } from "../../src/client/index.js";

// Some endpoints are inherently slow: full order-history pagination, or the
// mover lists that resolve each instrument sequentially. Give them room so a
// working endpoint isn't flagged by the 5s default timeout.
const SLOW = 60_000;

const ACCESS_TOKEN = process.env.ROBINHOOD_ACCESS_TOKEN;
const ENABLED = Boolean(
  ACCESS_TOKEN || process.env.ROBINHOOD_TOKENS_FILE || process.env.ROBINHOOD_INTEGRATION === "1",
);

if (!ENABLED) {
  console.log(
    "[integration] skipped — set ROBINHOOD_ACCESS_TOKEN, ROBINHOOD_TOKENS_FILE, or ROBINHOOD_INTEGRATION=1 to run live.",
  );
}

const suite = ENABLED ? describe : describe.skip;
// The single write test is opt-in on top of ENABLED (it mutates, though
// reversibly). Off by default so a plain integration run never writes.
const WRITES_ENABLED = ENABLED && process.env.ROBINHOOD_TEST_WRITES === "1";

suite("integration: RobinhoodClient (live, read-only)", () => {
  const client = ACCESS_TOKEN
    ? new RobinhoodClient({ accessToken: ACCESS_TOKEN })
    : new RobinhoodClient();

  // Resolved live during setup so option/price tests use a real instrument.
  let firstAccount: string | undefined;
  let nearestOption: { expiration: string; strike: number; type: string } | undefined;

  beforeAll(async () => {
    if (!ACCESS_TOKEN) await client.restoreSession();
    const accounts = await client.getAccounts();
    firstAccount = accounts[0]?.account_number;

    // Resolve a real, near-term AAPL option contract for the options endpoints.
    try {
      const chain = await client.getChains("AAPL");
      const expiration = chain.expiration_dates?.[0];
      if (expiration) {
        const options = await client.findTradableOptions("AAPL", { expirationDate: expiration });
        const opt = options[0];
        if (opt?.strike_price && opt.type) {
          nearestOption = { expiration, strike: Number(opt.strike_price), type: opt.type };
        }
      }
    } catch {
      /* leave nearestOption undefined; the dependent tests assert reachability only */
    }
  }, SLOW);

  // ---- Auth / accounts / portfolio -----------------------------------------

  it("authenticates", () => {
    expect(client.isLoggedIn).toBe(true);
  });

  it("gets accounts", async () => {
    const accounts = await client.getAccounts();
    expect(accounts.length).toBeGreaterThan(0);
    expect(accounts[0]?.account_number).toBeDefined();
  });

  it("gets account profile", async () => {
    const account = await client.getAccountProfile();
    expect(account.account_number).toBeDefined();
  });

  it("gets portfolio profile", async () => {
    const portfolio = await client.getPortfolioProfile();
    expect(portfolio.equity).toBeDefined();
  });

  it("gets unified portfolio (bonfire)", async () => {
    const unified = await client.getUnifiedPortfolio(firstAccount);
    // null is a valid response — bonfire's unified endpoint only recognizes
    // the account Robinhood treats as default, so a non-default (but still
    // real) account_number 404s and getUnifiedPortfolio maps that to null
    // rather than throwing. Only check shape when data actually came back.
    if (unified !== null) {
      expect(unified.total_equity?.amount ?? unified.account_number).toBeDefined();
    }
  });

  it("gets live portfolio (bonfire)", async () => {
    const live = await client.getPortfolioLive(firstAccount);
    expect(live.equity_market_value ?? live.currency).toBeDefined();
  });

  it("gets user profile", async () => {
    const user = await client.getUserProfile();
    expect(user.username).toBeDefined();
  });

  it("gets investment profile", async () => {
    const profile = await client.getInvestmentProfile();
    expect(profile).toBeDefined();
  });

  // ---- Market data ----------------------------------------------------------

  it("gets stock quotes", async () => {
    const quotes = await client.getQuotes("AAPL");
    expect(quotes.length).toBe(1);
    expect(quotes[0]?.last_trade_price).not.toBeNull();
  });

  it("gets latest price", async () => {
    const prices = await client.getLatestPrice(["AAPL", "MSFT"]);
    expect(prices.length).toBe(2);
    for (const price of prices) expect(Number(price)).toBeGreaterThan(0);
  });

  it("gets fundamentals", async () => {
    const fundamentals = await client.getFundamentals(["AAPL"]);
    expect(fundamentals.length).toBeGreaterThan(0);
    expect(fundamentals[0]?.market_cap).toBeDefined();
  });

  it("gets stock historicals", async () => {
    const historicals = await client.getStockHistoricals("AAPL", {
      interval: "day",
      span: "week",
    });
    expect(historicals.length).toBeGreaterThan(0);
    expect(historicals[0]?.historicals.length).toBeGreaterThan(0);
  });

  it("gets the L2 price book", async () => {
    const priceBook = await client.getPriceBook("AAPL");
    expect(priceBook.instrument_id).toBeDefined();
    expect(Array.isArray(priceBook.asks)).toBe(true);
    expect(Array.isArray(priceBook.bids)).toBe(true);
  });

  it("gets earnings results for a symbol", async () => {
    const earnings = await client.getEarnings("AAPL");
    expect(Array.isArray(earnings)).toBe(true);
  });

  it("gets the market-wide earnings calendar", async () => {
    const calendar = await client.getEarningsCalendar(7);
    expect(Array.isArray(calendar)).toBe(true);
  });

  it("gets news", async () => {
    const news = await client.getNews("AAPL");
    expect(news.length).toBeGreaterThan(0);
    expect(news[0]?.title).toBeDefined();
  });

  it("gets ratings", async () => {
    const ratings = await client.getRatings("AAPL");
    expect(ratings).toBeDefined();
  });

  it("gets short interest", async () => {
    const si = await client.getShortInterest("AAPL");
    expect(si === null || typeof si === "object").toBe(true);
  });

  it("gets tradability", async () => {
    const tradability = await client.getTradability(["AAPL", "MSFT"]);
    expect(tradability.length).toBeGreaterThan(0);
    expect(tradability[0]?.symbol).toBeDefined();
  });

  it("finds instruments", async () => {
    const instruments = await client.findInstruments("AAPL");
    expect(instruments.length).toBeGreaterThan(0);
    expect(instruments[0]?.symbol).toBe("AAPL");
  });

  // ---- Positions & orders ---------------------------------------------------

  it("gets equity positions", async () => {
    const positions = await client.getPositions();
    expect(Array.isArray(positions)).toBe(true);
  });

  it("gets option positions (per-leg)", async () => {
    const positions = await client.getOptionPositions();
    expect(Array.isArray(positions)).toBe(true);
  });

  it("gets option aggregate positions", async () => {
    const positions = await client.getOptionAggregatePositions();
    expect(Array.isArray(positions)).toBe(true);
  });

  it(
    "gets stock orders",
    async () => {
      const orders = await client.getAllStockOrders();
      expect(Array.isArray(orders)).toBe(true);
    },
    SLOW,
  );

  it(
    "gets option orders",
    async () => {
      const orders = await client.getAllOptionOrders();
      expect(Array.isArray(orders)).toBe(true);
    },
    SLOW,
  );

  it(
    "gets crypto orders",
    async () => {
      const orders = await client.getAllCryptoOrders();
      expect(Array.isArray(orders)).toBe(true);
    },
    SLOW,
  );

  // ---- Options --------------------------------------------------------------

  it("gets option chains", async () => {
    const chain = await client.getChains("AAPL");
    expect(Array.isArray(chain.expiration_dates)).toBe(true);
  });

  it("finds tradable options", async () => {
    const expiration = nearestOption?.expiration;
    const options = await client.findTradableOptions("AAPL", { expirationDate: expiration });
    expect(Array.isArray(options)).toBe(true);
  });

  it("gets option market data", async () => {
    if (!nearestOption) return; // no live contract resolved; skip assertion
    const data = await client.getOptionMarketData(
      "AAPL",
      nearestOption.expiration,
      nearestOption.strike,
      nearestOption.type,
    );
    expect(Array.isArray(data)).toBe(true);
  });

  it("gets option historicals", async () => {
    if (!nearestOption) return;
    const historicals = await client.getOptionHistoricals(
      "AAPL",
      nearestOption.expiration,
      nearestOption.strike,
      nearestOption.type,
      { span: "day", interval: "hour" },
    );
    expect(Array.isArray(historicals)).toBe(true);
    if (historicals[0]) expect(Array.isArray(historicals[0].data_points)).toBe(true);
  });

  // ---- Indexes --------------------------------------------------------------

  it("gets index instruments", async () => {
    const indexes = await client.getIndexInstruments();
    expect(indexes.length).toBeGreaterThan(0);
    expect(indexes[0]?.symbol).toBeDefined();
  });

  it("gets an index value", async () => {
    const value = await client.getIndexValue("SPX");
    expect(value === null || typeof value === "object").toBe(true);
  });

  it("gets index quotes", async () => {
    const quotes = await client.getIndexQuotes(["SPX", "VIX"]);
    expect(Array.isArray(quotes)).toBe(true);
  });

  // ---- Crypto ---------------------------------------------------------------

  it("gets crypto positions", async () => {
    const positions = await client.getCryptoPositions();
    expect(Array.isArray(positions)).toBe(true);
  });

  it("gets a crypto quote", async () => {
    const quote = await client.getCryptoQuote("BTC");
    expect(quote).toBeDefined();
  });

  it("gets crypto historicals", async () => {
    const historicals = await client.getCryptoHistoricals("BTC", {
      interval: "day",
      span: "week",
    });
    expect(Array.isArray(historicals)).toBe(true);
  });

  // ---- Movers & screeners ---------------------------------------------------

  it(
    "gets top movers",
    async () => {
      const movers = await client.getTopMovers();
      expect(Array.isArray(movers)).toBe(true);
    },
    SLOW,
  );

  it(
    "gets the top 100",
    async () => {
      const stocks = await client.getTop100();
      expect(Array.isArray(stocks)).toBe(true);
    },
    SLOW,
  );

  it("gets scanner filter specs (embedded catalog)", async () => {
    // Account-agnostic static catalog (no live Beacon filter-spec route with a
    // standard token) — assert its shape, not a network round-trip.
    const specs = await client.getScannerFilterSpecs();
    expect(Array.isArray(specs)).toBe(true);
    expect(specs.length).toBeGreaterThan(0);
    expect(typeof specs[0]?.filter_type).toBe("string");
    expect(Array.isArray(specs[0]?.supported_predicates)).toBe(true);
  });

  it(
    "gets saved scans (beacon, live)",
    async () => {
      const scans = await client.getScans();
      expect(Array.isArray(scans)).toBe(true);
      // Empty when the account has no saved scanners; when present, each is a
      // raw Beacon object carrying a scanId/id + title.
      if (scans.length > 0) {
        const s = scans[0] as Record<string, unknown>;
        expect(typeof (s.scanId ?? s.id)).toBe("string");
      }
    },
    SLOW,
  );

  // ---- Realized P&L (computed) ----------------------------------------------
  // Value-free: asserts self-consistency invariants only, never symbols or amounts.

  it(
    "computes realized P&L with self-consistent invariants",
    async () => {
      const data = await client.getRealizedPnl();
      expect(Array.isArray(data.trades)).toBe(true);
      expect(Array.isArray(data.overrunSymbols)).toBe(true);
      expect(Number.isFinite(data.totalRealizedGain)).toBe(true);

      // Per-trade gains sum to the reported total (no value is revealed).
      const sum = data.trades.reduce((s, t) => s + t.realizedGain, 0);
      expect(Math.abs(sum - data.totalRealizedGain)).toBeLessThan(1e-6);

      // No NaN/Infinity anywhere; trades are chronological by closedAt.
      for (let i = 0; i < data.trades.length; i++) {
        const t = data.trades[i];
        expect(Number.isFinite(t?.quantity ?? Number.NaN)).toBe(true);
        expect(Number.isFinite(t?.price ?? Number.NaN)).toBe(true);
        expect(Number.isFinite(t?.realizedGain ?? Number.NaN)).toBe(true);
        if (i > 0) {
          expect((data.trades[i - 1]?.closedAt ?? "") <= (t?.closedAt ?? "")).toBe(true);
        }
      }
    },
    SLOW,
  );

  it(
    "buckets realized P&L into a gap-free series summing to the windowed total",
    async () => {
      const { bucketRealized } = await import("../../src/compute/realized-pnl.js");
      const data = await client.getRealizedPnl();
      if (data.trades.length === 0) return; // nothing to bucket on this account
      const start = data.trades[0]?.closedAt ?? new Date().toISOString();
      const end = new Date().toISOString();
      const buckets = bucketRealized(data.trades, start, end, "month");
      for (let i = 1; i < buckets.length; i++) {
        expect(buckets[i]?.startTime).toBe(buckets[i - 1]?.endTime); // tiles, no gap/overlap
      }
      const bucketSum = buckets.reduce((s, b) => s + b.realizedGain, 0);
      const windowSum = data.trades.reduce((s, t) => s + t.realizedGain, 0);
      expect(Math.abs(bucketSum - windowSum)).toBeLessThan(1e-6);
    },
    SLOW,
  );

  // ---- Order review (Phase 3, read-only simulation) -------------------------
  // Value-free: asserts DTO shape + collar behavior only. Nothing is placed.
  // Uses a liquid, cheap symbol and never surfaces prices/balances/account ids.

  it(
    "reviews an equity order without placing it, and reproduces the price collar",
    async () => {
      // Reasonable buy limit near a liquid price → no collar alert.
      const near = await client.reviewEquityOrder({
        symbol: "F",
        side: "buy",
        quantity: 1,
        limitPrice: 14,
        accountNumber: firstAccount,
      });
      expect(near.symbol).toBe("F");
      expect(near.type).toBe("limit");
      // A non-empty evaluated list makes an empty order_checks meaningful.
      expect(near.evaluated_checks.length).toBeGreaterThan(0);
      expect(near.quote).not.toBeNull();

      // A fat-fingered buy limit 10× the market → the collar must fire.
      const fat = await client.reviewEquityOrder({
        symbol: "F",
        side: "buy",
        quantity: 1,
        limitPrice: 140,
        accountNumber: firstAccount,
      });
      const oc = fat.order_checks as { alert_type?: string };
      expect(oc.alert_type).toBe("EQUITY_EXTREMELY_MARKETABLE_LIMIT_PRICE");
    },
    SLOW,
  );

  it(
    "reviews an option order with collateral, scrubbing account identifiers",
    async () => {
      const chain = await client.getChains("F");
      const exp = chain.expiration_dates?.[0];
      if (!exp) return; // no options on this symbol/account
      const review = await client.reviewOptionOrder({
        symbol: "F",
        legs: [
          {
            expirationDate: exp,
            strike: 14,
            optionType: "call",
            side: "buy",
            positionEffect: "open",
          },
        ],
        price: 0.5,
        quantity: 1,
        direction: "debit",
        accountNumber: firstAccount,
      });
      expect(review.legs.length).toBe(1);
      // The account number must NOT appear anywhere in the surfaced collateral.
      if (review.collateral && firstAccount) {
        expect(JSON.stringify(review.collateral).includes(firstAccount)).toBe(false);
      }
      // Options keep a thin, honestly-labeled check set.
      expect(review.not_evaluated_checks.length).toBeGreaterThan(0);
    },
    SLOW,
  );

  // ---- Watchlists -----------------------------------------------------------

  it("lists the user's watchlists", async () => {
    const lists = await client.getWatchlists();
    expect(Array.isArray(lists)).toBe(true);
    if (lists.length > 0) expect(typeof lists[0]?.id).toBe("string");
  });

  it("lists curated (popular) watchlists", async () => {
    const lists = await client.getPopularWatchlists();
    expect(Array.isArray(lists)).toBe(true);
    if (lists.length > 0) expect(typeof lists[0]?.id).toBe("string");
  });

  it("reads items of the first watchlist, enriched with symbol", async () => {
    const lists = await client.getWatchlists();
    const id = lists[0]?.id;
    if (!id) return;
    const items = await client.getWatchlistItems(id);
    expect(Array.isArray(items)).toBe(true);
    if (items.length > 0) {
      expect(typeof items[0]?.object_id).toBe("string");
      expect(typeof items[0]?.object_type).toBe("string");
    }
  });

  it("404s on an unknown watchlist id", async () => {
    await expect(
      client.getWatchlistItems("00000000-0000-4000-8000-000000000000"),
    ).rejects.toBeDefined();
  });

  it("resolves the options watchlist (or null)", async () => {
    const opt = await client.getOptionWatchlist();
    if (opt) expect(opt.allowed_object_types).toContain("option_strategy");
  });

  it("resolves an exact instrument by symbol", async () => {
    const inst = await client.resolveInstrumentBySymbol("AAPL");
    expect(inst.symbol).toBe("AAPL");
    expect(typeof inst.id).toBe("string");
  });

  it("lists crypto currency pairs", async () => {
    const pairs = await client.getCurrencyPairs();
    expect(Array.isArray(pairs)).toBe(true);
    if (pairs.length > 0) expect(typeof pairs[0]?.id).toBe("string");
  });

  // Reversible write — opt-in via ROBINHOOD_TEST_WRITES=1. Adds a symbol the
  // list lacks, verifies presence, removes it, and asserts full restoration.
  (WRITES_ENABLED ? it : it.skip)(
    "adds then removes a watchlist symbol, restoring the list",
    async () => {
      const lists = await client.getWatchlists();
      const list = lists[0];
      if (!list?.id) return;
      const before = await client.getWatchlistItems(list.id);
      const present = new Set(before.map((i) => (i.symbol ?? "").toUpperCase()));
      const testSym = ["KO", "PEP", "T", "F", "GE", "BAC", "PFE", "CSCO"].find(
        (s) => !present.has(s),
      );
      if (!testSym) return;
      const inst = await client.resolveInstrumentBySymbol(testSym);

      await client.updateWatchlistItems(list.id, "create", [
        { object_type: "instrument", object_id: inst.id },
      ]);
      const afterAdd = await client.getWatchlistItems(list.id);
      expect(afterAdd.some((i) => (i.symbol ?? "").toUpperCase() === testSym)).toBe(true);

      await client.updateWatchlistItems(list.id, "delete", [
        { object_type: "instrument", object_id: inst.id },
      ]);
      const afterRemove = await client.getWatchlistItems(list.id);
      expect(afterRemove.some((i) => (i.symbol ?? "").toUpperCase() === testSym)).toBe(false);
      expect(afterRemove.length).toBe(before.length);
    },
    SLOW,
  );

  // Reversible write — opt-in via ROBINHOOD_TEST_WRITES=1. Verifies the Phase-4
  // watchlist metadata write bodies end to end: create a throwaway, clearly
  // named list → read it back → rename it → read back → delete → assert gone.
  // The list name is unmistakable (`zz-rfa-probe-…`) and it is always deleted;
  // if cleanup fails, the final assertion fails loudly rather than leaking state.
  (WRITES_ENABLED ? it : it.skip)(
    "creates, updates, and deletes a throwaway watchlist (reversible)",
    async () => {
      const name = `zz-rfa-probe-${Date.now()}`;
      const created = await client.createWatchlist(name, {
        displayDescription: "temporary — safe to delete",
      });
      expect(created.id).toBeDefined();
      const listId = created.id as string;
      try {
        // Readback: the new list appears among the user's lists.
        const afterCreate = await client.getWatchlists();
        expect(afterCreate.some((l) => l.id === listId)).toBe(true);

        // Update its metadata and read back the change.
        const renamed = `${name}-renamed`;
        await client.updateWatchlist(listId, { displayName: renamed });
        const afterUpdate = await client.getWatchlists();
        const found = afterUpdate.find((l) => l.id === listId);
        expect(found?.display_name).toBe(renamed);
      } finally {
        // Always clean up, even if an assertion above threw.
        await client.deleteWatchlist(listId);
      }
      // Assert the delete actually removed it (no leaked probe list).
      const afterDelete = await client.getWatchlists();
      expect(afterDelete.some((l) => l.id === listId)).toBe(false);
    },
    SLOW,
  );

  // ---- Tax lots (Phase 5, read-only) ----------------------------------------
  it("reads open tax lots for a holding (empty or populated)", async () => {
    const accounts = await client.getAccounts();
    const account = accounts[0]?.account_number;
    if (!account) return;
    const lots = await client.getEquityTaxLots("AAPL", { accountNumber: account });
    expect(Array.isArray(lots)).toBe(true);
    if (lots.length > 0) {
      expect(typeof lots[0]?.open_lot_id).toBe("string");
      expect(typeof lots[0]?.term).toBe("string");
    }
  });

  // Reversible write — opt-in via ROBINHOOD_TEST_WRITES=1. Follows a curated list
  // the user does not already follow, verifies it appears, then unfollows and
  // asserts it is gone (original state restored).
  (WRITES_ENABLED ? it : it.skip)(
    "follows then unfollows a curated list, restoring state",
    async () => {
      const mine = new Set((await client.getWatchlists()).map((l) => l.id));
      const popular = await client.getPopularWatchlists();
      const target = popular.find((l) => l.id && !mine.has(l.id));
      if (!target?.id) return;

      await client.followWatchlist(target.id);
      const afterFollow = new Set((await client.getWatchlists()).map((l) => l.id));
      expect(afterFollow.has(target.id)).toBe(true);

      await client.unfollowWatchlist(target.id);
      const afterUnfollow = new Set((await client.getWatchlists()).map((l) => l.id));
      expect(afterUnfollow.has(target.id)).toBe(false);
    },
    SLOW,
  );

  // Reversible write — opt-in via ROBINHOOD_TEST_WRITES=1. Adds a single AAPL
  // call to the options watchlist via quick_add, verifies it by exact
  // strategy_code, then removes it via the midlands bulk-delete primitive and
  // asserts it is gone. Skips (stays reversible) if the contract is already listed.
  (WRITES_ENABLED ? it : it.skip)(
    "adds then removes an options-watchlist contract, restoring state",
    async () => {
      const chains = await client.getChains("AAPL");
      const calls = await client.findTradableOptions("AAPL", {
        expirationDate: chains.expiration_dates?.[0],
        optionType: "call",
      });
      const optionId = calls[0]?.id;
      const list = await client.getOptionWatchlist();
      if (!optionId || !list?.id) return;
      const expected = `${optionId}_L1`;
      const before = await client.getOptionWatchlistContracts();
      if (before.some((c) => c.strategy_code === expected)) return; // already present — stay reversible

      await client.quickAddOption(optionId, "long");
      const afterAdd = await client.getOptionWatchlistContracts();
      const added = afterAdd.find((c) => c.strategy_code === expected);
      expect(added?.object_id).toBeDefined();

      if (added?.object_id) {
        await client.updateWatchlistItems(list.id, "delete", [
          { object_type: "option_strategy", object_id: added.object_id },
        ]);
      }
      const afterRemove = await client.getOptionWatchlistContracts();
      expect(afterRemove.some((c) => c.strategy_code === expected)).toBe(false);
    },
    SLOW,
  );
});
