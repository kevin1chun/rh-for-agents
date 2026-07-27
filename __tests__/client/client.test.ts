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
import { requestDelete, requestGet, requestPost } from "../../src/client/http.js";

const mockRequestGet = requestGet as Mock;
const mockRequestPost = requestPost as Mock;
const mockRequestDelete = requestDelete as Mock;

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

    // Robinhood models a short as its own side value paired with
    // position_effect: "open" — sending either alone is rejected by the API
    // ("Not enough shares to sell." / "This type of trade is invalid.").
    it("sends sell_short with position_effect open and an explicit session", async () => {
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
      mockRequestPost.mockResolvedValueOnce({ id: "order1", state: "locate_completed" });

      await client.orderStock("AAPL", "sell_short", 10, {
        limitPrice: 150,
        timeInForce: "gfd",
        accountNumber: "456",
      });

      expect(mockRequestPost).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        expect.objectContaining({
          payload: expect.objectContaining({
            side: "sell_short",
            position_effect: "open",
            market_hours: "regular_hours",
            order_form_version: 7,
          }),
        }),
      );
    });

    // Outside regular hours the API rejects a short unless the session is named
    // ("change your trading session to extended hours").
    it("names the extended-hours session for an extended-hours short", async () => {
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
      mockRequestPost.mockResolvedValueOnce({ id: "order1", state: "locate_completed" });

      await client.orderStock("AAPL", "sell_short", 10, {
        limitPrice: 150,
        timeInForce: "gfd",
        extendedHours: true,
        accountNumber: "456",
      });

      expect(mockRequestPost).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        expect.objectContaining({
          payload: expect.objectContaining({
            side: "sell_short",
            extended_hours: true,
            market_hours: "extended_hours",
          }),
        }),
      );
    });

    it("leaves ordinary buy/sell payloads untouched", async () => {
      for (const side of ["buy", "sell"] as const) {
        mockRequestPost.mockClear();
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

        await client.orderStock("AAPL", side, 1, { timeInForce: "gfd", accountNumber: "456" });

        const payload = mockRequestPost.mock.calls[0]?.[2]?.payload as Record<string, unknown>;
        expect(payload.side).toBe(side);
        // Both fields are short-sale-only: the server derives them for ordinary
        // orders and this path is deliberately unchanged.
        expect(payload).not.toHaveProperty("position_effect");
        expect(payload).not.toHaveProperty("market_hours");
      }
    });

    // `all_day_hours` is Robinhood's 24 Hour Market; on the wire the
    // extended_hours boolean is just `market_hours !== "regular_hours"`.
    it("sends marketHours verbatim and derives extended_hours from it", async () => {
      const cases = [
        { marketHours: "regular_hours", extended: false },
        { marketHours: "extended_hours", extended: true },
        { marketHours: "all_day_hours", extended: true },
      ] as const;

      for (const c of cases) {
        mockRequestPost.mockClear();
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

        await client.orderStock("AAPL", "buy", 1, {
          limitPrice: 150,
          timeInForce: "gfd",
          marketHours: c.marketHours,
          accountNumber: "456",
        });

        const payload = mockRequestPost.mock.calls[0]?.[2]?.payload as Record<string, unknown>;
        expect(payload.market_hours).toBe(c.marketHours);
        expect(payload.extended_hours).toBe(c.extended);
      }
    });

    // The `??=` on the short-sale session must not clobber an explicit
    // all_day_hours — otherwise an overnight short is silently downgraded.
    it("preserves an explicit all_day_hours on a short sale", async () => {
      // findInstruments (via resolveInstrumentBySymbol)
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
      mockRequestPost.mockResolvedValueOnce({ id: "order1", state: "locate_completed" });

      await client.orderStock("AAPL", "sell_short", 10, {
        limitPrice: 150,
        timeInForce: "gfd",
        marketHours: "all_day_hours",
        accountNumber: "456",
      });

      const payload = mockRequestPost.mock.calls[0]?.[2]?.payload as Record<string, unknown>;
      expect(payload.market_hours).toBe("all_day_hours");
      expect(payload.extended_hours).toBe(true);
      expect(payload.position_effect).toBe("open");
    });

    // Only limit orders execute outside regular hours.
    it("rejects non-limit orders tagged to a non-regular session", async () => {
      for (const opts of [
        { timeInForce: "gfd" }, // market
        { stopPrice: 140, timeInForce: "gfd" }, // stop-market
        { stopPrice: 140, limitPrice: 139, timeInForce: "gfd" }, // stop-limit
        { trailAmount: 5, timeInForce: "gfd" }, // trailing stop
      ]) {
        await expect(
          client.orderStock("AAPL", "buy", 1, {
            ...opts,
            marketHours: "extended_hours",
            accountNumber: "456",
          }),
        ).rejects.toThrow("Only limit orders execute in extended_hours");
      }
    });

    it("allows a plain limit order in a non-regular session", async () => {
      mockRequestGet.mockResolvedValueOnce([
        {
          url: "https://api.robinhood.com/instruments/abc/",
          id: "abc",
          symbol: "AAPL",
          name: "Apple Inc",
          type: "stock",
        },
      ]);
      mockRequestPost.mockResolvedValueOnce({ id: "order1", state: "queued" });

      await expect(
        client.orderStock("AAPL", "buy", 1, {
          limitPrice: 150,
          timeInForce: "gfd",
          marketHours: "all_day_hours",
          accountNumber: "456",
        }),
      ).resolves.toBeDefined();
    });

    // A legacy extendedHours caller keeps whatever behaviour they had.
    it("does not apply the session guard to legacy extendedHours", async () => {
      mockRequestGet.mockResolvedValueOnce([
        {
          url: "https://api.robinhood.com/instruments/abc/",
          id: "abc",
          symbol: "AAPL",
          name: "Apple Inc",
          type: "stock",
        },
      ]);
      mockRequestPost.mockResolvedValueOnce({ id: "order1", state: "queued" });

      await expect(
        client.orderStock("AAPL", "buy", 1, {
          timeInForce: "gfd",
          extendedHours: true,
          accountNumber: "456",
        }),
      ).resolves.toBeDefined();
    });

    it("throws when extendedHours contradicts marketHours", async () => {
      await expect(
        client.orderStock("AAPL", "buy", 1, {
          timeInForce: "gfd",
          marketHours: "regular_hours",
          extendedHours: true,
          accountNumber: "456",
        }),
      ).rejects.toThrow("contradicts marketHours");
    });

    it("rejects fractional short sales", async () => {
      await expect(
        client.orderStock("AAPL", "sell_short", 1.5, { timeInForce: "gfd", accountNumber: "456" }),
      ).rejects.toThrow("Short sales must be whole shares");
    });
  });

  // The review must reject whatever the place step rejects, or it hands the
  // user a clean-looking preview of an order that cannot actually be placed.
  describe("reviewEquityOrder validation", () => {
    beforeEach(async () => {
      await client.restoreSession();
    });

    it("rejects fractional short sales, matching orderStock", async () => {
      await expect(
        client.reviewEquityOrder({
          symbol: "AAPL",
          side: "sell_short",
          quantity: 1.5,
          accountNumber: "456",
        }),
      ).rejects.toThrow("Short sales must be whole shares");
    });

    it("rejects a non-positive limit price", async () => {
      await expect(
        client.reviewEquityOrder({
          symbol: "AAPL",
          side: "sell_short",
          quantity: 1,
          limitPrice: -0.05,
          accountNumber: "456",
        }),
      ).rejects.toThrow("limitPrice must be a positive finite number");
    });

    it("rejects a non-positive stop price", async () => {
      await expect(
        client.reviewEquityOrder({
          symbol: "AAPL",
          side: "sell",
          quantity: 1,
          stopPrice: 0,
          accountNumber: "456",
        }),
      ).rejects.toThrow("stopPrice must be a positive finite number");
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

  describe("Phase 1A reads", () => {
    beforeEach(async () => {
      await client.restoreSession();
    });

    it("getUnifiedPortfolio hits bonfire with the resolved account number", async () => {
      mockRequestGet.mockResolvedValueOnce([{ account_number: "ACC1", url: "u" }]); // getAccounts
      mockRequestGet.mockResolvedValueOnce({ total_equity: { amount: "1" } });
      const u = await client.getUnifiedPortfolio();
      expect(mockRequestGet).toHaveBeenLastCalledWith(
        expect.anything(),
        "https://bonfire.robinhood.com/accounts/ACC1/unified/",
      );
      expect(u?.total_equity?.amount).toBe("1");
    });

    it("getUnifiedPortfolio accepts an explicit account number (no lookup)", async () => {
      mockRequestGet.mockResolvedValueOnce({ total_equity: { amount: "2" } });
      await client.getUnifiedPortfolio("ACCX");
      expect(mockRequestGet).toHaveBeenCalledWith(
        expect.anything(),
        "https://bonfire.robinhood.com/accounts/ACCX/unified/",
      );
    });

    it("getUnifiedPortfolio returns null (not throw) when bonfire 404s for a non-default account", async () => {
      mockRequestGet.mockRejectedValueOnce(new NotFoundError("HTTP 404"));
      const u = await client.getUnifiedPortfolio("ACCX");
      expect(u).toBeNull();
    });

    it("getUnifiedPortfolio still rejects on a non-404 error", async () => {
      mockRequestGet.mockRejectedValueOnce(new Error("network blip"));
      await expect(client.getUnifiedPortfolio("ACCX")).rejects.toThrow("network blip");
    });

    it("getUnifiedPortfolio still rejects when there is no account to resolve at all — the 404-swallow is scoped to the unified request only, not account resolution", async () => {
      mockRequestGet.mockResolvedValueOnce([]); // getAccounts() -> no accounts
      await expect(client.getUnifiedPortfolio()).rejects.toThrow("No brokerage account found");
    });

    it("getPortfolioLive hits the bonfire live endpoint", async () => {
      mockRequestGet.mockResolvedValueOnce({ equity_market_value: "3" });
      const live = await client.getPortfolioLive("ACCX");
      expect(mockRequestGet).toHaveBeenCalledWith(
        expect.anything(),
        "https://bonfire.robinhood.com/portfolio/account/ACCX/live/",
      );
      expect(live.equity_market_value).toBe("3");
    });

    it("getOptionPositions paginates /options/positions/", async () => {
      mockRequestGet.mockResolvedValueOnce([{ chain_symbol: "AAPL" }]);
      const p = await client.getOptionPositions({ nonzero: true });
      expect(mockRequestGet).toHaveBeenCalledWith(
        expect.anything(),
        "https://api.robinhood.com/options/positions/",
        expect.objectContaining({ dataType: "pagination", params: { nonzero: "true" } }),
      );
      expect(p).toHaveLength(1);
    });

    it("getOptionAggregatePositions paginates the aggregate endpoint", async () => {
      mockRequestGet.mockResolvedValueOnce([{ symbol: "AAPL", strategy: "long_call" }]);
      await client.getOptionAggregatePositions();
      expect(mockRequestGet).toHaveBeenCalledWith(
        expect.anything(),
        "https://api.robinhood.com/options/aggregate_positions/",
        expect.objectContaining({ dataType: "pagination" }),
      );
    });

    it("getPriceBook resolves the instrument then fetches the snapshot", async () => {
      mockRequestGet.mockResolvedValueOnce([{ id: "inst9", symbol: "AAPL" }]); // findInstruments
      mockRequestGet.mockResolvedValueOnce({ instrument_id: "inst9", asks: [], bids: [] });
      const pb = await client.getPriceBook("aapl");
      expect(mockRequestGet).toHaveBeenLastCalledWith(
        expect.anything(),
        "https://api.robinhood.com/marketdata/pricebook/snapshots/inst9/",
      );
      expect(pb.instrument_id).toBe("inst9");
    });

    it("getEarningsCalendar passes the range param", async () => {
      mockRequestGet.mockResolvedValueOnce([{ symbol: "AAPL" }]);
      await client.getEarningsCalendar(3);
      expect(mockRequestGet).toHaveBeenCalledWith(
        expect.anything(),
        "https://api.robinhood.com/marketdata/earnings/",
        expect.objectContaining({ dataType: "results", params: { range: "3day" } }),
      );
    });

    it("getEarningsCalendar rejects a zero range", async () => {
      await expect(client.getEarningsCalendar(0)).rejects.toThrow(/non-zero/);
    });

    it("getIndexInstruments reads the indexes list", async () => {
      mockRequestGet.mockResolvedValueOnce([{ id: "i1", symbol: "SPX" }]);
      const idx = await client.getIndexInstruments();
      expect(mockRequestGet).toHaveBeenCalledWith(
        expect.anything(),
        "https://api.robinhood.com/indexes/",
        expect.objectContaining({ dataType: "results" }),
      );
      expect(idx[0]?.symbol).toBe("SPX");
    });

    it("getTradability projects tradability fields per symbol", async () => {
      mockRequestGet.mockResolvedValueOnce([
        { id: "1", symbol: "AAPL", tradeable: true, tradability: "tradable" },
      ]);
      const tr = await client.getTradability("aapl");
      expect(tr).toEqual([
        expect.objectContaining({ symbol: "AAPL", tradeable: true, tradability: "tradable" }),
      ]);
    });
  });

  describe("Scanners", () => {
    beforeEach(async () => {
      await client.restoreSession();
    });

    it("getScannerFilterSpecs returns the embedded catalog without any HTTP", async () => {
      const specs = await client.getScannerFilterSpecs();
      expect(Array.isArray(specs)).toBe(true);
      expect(specs.length).toBeGreaterThan(0);
      // Static catalog — must never touch the network.
      expect(mockRequestGet).not.toHaveBeenCalled();
      // Each entry has the official DTO's required shape.
      expect(specs[0]).toEqual(
        expect.objectContaining({
          filter_type: expect.any(String),
          display_name: expect.any(String),
          filter_group: expect.any(String),
          value_type: expect.any(String),
          unit_type: expect.any(String),
          supported_predicates: expect.any(Array),
        }),
      );
    });

    it("getScannerFilterSpecs returns a fresh copy each call (caller can't corrupt the catalog)", async () => {
      const a = await client.getScannerFilterSpecs();
      const original = a.length;
      a.pop();
      const b = await client.getScannerFilterSpecs();
      expect(b.length).toBe(original);
    });

    it("getScannerFilterSpecs requires auth", async () => {
      const fresh = new RobinhoodClient();
      await expect(fresh.getScannerFilterSpecs()).rejects.toThrow(NotLoggedInError);
    });

    it("getScans GETs the beacon scans endpoint and unwraps the scans array", async () => {
      mockRequestGet.mockResolvedValueOnce({ scans: [{ scanId: "s1", title: "Momentum" }] });
      const scans = await client.getScans();
      expect(mockRequestGet).toHaveBeenCalledWith(
        expect.anything(),
        "https://api.robinhood.com/beacon/scans/",
      );
      expect(scans).toEqual([{ scanId: "s1", title: "Momentum" }]);
    });

    it("getScans returns [] for an account with no saved scans", async () => {
      mockRequestGet.mockResolvedValueOnce({ scans: [] });
      expect(await client.getScans()).toEqual([]);
    });

    it("getScans tolerates a missing scans key", async () => {
      mockRequestGet.mockResolvedValueOnce({});
      expect(await client.getScans()).toEqual([]);
    });

    it("getScans requires auth", async () => {
      const fresh = new RobinhoodClient();
      await expect(fresh.getScans()).rejects.toThrow(NotLoggedInError);
    });
  });

  describe("Phase 1B watchlists", () => {
    beforeEach(async () => {
      await client.restoreSession();
    });

    it("getWatchlists reads discovery/lists/default/", async () => {
      mockRequestGet.mockResolvedValueOnce([{ id: "L1", display_name: "My List" }]);
      const lists = await client.getWatchlists();
      expect(mockRequestGet).toHaveBeenCalledWith(
        expect.anything(),
        "https://api.robinhood.com/discovery/lists/default/",
        expect.objectContaining({ dataType: "results" }),
      );
      expect(lists[0]?.id).toBe("L1");
    });

    it("getPopularWatchlists paginates discovery/lists/popular/", async () => {
      mockRequestGet.mockResolvedValueOnce([{ id: "C1" }]);
      await client.getPopularWatchlists();
      expect(mockRequestGet).toHaveBeenCalledWith(
        expect.anything(),
        "https://api.robinhood.com/discovery/lists/popular/",
        expect.objectContaining({ dataType: "pagination" }),
      );
    });

    it("getWatchlistItems passes list_id and reads the items endpoint", async () => {
      mockRequestGet.mockResolvedValueOnce([
        { object_id: "o1", object_type: "instrument", symbol: "AAPL" },
      ]);
      const items = await client.getWatchlistItems("L1");
      expect(mockRequestGet).toHaveBeenCalledWith(
        expect.anything(),
        "https://api.robinhood.com/discovery/lists/items/",
        expect.objectContaining({ dataType: "results", params: { list_id: "L1" } }),
      );
      expect(items[0]?.symbol).toBe("AAPL");
    });

    it("getOptionWatchlist selects the option_strategy list", async () => {
      mockRequestGet.mockResolvedValueOnce([
        { id: "L1", allowed_object_types: ["instrument"] },
        { id: "L2", allowed_object_types: ["option_strategy"] },
      ]);
      const opt = await client.getOptionWatchlist();
      expect(opt?.id).toBe("L2");
    });

    it("resolveInstrumentBySymbol returns the exact single match", async () => {
      mockRequestGet.mockResolvedValueOnce([
        { id: "i1", symbol: "AAPL", state: "active", tradeable: true },
      ]);
      const inst = await client.resolveInstrumentBySymbol("aapl");
      expect(inst.id).toBe("i1");
    });

    it("resolveInstrumentBySymbol ignores non-exact (prefix) search hits", async () => {
      // findInstruments is a fuzzy search — the first hit may not be the ticker.
      mockRequestGet.mockResolvedValueOnce([
        { id: "iX", symbol: "AAPLW", state: "active", tradeable: true },
        { id: "i1", symbol: "AAPL", state: "active", tradeable: true },
      ]);
      const inst = await client.resolveInstrumentBySymbol("AAPL");
      expect(inst.id).toBe("i1");
    });

    it("resolveInstrumentBySymbol throws when nothing matches", async () => {
      mockRequestGet.mockResolvedValueOnce([{ id: "iX", symbol: "AAPLW" }]);
      await expect(client.resolveInstrumentBySymbol("AAPL")).rejects.toThrow(/No instrument/);
    });

    it("resolveInstrumentBySymbol refuses to guess between ambiguous active listings", async () => {
      mockRequestGet.mockResolvedValueOnce([
        { id: "a", symbol: "AAPL", state: "active", tradeable: true },
        { id: "b", symbol: "AAPL", state: "active", tradeable: true },
      ]);
      await expect(client.resolveInstrumentBySymbol("AAPL")).rejects.toThrow(/Ambiguous/);
    });

    it("resolveInstrumentBySymbol picks the single active listing when duplicates exist", async () => {
      mockRequestGet.mockResolvedValueOnce([
        { id: "old", symbol: "AAPL", state: "inactive", tradeable: false },
        { id: "cur", symbol: "AAPL", state: "active", tradeable: true },
      ]);
      const inst = await client.resolveInstrumentBySymbol("AAPL");
      expect(inst.id).toBe("cur");
    });

    it("updateWatchlistItems builds a single-list, single-operation write map", async () => {
      mockRequestPost.mockResolvedValueOnce({});
      await client.updateWatchlistItems("L1", "create", [
        { object_type: "instrument", object_id: "i1" },
        { object_type: "instrument", object_id: "i2" },
      ]);
      expect(mockRequestPost).toHaveBeenCalledWith(
        expect.anything(),
        "https://api.robinhood.com/midlands/lists/items/",
        expect.objectContaining({
          asJson: true,
          payload: {
            L1: [
              { object_type: "instrument", object_id: "i1", operation: "create" },
              { object_type: "instrument", object_id: "i2", operation: "create" },
            ],
          },
        }),
      );
    });

    it("updateWatchlistItems rejects an empty item list", async () => {
      await expect(client.updateWatchlistItems("L1", "delete", [])).rejects.toThrow(/non-empty/);
    });

    it("getCurrencyPairs reads the nummus currency_pairs endpoint", async () => {
      mockRequestGet.mockResolvedValueOnce([{ id: "cp1", asset_currency: { code: "BTC" } }]);
      const pairs = await client.getCurrencyPairs();
      expect(mockRequestGet).toHaveBeenCalledWith(
        expect.anything(),
        "https://nummus.robinhood.com/currency_pairs/",
        expect.objectContaining({ dataType: "results" }),
      );
      expect(pairs[0]?.id).toBe("cp1");
    });
  });

  describe("Phase 5 — long-tail writes + tax lots", () => {
    beforeEach(async () => {
      await client.restoreSession();
    });

    it("getEquityTaxLots resolves the symbol exactly and hits /tax_lots/open/{account}/{instrument}/", async () => {
      mockRequestGet.mockResolvedValueOnce([{ id: "inst-mu", symbol: "MU" }]); // findInstruments (exact)
      mockRequestGet.mockResolvedValueOnce([{ open_lot_id: "lot-1", term: "short_term" }]); // tax lots
      const lots = await client.getEquityTaxLots("mu", { accountNumber: "ACCT-1" });
      expect(lots[0]?.open_lot_id).toBe("lot-1");
      expect(mockRequestGet).toHaveBeenLastCalledWith(
        expect.anything(),
        "https://api.robinhood.com/tax_lots/open/ACCT-1/inst-mu/",
        expect.objectContaining({ dataType: "pagination" }),
      );
    });

    it("getEquityTaxLots throws when the symbol has no exact instrument match", async () => {
      mockRequestGet.mockResolvedValueOnce([]); // findInstruments empty
      await expect(client.getEquityTaxLots("ZZZZ", { accountNumber: "ACCT-1" })).rejects.toThrow(
        NotFoundError,
      );
    });

    it("followWatchlist POSTs an empty JSON body to /followers/{user_id}/", async () => {
      mockRequestGet.mockResolvedValueOnce({ id: "user-1", username: "x" }); // getUserProfile
      mockRequestPost.mockResolvedValueOnce({});
      await client.followWatchlist("list-1");
      expect(mockRequestPost).toHaveBeenCalledWith(
        expect.anything(),
        "https://api.robinhood.com/discovery/lists/list-1/followers/user-1/",
        { payload: {}, asJson: true },
      );
    });

    it("getUserId is cached across follow/unfollow (one /user/ read)", async () => {
      mockRequestGet.mockResolvedValueOnce({ id: "user-1" }); // getUserProfile — once
      mockRequestPost.mockResolvedValueOnce({});
      mockRequestDelete.mockResolvedValueOnce({});
      await client.followWatchlist("list-1");
      await client.unfollowWatchlist("list-1");
      const userReads = mockRequestGet.mock.calls.filter((c) =>
        String(c[1]).endsWith("/user/"),
      ).length;
      expect(userReads).toBe(1);
      expect(mockRequestDelete).toHaveBeenCalledWith(
        expect.anything(),
        "https://api.robinhood.com/discovery/lists/list-1/followers/user-1/",
      );
    });

    it("getOptionWatchlistContracts sends load_all_attributes=false (options list rejects the default)", async () => {
      mockRequestGet.mockResolvedValueOnce([
        { id: "opt-list", allowed_object_types: ["option_strategy"] },
      ]); // getWatchlists → getOptionWatchlist
      mockRequestGet.mockResolvedValueOnce([{ object_id: "s1", strategy_code: "o_L1" }]); // items
      const contracts = await client.getOptionWatchlistContracts();
      expect(contracts[0]?.object_id).toBe("s1");
      expect(mockRequestGet).toHaveBeenLastCalledWith(
        expect.anything(),
        "https://api.robinhood.com/discovery/lists/items/",
        expect.objectContaining({
          params: { list_id: "opt-list", load_all_attributes: "false" },
        }),
      );
    });

    it("quickAddOption mints a single-leg long option_strategy via quick_add", async () => {
      mockRequestPost.mockResolvedValueOnce({});
      await client.quickAddOption("opt-9", "long");
      expect(mockRequestPost).toHaveBeenCalledWith(
        expect.anything(),
        "https://api.robinhood.com/discovery/lists/items/quick_add/",
        {
          payload: {
            legs: [{ option_id: "opt-9", position_type: "long", ratio_quantity: 1 }],
            object_type: "option_strategy",
          },
          asJson: true,
        },
      );
    });

    it("getOptionInstrumentById reads /options/instruments/{id}/", async () => {
      mockRequestGet.mockResolvedValueOnce({ id: "opt-9", chain_symbol: "AAPL" });
      const inst = await client.getOptionInstrumentById("opt-9");
      expect(inst.id).toBe("opt-9");
      expect(mockRequestGet).toHaveBeenCalledWith(
        expect.anything(),
        "https://api.robinhood.com/options/instruments/opt-9/",
      );
    });
  });
});
