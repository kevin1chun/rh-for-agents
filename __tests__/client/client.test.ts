import { beforeEach, describe, expect, it, vi } from "vitest";
import { RobinhoodClient } from "../../src/client/client.js";
import { NotFoundError, NotLoggedInError } from "../../src/client/errors.js";

// Mock the HTTP helpers
vi.mock("../../src/client/http.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/client/http.js")>();
  return {
    ...actual,
    requestGet: vi.fn(),
    requestPost: vi.fn(),
    requestDelete: vi.fn(),
  };
});

// Mock the auth module
vi.mock("../../src/client/auth.js", () => ({
  restoreSession: vi
    .fn()
    .mockResolvedValue({ status: "logged_in", method: "cached", device_token: "dt" }),
  logout: vi.fn().mockResolvedValue(undefined),
  TOKEN_EXPIRY_SECONDS: 86400,
}));

import type { Mock } from "vitest";
import { requestGet, requestPost } from "../../src/client/http.js";

const mockRequestGet = requestGet as Mock;
const mockRequestPost = requestPost as Mock;

describe("RobinhoodClient", () => {
  let client: RobinhoodClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new RobinhoodClient();
  });

  describe("Auth guard", () => {
    it("throws NotLoggedInError when not logged in", async () => {
      await expect(client.getAccounts()).rejects.toThrow(NotLoggedInError);
    });

    it("allows calls after login", async () => {
      await client.restoreSession();
      expect(client.isLoggedIn).toBe(true);

      mockRequestGet.mockResolvedValueOnce([]);
      const accounts = await client.getAccounts();
      expect(accounts).toEqual([]);
    });
  });

  describe("Accounts", () => {
    beforeEach(async () => {
      await client.restoreSession();
    });

    it("getAccounts passes multi-account params", async () => {
      mockRequestGet.mockResolvedValueOnce([
        { url: "https://api.robinhood.com/accounts/123/", account_number: "123", type: "cash" },
      ]);
      await client.getAccounts();

      expect(mockRequestGet).toHaveBeenCalledWith(
        expect.anything(),
        "https://api.robinhood.com/accounts/",
        expect.objectContaining({
          dataType: "results",
          params: expect.objectContaining({
            default_to_all_accounts: "true",
          }),
        }),
      );
    });

    it("getAccountProfile with account number", async () => {
      mockRequestGet.mockResolvedValueOnce({
        url: "https://api.robinhood.com/accounts/123/",
        account_number: "123",
        type: "cash",
      });
      await client.getAccountProfile("123");

      expect(mockRequestGet).toHaveBeenCalledWith(
        expect.anything(),
        "https://api.robinhood.com/accounts/123/",
      );
    });

    it("getPositions with nonzero filter", async () => {
      mockRequestGet.mockResolvedValueOnce([]);
      await client.getPositions({ nonzero: true });

      expect(mockRequestGet).toHaveBeenCalledWith(
        expect.anything(),
        "https://api.robinhood.com/positions/",
        expect.objectContaining({
          dataType: "pagination",
          params: expect.objectContaining({ nonzero: "true" }),
        }),
      );
    });
  });

  describe("Stocks", () => {
    beforeEach(async () => {
      await client.restoreSession();
    });

    it("getQuotes normalizes symbols", async () => {
      mockRequestGet.mockResolvedValueOnce([{ symbol: "AAPL" }]);
      await client.getQuotes(" aapl ");

      expect(mockRequestGet).toHaveBeenCalledWith(
        expect.anything(),
        "https://api.robinhood.com/quotes/",
        expect.objectContaining({
          params: { symbols: "AAPL" },
        }),
      );
    });

    it("getLatestPrice returns price strings", async () => {
      mockRequestGet.mockResolvedValueOnce([
        { symbol: "AAPL", last_trade_price: "150.00", ask_price: "150.10", bid_price: "149.90" },
      ]);
      const prices = await client.getLatestPrice(["AAPL"]);
      expect(prices).toEqual(["150.00"]);
    });

    it("getLatestPrice respects priceType", async () => {
      mockRequestGet.mockResolvedValueOnce([
        { symbol: "AAPL", last_trade_price: "150.00", ask_price: "150.10", bid_price: "149.90" },
      ]);
      const prices = await client.getLatestPrice(["AAPL"], { priceType: "bid_price" });
      expect(prices).toEqual(["149.90"]);
    });

    it("getStockHistoricals returns per-symbol structure", async () => {
      mockRequestGet.mockResolvedValueOnce([
        { symbol: "AAPL", historicals: [{ begins_at: "2024-01-01", close_price: "150.00" }] },
      ]);
      const result = await client.getStockHistoricals("AAPL");
      expect(result).toHaveLength(1);
      expect(result[0]?.symbol).toBe("AAPL");
      expect(result[0]?.historicals).toHaveLength(1);
    });
  });

  describe("Orders", () => {
    beforeEach(async () => {
      await client.restoreSession();
    });

    it("getOpenStockOrders filters by cancel field", async () => {
      mockRequestGet.mockResolvedValueOnce([
        { id: "1", cancel: "https://cancel/1" },
        { id: "2", cancel: null },
        { id: "3", cancel: "https://cancel/3" },
      ]);
      const open = await client.getOpenStockOrders();
      expect(open).toHaveLength(2);
    });

    it("getOpenOptionOrders filters by cancel_url", async () => {
      mockRequestGet.mockResolvedValueOnce([
        { id: "1", cancel_url: "https://cancel/1" },
        { id: "2", cancel_url: null },
      ]);
      const open = await client.getOpenOptionOrders();
      expect(open).toHaveLength(1);
    });
  });

  describe("buildHoldings", () => {
    beforeEach(async () => {
      await client.restoreSession();
    });

    it("computes holdings from positions, instruments, and quotes", async () => {
      // getPositions (pagination)
      mockRequestGet.mockResolvedValueOnce([
        {
          instrument: "https://api.robinhood.com/instruments/abc/",
          quantity: "10",
          average_buy_price: "100.00",
        },
      ]);
      // getInstrumentByUrl
      mockRequestGet.mockResolvedValueOnce({
        url: "https://api.robinhood.com/instruments/abc/",
        id: "abc",
        symbol: "AAPL",
        name: "Apple Inc",
        simple_name: "Apple",
        type: "stock",
      });
      // getQuotes (results)
      mockRequestGet.mockResolvedValueOnce([
        {
          symbol: "AAPL",
          last_trade_price: "150.00",
          ask_price: "150.10",
          bid_price: "149.90",
          previous_close: "148.00",
          adjusted_previous_close: "148.00",
          pe_ratio: "25.5",
        },
      ]);

      const holdings = await client.buildHoldings();

      expect(holdings).toHaveProperty("AAPL");
      const aapl = holdings["AAPL"];
      expect(aapl?.price).toBe("150");
      expect(aapl?.quantity).toBe("10");
      expect(aapl?.average_buy_price).toBe("100");
      expect(aapl?.equity).toBe("1500");
      expect(aapl?.name).toBe("Apple");
    });

    it("returns empty object when no positions", async () => {
      // getPositions returns empty
      mockRequestGet.mockResolvedValueOnce([]);

      const holdings = await client.buildHoldings();

      expect(holdings).toEqual({});
    });

    it("includes dividend_rate when withDividends is true", async () => {
      // getPositions (pagination)
      mockRequestGet.mockResolvedValueOnce([
        {
          instrument: "https://api.robinhood.com/instruments/abc/",
          quantity: "10",
          average_buy_price: "100.00",
        },
      ]);
      // getInstrumentByUrl
      mockRequestGet.mockResolvedValueOnce({
        url: "https://api.robinhood.com/instruments/abc/",
        id: "abc",
        symbol: "AAPL",
        name: "Apple Inc",
        simple_name: "Apple",
        type: "stock",
      });
      // getQuotes (results)
      mockRequestGet.mockResolvedValueOnce([
        {
          symbol: "AAPL",
          last_trade_price: "150.00",
          ask_price: "150.10",
          bid_price: "149.90",
          previous_close: "148.00",
          adjusted_previous_close: "148.00",
          pe_ratio: "25.5",
        },
      ]);
      // getFundamentals (results)
      mockRequestGet.mockResolvedValueOnce([{ symbol: "AAPL", dividend_yield: "0.55" }]);

      const holdings = await client.buildHoldings({ withDividends: true });

      expect(holdings).toHaveProperty("AAPL");
      expect(holdings["AAPL"]?.dividend_rate).toBe("0.55");
    });
  });

  describe("buildHoldings edge cases", () => {
    beforeEach(async () => {
      await client.restoreSession();
    });

    it("uses price 0 when quote not found for a symbol", async () => {
      // getPositions
      mockRequestGet.mockResolvedValueOnce([
        {
          instrument: "https://api.robinhood.com/instruments/abc/",
          quantity: "5",
          average_buy_price: "50.00",
        },
      ]);
      // getInstrumentByUrl
      mockRequestGet.mockResolvedValueOnce({
        url: "https://api.robinhood.com/instruments/abc/",
        id: "abc",
        symbol: "XYZ",
        name: "XYZ Corp",
        simple_name: "XYZ",
        type: "stock",
      });
      // getQuotes returns empty (no match for XYZ)
      mockRequestGet.mockResolvedValueOnce([]);

      const holdings = await client.buildHoldings();

      expect(holdings).toHaveProperty("XYZ");
      expect(holdings["XYZ"]?.price).toBe("0");
      expect(holdings["XYZ"]?.equity).toBe("0");
    });
  });

  describe("orderStock validation", () => {
    beforeEach(async () => {
      await client.restoreSession();
    });

    it("throws NotFoundError when instrument not found", async () => {
      // findInstruments returns empty
      mockRequestGet.mockResolvedValueOnce([]);

      await expect(client.orderStock("INVALID", "buy", 1)).rejects.toThrow(NotFoundError);
    });

    it("throws when trailAmount combined with limitPrice", async () => {
      await expect(
        client.orderStock("AAPL", "buy", 1, {
          trailAmount: 5,
          limitPrice: 150,
        }),
      ).rejects.toThrow("Cannot combine trailAmount with limitPrice or stopPrice");
    });

    it("throws when trailAmount combined with stopPrice", async () => {
      await expect(
        client.orderStock("AAPL", "buy", 1, {
          trailAmount: 5,
          stopPrice: 140,
        }),
      ).rejects.toThrow("Cannot combine trailAmount with limitPrice or stopPrice");
    });

    it("uses account URL from getAccounts when accountNumber not provided", async () => {
      // findInstruments
      mockRequestGet.mockResolvedValueOnce([
        {
          url: "https://api.robinhood.com/instruments/abc/",
          id: "abc",
          symbol: "AAPL",
          name: "Apple Inc",
          type: "stock",
        },
      ]);
      // getAccounts
      mockRequestGet.mockResolvedValueOnce([
        { url: "https://api.robinhood.com/accounts/123/", account_number: "123" },
      ]);
      // POST order
      mockRequestPost.mockResolvedValueOnce({ id: "order1", state: "queued" });

      await client.orderStock("AAPL", "buy", 1, { timeInForce: "gfd" });

      expect(mockRequestPost).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        expect.objectContaining({
          payload: expect.objectContaining({
            account: "https://api.robinhood.com/accounts/123/",
            order_form_version: 7,
          }),
        }),
      );
    });

    it("uses account URL from accountNumber param when provided", async () => {
      // findInstruments
      mockRequestGet.mockResolvedValueOnce([
        {
          url: "https://api.robinhood.com/instruments/abc/",
          id: "abc",
          symbol: "AAPL",
          name: "Apple Inc",
          type: "stock",
        },
      ]);
      // POST order
      mockRequestPost.mockResolvedValueOnce({ id: "order1", state: "queued" });

      await client.orderStock("AAPL", "buy", 1, { timeInForce: "gfd", accountNumber: "456" });

      expect(mockRequestPost).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        expect.objectContaining({
          payload: expect.objectContaining({
            account: "https://api.robinhood.com/accounts/456/",
          }),
        }),
      );
    });
  });

  describe("orderOption validation", () => {
    beforeEach(async () => {
      await client.restoreSession();
    });

    it("throws NotFoundError when no tradable option found", async () => {
      // getIndexes (no index match for AAPL)
      mockRequestGet.mockResolvedValueOnce([]);
      // getChains (equity path)
      mockRequestGet.mockResolvedValueOnce([{ id: "c1", expiration_dates: [] }]);
      // findTradableOptions returns empty
      mockRequestGet.mockResolvedValueOnce([]);

      await expect(
        client.orderOption(
          "AAPL",
          [
            {
              expirationDate: "2025-01-17",
              strike: 150,
              optionType: "call",
              side: "buy",
              positionEffect: "open",
            },
          ],
          5.0,
          1,
          "debit",
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it("includes account URL from getAccounts when accountNumber not provided", async () => {
      // getIndexes
      mockRequestGet.mockResolvedValueOnce([]);
      // getChains (equity path)
      mockRequestGet.mockResolvedValueOnce([{ id: "c1", expiration_dates: ["2025-01-17"] }]);
      // findTradableOptions
      mockRequestGet.mockResolvedValueOnce([
        {
          url: "https://api.robinhood.com/options/instruments/opt1/",
          id: "opt1",
          strike_price: "150.0000",
          expiration_date: "2025-01-17",
          type: "call",
          state: "active",
          tradability: "tradable",
        },
      ]);
      // getAccounts (for resolveAccountUrl)
      mockRequestGet.mockResolvedValueOnce([
        { url: "https://api.robinhood.com/accounts/123/", account_number: "123" },
      ]);
      // POST order
      mockRequestPost.mockResolvedValueOnce({ id: "opt-order1", state: "queued" });

      await client.orderOption(
        "AAPL",
        [
          {
            expirationDate: "2025-01-17",
            strike: 150,
            optionType: "call",
            side: "buy",
            positionEffect: "open",
          },
        ],
        5.0,
        1,
        "debit",
      );

      expect(mockRequestPost).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        expect.objectContaining({
          payload: expect.objectContaining({
            account: "https://api.robinhood.com/accounts/123/",
          }),
        }),
      );
    });

    it("includes account URL from accountNumber param when provided", async () => {
      // getIndexes
      mockRequestGet.mockResolvedValueOnce([]);
      // getChains (equity path)
      mockRequestGet.mockResolvedValueOnce([{ id: "c1", expiration_dates: ["2025-01-17"] }]);
      // findTradableOptions
      mockRequestGet.mockResolvedValueOnce([
        {
          url: "https://api.robinhood.com/options/instruments/opt1/",
          id: "opt1",
          strike_price: "150.0000",
          expiration_date: "2025-01-17",
          type: "call",
          state: "active",
          tradability: "tradable",
        },
      ]);
      // POST order
      mockRequestPost.mockResolvedValueOnce({ id: "opt-order1", state: "queued" });

      await client.orderOption(
        "AAPL",
        [
          {
            expirationDate: "2025-01-17",
            strike: 150,
            optionType: "call",
            side: "buy",
            positionEffect: "open",
          },
        ],
        5.0,
        1,
        "debit",
        { accountNumber: "789" },
      );

      expect(mockRequestPost).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        expect.objectContaining({
          payload: expect.objectContaining({
            account: "https://api.robinhood.com/accounts/789/",
          }),
        }),
      );
    });
  });

  describe("orderCrypto validation", () => {
    beforeEach(async () => {
      await client.restoreSession();
    });

    it("throws NotFoundError when crypto pair not found", async () => {
      // getCryptoQuote → cryptoCurrencyPairs
      mockRequestGet.mockResolvedValueOnce([{ id: "btc-usd", asset_currency: { code: "BTC" } }]);

      await expect(client.orderCrypto("INVALID", "buy", 1)).rejects.toThrow(NotFoundError);
    });
  });

  describe("Logout", () => {
    it("sets loggedIn to false", async () => {
      await client.restoreSession();
      expect(client.isLoggedIn).toBe(true);

      await client.logout();
      expect(client.isLoggedIn).toBe(false);
    });
  });

  describe("getFundamentals", () => {
    beforeEach(async () => {
      await client.restoreSession();
    });

    it("returns the full fundamentals field set (incl. float, pb_ratio, dividend schedule)", async () => {
      // A realistic /fundamentals/ result row. The endpoint returns far more than
      // the legacy schema declared; these fields must survive to the caller.
      mockRequestGet.mockResolvedValueOnce([
        {
          symbol: "AAPL",
          open: "311.91",
          volume: "6937140",
          market_cap: "4566753282000",
          pe_ratio: "37.58",
          pb_ratio: "42.7892",
          shares_outstanding: "14687400000",
          float: "14669349185.4",
          average_volume_30_days: "68434826.7547",
          high_52_weeks: "317.40",
          high_52_weeks_date: "2026-06-08",
          dividend_per_share: "0.27",
          distribution_frequency: "Quarterly",
          ex_dividend_date: "2026-05-11",
          financial_status_indicator: "CC0",
          sector: "Electronic Technology",
        },
      ]);

      const [aapl] = await client.getFundamentals(["aapl"]);

      // requestGet hit the fundamentals endpoint with a joined, upper-cased symbol list
      expect(mockRequestGet).toHaveBeenCalledTimes(1);
      expect(mockRequestGet).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("/fundamentals/"),
        expect.objectContaining({ dataType: "results", params: { symbols: "AAPL" } }),
      );

      // Newly-typed fields are present and accessible on the Fundamental type
      expect(aapl?.float).toBe("14669349185.4");
      expect(aapl?.pb_ratio).toBe("42.7892");
      expect(aapl?.average_volume_30_days).toBe("68434826.7547");
      expect(aapl?.dividend_per_share).toBe("0.27");
      expect(aapl?.high_52_weeks_date).toBe("2026-06-08");
      expect(aapl?.financial_status_indicator).toBe("CC0");
    });
  });

  describe("getEarnings", () => {
    beforeEach(async () => {
      await client.restoreSession();
    });

    it("exposes EPS nested under `eps` (not flat estimate/actual), plus call/report", async () => {
      mockRequestGet.mockResolvedValueOnce([{ id: "abc", symbol: "AAPL" }]); // findInstruments
      // Live /marketdata/earnings/ nests estimate/actual under `eps`; the old flat
      // top-level estimate/actual fields never appear in the response.
      mockRequestGet.mockResolvedValueOnce([
        {
          symbol: "AAPL",
          year: 2026,
          quarter: 2,
          eps: { estimate: "1.40", actual: "1.53" },
          report: { date: "2026-05-01", timing: "am", verified: true },
          call: {
            datetime: "2026-05-01T21:00:00Z",
            broadcast_url: null,
            replay_url: "https://x/r",
          },
        },
      ]);

      const [q] = await client.getEarnings("AAPL");

      expect(q?.eps?.estimate).toBe("1.40");
      expect(q?.eps?.actual).toBe("1.53");
      expect(q?.report?.verified).toBe(true);
      expect(q?.call?.replay_url).toBe("https://x/r");
    });
  });

  describe("getShortInterest", () => {
    beforeEach(async () => {
      await client.restoreSession();
    });

    const envelope = (daily: Array<Record<string, string>>) => ({
      status: "SUCCESS",
      data: [
        {
          status: "SUCCESS",
          data: { symbol: "AAPL", instrument_id: "inst1", daily_data: daily },
        },
      ],
    });

    // Params of the nth requestGet call (1-indexed), for asserting the window.
    const paramsOfCall = (n: number) =>
      (mockRequestGet.mock.calls[n - 1]?.[2] as { params?: Record<string, string> })?.params;

    it("resolves the instrument and fetches a single ≤92-day window", async () => {
      mockRequestGet.mockResolvedValueOnce([{ id: "inst1", symbol: "AAPL" }]); // findInstruments
      mockRequestGet.mockResolvedValueOnce(
        envelope([{ date: "2026-07-13", shares_short: "141171395.64", pc_freefloat: "0.9628" }]),
      );

      const si = await client.getShortInterest("aapl", {
        startDate: "2026-05-16",
        endDate: "2026-06-14",
      });

      expect(si?.symbol).toBe("AAPL");
      expect(si?.daily_data).toHaveLength(1);
      expect(si?.daily_data[0]?.pc_freefloat).toBe("0.9628");

      // One endpoint call (range < 92d), hitting short/v1 with ids + both dates.
      expect(mockRequestGet).toHaveBeenCalledTimes(2);
      expect(mockRequestGet).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        expect.stringContaining("/marketdata/fundamentals/short/v1/"),
        expect.objectContaining({
          params: { ids: "inst1", start_date: "2026-05-16", end_date: "2026-06-14" },
        }),
      );
    });

    it("chunks a >92-day range into ≤90-day windows and merges by date", async () => {
      mockRequestGet.mockResolvedValueOnce([{ id: "inst1", symbol: "AAPL" }]); // findInstruments
      // Window 1: [2026-04-02 .. 2026-07-01]; window 2: [2026-01-01 .. 2026-04-01].
      mockRequestGet.mockResolvedValueOnce(
        envelope([
          { date: "2026-06-15", pc_freefloat: "1.0" },
          { date: "2026-04-02", pc_freefloat: "2.0" },
        ]),
      );
      mockRequestGet.mockResolvedValueOnce(
        envelope([
          { date: "2026-04-02", pc_freefloat: "9.9" }, // duplicate date → last write wins
          { date: "2026-02-01", pc_freefloat: "3.0" },
        ]),
      );

      const si = await client.getShortInterest("AAPL", {
        startDate: "2026-01-01",
        endDate: "2026-07-01",
      });

      // Merged, de-duplicated by date, sorted ascending.
      expect(si?.daily_data.map((d) => d.date)).toEqual(["2026-02-01", "2026-04-02", "2026-06-15"]);
      expect(si?.daily_data.find((d) => d.date === "2026-04-02")?.pc_freefloat).toBe("9.9");

      // Two non-overlapping ≤90-day windows walking backward.
      expect(mockRequestGet).toHaveBeenCalledTimes(3);
      expect(paramsOfCall(2)).toEqual({
        ids: "inst1",
        start_date: "2026-04-02",
        end_date: "2026-07-01",
      });
      expect(paramsOfCall(3)).toEqual({
        ids: "inst1",
        start_date: "2026-01-01",
        end_date: "2026-04-01",
      });
    });

    it("stops walking back at the first empty window when fetching full history", async () => {
      mockRequestGet.mockResolvedValueOnce([{ id: "inst1", symbol: "AAPL" }]); // findInstruments
      mockRequestGet.mockResolvedValueOnce(envelope([{ date: "2026-06-15", pc_freefloat: "1.0" }]));
      mockRequestGet.mockResolvedValueOnce(envelope([])); // older window: no data → stop

      const si = await client.getShortInterest("AAPL", { endDate: "2026-07-14" });

      expect(si?.daily_data).toHaveLength(1);
      // findInstruments + 2 windows, then break (no endless paging into empty years).
      expect(mockRequestGet).toHaveBeenCalledTimes(3);
    });

    it("prefers the exact ticker match among fuzzy search results", async () => {
      mockRequestGet.mockResolvedValueOnce([
        { id: "other", symbol: "AAPLW" },
        { id: "inst1", symbol: "AAPL" },
      ]);
      mockRequestGet.mockResolvedValueOnce(envelope([{ date: "2026-06-15", pc_freefloat: "1.0" }]));
      mockRequestGet.mockResolvedValueOnce(envelope([])); // stop

      await client.getShortInterest("AAPL", { endDate: "2026-07-14" });

      expect(paramsOfCall(2)?.ids).toBe("inst1");
    });

    it("returns null when the symbol resolves to no instrument", async () => {
      mockRequestGet.mockResolvedValueOnce([]); // findInstruments empty
      const si = await client.getShortInterest("NOPE");
      expect(si).toBeNull();
      // Short-circuits before hitting the endpoint.
      expect(mockRequestGet).toHaveBeenCalledTimes(1);
    });

    it("returns null when the instrument resolves but the endpoint has no data", async () => {
      mockRequestGet.mockResolvedValueOnce([{ id: "inst1", symbol: "AAPL" }]);
      mockRequestGet.mockResolvedValueOnce(envelope([])); // empty on the first window
      const si = await client.getShortInterest("AAPL", { endDate: "2026-07-14" });
      expect(si).toBeNull();
    });

    it("fetches a single window when startDate equals endDate", async () => {
      mockRequestGet.mockResolvedValueOnce([{ id: "inst1", symbol: "AAPL" }]);
      mockRequestGet.mockResolvedValueOnce(envelope([{ date: "2026-07-01", pc_freefloat: "1.0" }]));

      await client.getShortInterest("AAPL", { startDate: "2026-07-01", endDate: "2026-07-01" });

      expect(mockRequestGet).toHaveBeenCalledTimes(2);
      expect(paramsOfCall(2)).toEqual({
        ids: "inst1",
        start_date: "2026-07-01",
        end_date: "2026-07-01",
      });
    });

    it("throws when startDate is after endDate (before any network call)", async () => {
      await expect(
        client.getShortInterest("AAPL", { startDate: "2026-07-01", endDate: "2026-01-01" }),
      ).rejects.toThrow(/startDate .* is after endDate/);
      // Rejected during validation — findInstruments was never called.
      expect(mockRequestGet).not.toHaveBeenCalled();
    });

    it("throws on a calendar-invalid date rather than a raw RangeError", async () => {
      await expect(client.getShortInterest("AAPL", { startDate: "2026-13-45" })).rejects.toThrow(
        /Invalid startDate/,
      );
      expect(mockRequestGet).not.toHaveBeenCalled();
    });

    it("throws on a well-formed but non-existent calendar date (no Date.parse roll-forward)", async () => {
      await expect(client.getShortInterest("AAPL", { startDate: "2026-02-30" })).rejects.toThrow(
        /Invalid startDate/,
      );
      expect(mockRequestGet).not.toHaveBeenCalled();
    });

    it("throws when endDate is in the future (before any network call)", async () => {
      await expect(client.getShortInterest("AAPL", { endDate: "2999-01-01" })).rejects.toThrow(
        /endDate .* is in the future/,
      );
      expect(mockRequestGet).not.toHaveBeenCalled();
    });

    it("caps the walk at MAX_WINDOWS windows even when every window has data", async () => {
      mockRequestGet.mockResolvedValueOnce([{ id: "inst1", symbol: "AAPL" }]); // findInstruments
      // Every subsequent window returns data → the empty-window stop never fires,
      // so only the MAX_WINDOWS (12) runaway guard bounds the loop.
      mockRequestGet.mockResolvedValue(envelope([{ date: "2026-06-15", pc_freefloat: "1.0" }]));

      await client.getShortInterest("AAPL", { endDate: "2026-07-14" });

      // 1 findInstruments + at most 12 endpoint windows.
      expect(mockRequestGet).toHaveBeenCalledTimes(13);
    });
  });

  describe("getQuotes (widened Quote fields)", () => {
    beforeEach(async () => {
      await client.restoreSession();
    });

    it("surfaces size / instrument / state fields the old schema omitted", async () => {
      mockRequestGet.mockResolvedValueOnce([
        {
          symbol: "AAPL",
          last_trade_price: "312.38",
          ask_size: 200,
          bid_size: 100,
          instrument_id: "abc-123",
          state: "active",
        },
      ]);
      const [q] = await client.getQuotes(["AAPL"]);
      expect(q?.ask_size).toBe(200);
      expect(q?.bid_size).toBe(100);
      expect(q?.instrument_id).toBe("abc-123");
      expect(q?.state).toBe("active");
    });
  });

  describe("getPositions (widened Position fields)", () => {
    beforeEach(async () => {
      await client.restoreSession();
    });

    it("surfaces timestamps and pending cost basis", async () => {
      mockRequestGet.mockResolvedValueOnce([
        {
          instrument: "https://api.robinhood.com/instruments/abc/",
          quantity: "9",
          average_buy_price: "150.00",
          pending_average_buy_price: "150.00",
          created_at: "2026-01-02T00:00:00Z",
          updated_at: "2026-07-08T00:00:00Z",
        },
      ]);
      const [p] = await client.getPositions({ nonzero: true });
      expect(p?.pending_average_buy_price).toBe("150.00");
      expect(p?.created_at).toBe("2026-01-02T00:00:00Z");
      expect(p?.updated_at).toBe("2026-07-08T00:00:00Z");
    });
  });

  describe("getAllStockOrders (widened StockOrder fields)", () => {
    beforeEach(async () => {
      await client.restoreSession();
    });

    it("surfaces the agent-attribution fields", async () => {
      mockRequestGet.mockResolvedValueOnce([
        { id: "o1", state: "filled", agent_id: "ag-1", agent_display_name: "Agentic" },
      ]);
      const [o] = await client.getAllStockOrders();
      expect(o?.agent_id).toBe("ag-1");
      expect(o?.agent_display_name).toBe("Agentic");
    });
  });

  describe("getOptionMarketData (widened OptionMarketData fields)", () => {
    beforeEach(async () => {
      await client.restoreSession();
    });

    it("surfaces adjusted mark price + sizes alongside the greeks", async () => {
      // resolution chain: getIndexes -> findInstruments -> optionChains -> optionInstruments -> marketdata
      mockRequestGet.mockResolvedValueOnce([]); // getIndexes: AAPL is not an index
      mockRequestGet.mockResolvedValueOnce([{ symbol: "AAPL", id: "inst1" }]); // findInstruments
      mockRequestGet.mockResolvedValueOnce([{ id: "chain1", expiration_dates: ["2026-07-08"] }]); // chains
      mockRequestGet.mockResolvedValueOnce([
        { id: "opt1", expiration_date: "2026-07-08", strike_price: "312.5000", type: "call" },
      ]); // option instruments (survives the client-side filter)
      mockRequestGet.mockResolvedValueOnce({
        delta: "0.52",
        adjusted_mark_price: "5.40",
        ask_size: 30,
        bid_size: 25,
        instrument: "https://api.robinhood.com/options/instruments/opt1/",
      }); // market data
      const [md] = await client.getOptionMarketData("AAPL", "2026-07-08", 312.5, "call");
      expect(md?.delta).toBe("0.52");
      expect(md?.adjusted_mark_price).toBe("5.40");
      expect(md?.ask_size).toBe(30);
      expect(md?.instrument).toBe("https://api.robinhood.com/options/instruments/opt1/");
    });
  });
});
