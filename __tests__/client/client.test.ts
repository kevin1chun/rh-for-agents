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
});
