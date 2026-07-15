import { describe, expect, it } from "vitest";
import * as urls from "../../src/client/urls.js";

describe("URL builders", () => {
  it("uses correct API base", () => {
    expect(urls.API_BASE).toBe("https://api.robinhood.com");
    expect(urls.NUMMUS_BASE).toBe("https://nummus.robinhood.com");
    expect(urls.BONFIRE_BASE).toBe("https://bonfire.robinhood.com");
    expect(urls.DORA_BASE).toBe("https://dora.robinhood.com");
  });

  describe("trustedOrigins", () => {
    it("includes every host the client talks to", () => {
      const origins = urls.trustedOrigins();
      expect(origins.has("https://api.robinhood.com")).toBe(true);
      expect(origins.has("https://nummus.robinhood.com")).toBe(true);
      expect(origins.has("https://bonfire.robinhood.com")).toBe(true);
      expect(origins.has("https://dora.robinhood.com")).toBe(true);
      expect(origins.has("https://robinhood.com")).toBe(true);
    });
  });

  describe("Scanner URLs", () => {
    it("beaconScans", () =>
      expect(urls.beaconScans()).toBe("https://api.robinhood.com/beacon/scans/"));
  });

  describe("Watchlist URLs", () => {
    it("watchlistsDefault", () =>
      expect(urls.watchlistsDefault()).toBe("https://api.robinhood.com/discovery/lists/default/"));
    it("watchlistsPopular", () =>
      expect(urls.watchlistsPopular()).toBe("https://api.robinhood.com/discovery/lists/popular/"));
    it("watchlistItems", () =>
      expect(urls.watchlistItems()).toBe("https://api.robinhood.com/discovery/lists/items/"));
    it("watchlistItemsWrite", () =>
      expect(urls.watchlistItemsWrite()).toBe("https://api.robinhood.com/midlands/lists/items/"));
  });

  describe("Auth URLs", () => {
    it("oauthToken", () =>
      expect(urls.oauthToken()).toBe("https://api.robinhood.com/oauth2/token/"));
    it("oauthRevoke", () =>
      expect(urls.oauthRevoke()).toBe("https://api.robinhood.com/oauth2/revoke_token/"));
    it("challenge", () =>
      expect(urls.challenge("abc")).toBe("https://api.robinhood.com/challenge/abc/respond/"));
    it("pathfinderUserMachine", () =>
      expect(urls.pathfinderUserMachine()).toBe(
        "https://api.robinhood.com/pathfinder/user_machine/",
      ));
    it("pathfinderInquiry", () =>
      expect(urls.pathfinderInquiry("m1")).toBe(
        "https://api.robinhood.com/pathfinder/inquiries/m1/user_view/",
      ));
  });

  describe("Account URLs", () => {
    it("accounts", () => expect(urls.accounts()).toBe("https://api.robinhood.com/accounts/"));
    it("account", () =>
      expect(urls.account("123")).toBe("https://api.robinhood.com/accounts/123/"));
    it("portfolios", () => expect(urls.portfolios()).toBe("https://api.robinhood.com/portfolios/"));
    it("portfolio", () =>
      expect(urls.portfolio("123")).toBe("https://api.robinhood.com/portfolios/123/"));
    it("portfolioHistoricals", () =>
      expect(urls.portfolioHistoricals("123")).toBe(
        "https://api.robinhood.com/portfolios/historicals/123/",
      ));
    it("unifiedPortfolio (bonfire)", () =>
      expect(urls.unifiedPortfolio("123")).toBe(
        "https://bonfire.robinhood.com/accounts/123/unified/",
      ));
    it("portfolioLive (bonfire)", () =>
      expect(urls.portfolioLive("123")).toBe(
        "https://bonfire.robinhood.com/portfolio/account/123/live/",
      ));
  });

  describe("Phase 1A market-data URLs", () => {
    it("priceBookSnapshot", () =>
      expect(urls.priceBookSnapshot("inst1")).toBe(
        "https://api.robinhood.com/marketdata/pricebook/snapshots/inst1/",
      ));
    it("optionHistoricals", () =>
      expect(urls.optionHistoricals("opt1")).toBe(
        "https://api.robinhood.com/marketdata/options/historicals/opt1/",
      ));
  });

  describe("Stock URLs", () => {
    it("quotes", () => expect(urls.quotes()).toBe("https://api.robinhood.com/quotes/"));
    it("quote uppercases", () =>
      expect(urls.quote("aapl")).toBe("https://api.robinhood.com/quotes/AAPL/"));
    it("instruments", () =>
      expect(urls.instruments()).toBe("https://api.robinhood.com/instruments/"));
    it("fundamentals", () =>
      expect(urls.fundamentals()).toBe("https://api.robinhood.com/fundamentals/"));
    it("stockHistoricals", () =>
      expect(urls.stockHistoricals()).toBe("https://api.robinhood.com/quotes/historicals/"));
    it("news uppercases", () =>
      expect(urls.news("aapl")).toBe("https://api.robinhood.com/midlands/news/AAPL/"));
    it("ratings", () =>
      expect(urls.ratings("MSFT")).toBe("https://api.robinhood.com/midlands/ratings/MSFT/"));
  });

  describe("Option URLs", () => {
    it("optionChains", () =>
      expect(urls.optionChains()).toBe("https://api.robinhood.com/options/chains/"));
    it("optionInstruments", () =>
      expect(urls.optionInstruments()).toBe("https://api.robinhood.com/options/instruments/"));
    it("optionMarketData", () =>
      expect(urls.optionMarketData("opt1")).toBe(
        "https://api.robinhood.com/marketdata/options/opt1/",
      ));
    it("optionOrders", () =>
      expect(urls.optionOrders()).toBe("https://api.robinhood.com/options/orders/"));
  });

  describe("Crypto URLs", () => {
    it("cryptoQuote uses pair ID", () =>
      expect(urls.cryptoQuote("3d961844-d360-45fc-989b-f6fca761d511")).toBe(
        "https://api.robinhood.com/marketdata/forex/quotes/3d961844-d360-45fc-989b-f6fca761d511/",
      ));
    it("cryptoHoldings", () =>
      expect(urls.cryptoHoldings()).toBe("https://nummus.robinhood.com/holdings/"));
    it("cryptoOrders", () =>
      expect(urls.cryptoOrders()).toBe("https://nummus.robinhood.com/orders/"));
  });

  describe("Order URLs", () => {
    it("stockOrders", () => expect(urls.stockOrders()).toBe("https://api.robinhood.com/orders/"));
    it("cancelStockOrder", () =>
      expect(urls.cancelStockOrder("o1")).toBe("https://api.robinhood.com/orders/o1/cancel/"));
    it("cancelOptionOrder", () =>
      expect(urls.cancelOptionOrder("o2")).toBe(
        "https://api.robinhood.com/options/orders/o2/cancel/",
      ));
    it("cancelCryptoOrder", () =>
      expect(urls.cancelCryptoOrder("o3")).toBe("https://nummus.robinhood.com/orders/o3/cancel/"));
  });

  describe("Market URLs", () => {
    it("markets", () => expect(urls.markets()).toBe("https://api.robinhood.com/markets/"));
    it("marketHours", () =>
      expect(urls.marketHours("XNYS", "2025-01-15")).toBe(
        "https://api.robinhood.com/markets/XNYS/hours/2025-01-15/",
      ));
    it("topMoversSp500", () =>
      expect(urls.topMoversSp500()).toBe("https://api.robinhood.com/midlands/movers/sp500/"));
    it("top100", () =>
      expect(urls.top100()).toBe("https://api.robinhood.com/midlands/tags/tag/100-most-popular/"));
  });

  describe("safeSegment rejects path traversal", () => {
    const cases: Array<[string, (arg: string) => string]> = [
      ["challenge", urls.challenge],
      ["pathfinderInquiry", urls.pathfinderInquiry],
      ["pushPromptStatus", urls.pushPromptStatus],
      ["account", urls.account],
      ["portfolio", urls.portfolio],
      ["portfolioHistoricals", urls.portfolioHistoricals],
      ["unifiedPortfolio", urls.unifiedPortfolio],
      ["portfolioLive", urls.portfolioLive],
      ["priceBookSnapshot", urls.priceBookSnapshot],
      ["optionHistoricals", urls.optionHistoricals],
      ["quote", urls.quote],
      ["instrument", urls.instrument],
      ["fundamental", urls.fundamental],
      ["stockHistoricalsFor", urls.stockHistoricalsFor],
      ["news", urls.news],
      ["ratings", urls.ratings],
      ["optionChain", urls.optionChain],
      ["optionMarketData", urls.optionMarketData],
      ["optionOrder", urls.optionOrder],
      ["cryptoQuote", urls.cryptoQuote],
      ["cryptoHistoricals", urls.cryptoHistoricals],
      ["cryptoOrder", urls.cryptoOrder],
      ["stockOrder", urls.stockOrder],
      ["cancelStockOrder", urls.cancelStockOrder],
      ["cancelOptionOrder", urls.cancelOptionOrder],
      ["cancelCryptoOrder", urls.cancelCryptoOrder],
    ];

    for (const [name, fn] of cases) {
      it(`${name} rejects ../bad`, () => {
        expect(() => fn("../bad")).toThrow(/Invalid/);
      });
    }

    it("rejects colon in segment", () => {
      expect(() => urls.account("foo:bar")).toThrow(/Invalid/);
    });

    it("rejects @ in segment", () => {
      expect(() => urls.account("foo@bar")).toThrow(/Invalid/);
    });
  });
});
