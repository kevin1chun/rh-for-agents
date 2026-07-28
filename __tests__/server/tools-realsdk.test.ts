/**
 * Real-SDK end-to-end coverage for registerTool()/outputSchema.
 *
 * Unlike tools.test.ts (which mocks server.tool/registerTool entirely and so
 * never exercises real schema conversion or validation), this boots the REAL
 * McpServer, connects a real Client over InMemoryTransport, and calls tools
 * end-to-end so the SDK's actual validateToolOutput() runs against our
 * structuredContent for every outputSchema. This is the only place that would
 * catch an outputSchema the SDK can't actually validate (e.g. a bare
 * `z.record()` at the schema root — the installed SDK's normalizeObjectSchema
 * only recognizes real ZodObject schemas, so a top-level z.record() silently
 * vanishes from tool listings and then crashes output validation).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/server/server.js";

vi.mock("../../src/client/index.js", () => {
  const mockClient = {
    restoreSession: vi.fn().mockResolvedValue({ status: "logged_in", method: "cached" }),
    isLoggedIn: true,
    getAccounts: vi.fn().mockResolvedValue([
      {
        url: "https://api.robinhood.com/accounts/ABC123/",
        account_number: "ABC123",
        type: "cash",
      },
    ]),
    getAccountProfile: vi.fn().mockResolvedValue({
      url: "https://api.robinhood.com/accounts/ABC123/",
      account_number: "ABC123",
      type: "cash",
      cash: "1000.00",
      buying_power: "2000.00",
      crypto_buying_power: "500.00",
      cash_available_for_withdrawal: "1000.00",
    }),
    getPortfolioProfile: vi
      .fn()
      .mockResolvedValue({ equity: "15000.00", market_value: "14000.00" }),
    getUserProfile: vi.fn().mockResolvedValue({ username: "testuser" }),
    getInvestmentProfile: vi.fn().mockResolvedValue({ risk_tolerance: "moderate" }),
    buildHoldings: vi.fn().mockResolvedValue({ AAPL: { quantity: "10" } }),
    getQuotes: vi.fn().mockResolvedValue([{ symbol: "AAPL", last_trade_price: "150.00" }]),
    getFundamentals: vi.fn().mockResolvedValue([{ pe_ratio: "25.5", float: "14669011375" }]),
    getShortInterest: vi.fn().mockResolvedValue({
      symbol: "AAPL",
      instrument_id: "inst1",
      daily_data: [{ date: "2026-07-13", shares_short: "141171395.64", pc_freefloat: "0.9628" }],
    }),
    getStockHistoricals: vi
      .fn()
      .mockResolvedValue([{ symbol: "AAPL", historicals: [{ begins_at: "2024-01-01" }] }]),
    getNews: vi.fn().mockResolvedValue([{ title: "News" }]),
    getRatings: vi.fn().mockResolvedValue({}),
    getEarnings: vi.fn().mockResolvedValue([{ symbol: "AAPL", year: 2026, quarter: 2 }]),
    getIndexValue: vi.fn().mockResolvedValue(null),
    getChains: vi.fn().mockResolvedValue({ id: "chain1", expiration_dates: ["2025-01-17"] }),
    findTradableOptions: vi.fn().mockResolvedValue([
      {
        url: "https://...",
        id: "opt1",
        type: "call",
        strike_price: "150.00",
        expiration_date: "2025-01-17",
      },
    ]),
    getOptionMarketData: vi.fn().mockResolvedValue([{ implied_volatility: "0.3" }]),
    getCryptoPositions: vi.fn().mockResolvedValue([{ currency: { code: "BTC" } }]),
    getCryptoQuote: vi.fn().mockResolvedValue({ mark_price: "50000.00" }),
    getCryptoHistoricals: vi.fn().mockResolvedValue([{ close_price: "50000.00" }]),
    getAllStockOrders: vi.fn().mockResolvedValue([{ id: "o1" }]),
    getOpenStockOrders: vi.fn().mockResolvedValue([]),
    getAllOptionOrders: vi.fn().mockResolvedValue([]),
    getOpenOptionOrders: vi.fn().mockResolvedValue([]),
    getAllCryptoOrders: vi.fn().mockResolvedValue([]),
    getOpenCryptoOrders: vi.fn().mockResolvedValue([]),
    getStockOrder: vi.fn().mockResolvedValue({ id: "o1", state: "filled" }),
    getOptionOrder: vi.fn().mockResolvedValue({ id: "opt1", state: "filled" }),
    getCryptoOrder: vi.fn().mockResolvedValue({ id: "crypto1", state: "filled" }),
    orderStock: vi.fn().mockResolvedValue({ id: "order1", state: "queued" }),
    orderOption: vi.fn().mockResolvedValue({ id: "opt1" }),
    orderCrypto: vi.fn().mockResolvedValue({ id: "crypto1" }),
    cancelStockOrder: vi.fn().mockResolvedValue({}),
    cancelOptionOrder: vi.fn().mockResolvedValue({}),
    cancelCryptoOrder: vi.fn().mockResolvedValue({}),
    getTopMovers: vi.fn().mockResolvedValue([{ url: "...", id: "1", symbol: "TSLA" }]),
    getTopMoversSp500: vi.fn().mockResolvedValue([{ symbol: "NVDA" }]),
    getTop100: vi.fn().mockResolvedValue([{ url: "...", id: "1", symbol: "AAPL" }]),
    findInstruments: vi.fn().mockResolvedValue([{ url: "...", id: "1", symbol: "AAPL" }]),
    getAllStocksFromMarketTag: vi.fn().mockResolvedValue([{ url: "...", id: "1", symbol: "AAPL" }]),
    getUnifiedPortfolio: vi.fn().mockResolvedValue({
      total_equity: { amount: "15000.00" },
      total_market_value: { amount: "14000.00" },
      portfolio_equity: { amount: "15000.00" },
      options_buying_power: { amount: "2000.00" },
      uninvested_cash: { amount: "1000.00" },
      withdrawable_cash: { amount: "1000.00" },
    }),
    getPortfolioLive: vi.fn().mockResolvedValue({
      equity_market_value: "14000.00",
      option_market_value: "0.00",
      futures_market_value: "0.00",
      event_contracts_market_value: "0.00",
      pending_deposits: "0.00",
      currency: "USD",
    }),
    getPositions: vi.fn().mockResolvedValue([{ instrument: "https://...", quantity: "10" }]),
    getOptionPositions: vi.fn().mockResolvedValue([{ chain_symbol: "AAPL", quantity: "1" }]),
    getOptionAggregatePositions: vi
      .fn()
      .mockResolvedValue([{ symbol: "AAPL", strategy: "long_call" }]),
    getPriceBook: vi.fn().mockResolvedValue({ instrument_id: "1", asks: [], bids: [] }),
    getEarningsCalendar: vi.fn().mockResolvedValue([{ symbol: "AAPL" }, { symbol: "MSFT" }]),
    getIndexInstruments: vi.fn().mockResolvedValue([{ id: "idx1", symbol: "SPX" }]),
    getIndexQuotes: vi.fn().mockResolvedValue([{ symbol: "SPX", value: "5000.00" }]),
    getOptionHistoricals: vi
      .fn()
      .mockResolvedValue([{ symbol: "AAPL", data_points: [{ begins_at: "2026-07-14" }] }]),
    getTradability: vi.fn().mockResolvedValue([{ symbol: "AAPL", tradeable: true }]),
    getMarketHours: vi.fn().mockResolvedValue({
      is_open: true,
      date: "2026-07-27",
      opens_at: "2026-07-27T13:30:00Z",
      closes_at: "2026-07-27T20:00:00Z",
      extended_opens_at: "2026-07-27T11:00:00Z",
      extended_closes_at: "2026-07-28T00:00:00Z",
    }),
    getWatchlists: vi
      .fn()
      .mockResolvedValue([
        { id: "11111111-1111-4111-8111-111111111111", display_name: "My List", item_count: 1 },
      ]),
    getWatchlistItems: vi
      .fn()
      .mockResolvedValue([
        { object_id: "inst-aapl", object_type: "instrument", symbol: "AAPL", name: "Apple" },
      ]),
    getPopularWatchlists: vi
      .fn()
      .mockResolvedValue([
        { id: "22222222-2222-4222-8222-222222222222", display_name: "100 Most Popular" },
      ]),
    getOptionWatchlist: vi.fn().mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      item_count: 0,
      allowed_object_types: ["option_strategy"],
    }),
    resolveInstrumentBySymbol: vi
      .fn()
      .mockResolvedValue({ id: "inst-aapl", symbol: "AAPL", url: "https://..." }),
    getCurrencyPairs: vi
      .fn()
      .mockResolvedValue([{ id: "cp-btc", asset_currency: { code: "BTC" } }]),
    updateWatchlistItems: vi.fn().mockResolvedValue({}),
    createWatchlist: vi.fn().mockResolvedValue({
      id: "44444444-4444-4444-8444-444444444444",
      display_name: "New List",
      display_description: "",
      item_count: 0,
    }),
    updateWatchlist: vi.fn().mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      display_name: "Renamed List",
      display_description: "updated",
    }),
    deleteWatchlist: vi.fn().mockResolvedValue(undefined),
    getScannerFilterSpecs: vi.fn().mockResolvedValue([
      {
        filter_type: "FILTER_TYPE_RSI",
        display_name: "RSI",
        filter_group: "TECHNICAL",
        value_type: "DECIMAL",
        unit_type: "PLAIN",
        supported_predicates: [">", "<"],
        supported_lengths: [14],
        supported_intervals: ["1d"],
      },
    ]),
    getScans: vi.fn().mockResolvedValue([
      {
        scanId: "scan-1",
        title: "High RSI",
        columnCount: 3,
        activeScanConfiguration: {
          columns: ["a", "b", "c"],
          filters: [{ filterType: "FILTER_TYPE_RSI" }],
          sortingColumnId: "col-vol",
          sortingDirection: "desc",
        },
      },
    ]),
    getRealizedPnl: vi.fn().mockResolvedValue({
      trades: [
        {
          symbol: "AAA",
          side: "sell",
          quantity: 10,
          price: 110,
          realizedGain: 100,
          openedAt: "2026-01-01T00:00:00Z",
          closedAt: "2026-01-02T00:00:00Z",
          assetClass: "equity",
        },
      ],
      overrunSymbols: [],
      totalRealizedGain: 100,
    }),
    reviewEquityOrder: vi.fn().mockResolvedValue({
      symbol: "AAA",
      side: "buy",
      type: "limit",
      quantity: 10,
      limit_price: 130,
      stop_price: null,
      order_checks: {
        alert_type: "EQUITY_EXTREMELY_MARKETABLE_LIMIT_PRICE",
        details: { entered_price: { amount: "130", currency: "USD" } },
      },
      evaluated_checks: ["limit_vs_last_trade_marketable"],
      not_evaluated_checks: [],
      quote: { symbol: "AAA", last_trade_price: "100" },
      quote_timestamp: "2026-07-14T00:00:00Z",
    }),
    reviewOptionOrder: vi.fn().mockResolvedValue({
      symbol: "AAA",
      direction: "debit",
      price: 1.5,
      quantity: 1,
      legs: [
        {
          expiration_date: "2026-08-21",
          strike: 100,
          option_type: "call",
          side: "buy",
          position_effect: "open",
          ratio_quantity: 1,
          market_data: null,
        },
      ],
      collateral: { collateral: { cash: { amount: "0.00", currency: "USD" } } },
      order_checks: {},
      evaluated_checks: [],
      not_evaluated_checks: ["price_collar (not reproduced)"],
      quote_timestamp: null,
    }),
    getEquityTaxLots: vi.fn().mockResolvedValue([
      {
        account_number: "ABC123",
        instrument_id: "inst-aapl",
        open_lot_id: "lot-1",
        order_id: "ord-1",
        open_tran_type: "buy",
        quantity: "10.00000000",
        quantity_available: "10.00000000",
        book_cost_basis: "1500.0000",
        tax_cost_basis: "1500.0000",
        book_proceeds: "0.0000",
        open_date: "2026-01-02",
        term: "short_term",
        is_selectable: true,
        cost_per_share: null,
      },
    ]),
    followWatchlist: vi.fn().mockResolvedValue(undefined),
    unfollowWatchlist: vi.fn().mockResolvedValue(undefined),
    getOptionWatchlistContracts: vi.fn().mockResolvedValue([
      {
        id: "item-1",
        object_id: "strat-1",
        object_type: "option_strategy",
        strategy_code: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa_L1",
        strategy: "long_call",
        chain_symbol: "AAPL",
        name: "AAPL $150 Call",
      },
    ]),
    getOptionInstrumentById: vi.fn().mockResolvedValue({ id: "opt1", chain_symbol: "AAPL" }),
    quickAddOption: vi.fn().mockResolvedValue({}),
  };

  return {
    getClient: () => mockClient,
    AuthenticationError: class extends Error {},
    saveTokens: vi.fn(),
    loadTokens: vi.fn(),
    deleteTokens: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../../src/server/browser-auth.js", () => ({
  browserLogin: vi.fn().mockResolvedValue({ status: "logged_in", account_hint: "...4521" }),
}));

let client: Client;

beforeAll(async () => {
  const server = createServer();
  client = new Client({ name: "smoke-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
});

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as {
    content: Array<{ type: string; text: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  };
  if (result.isError) {
    throw new Error(`Tool ${name} returned isError: ${result.content[0]?.text}`);
  }
  return result;
}

describe("real SDK smoke — registerTool + outputSchema end-to-end", () => {
  it("lists all 50 tools without throwing (forces JSON-schema conversion)", async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(50);
    for (const t of tools) {
      expect(t.outputSchema, `${t.name} missing outputSchema`).toBeDefined();
      expect(t.title, `${t.name} missing title`).toBeTruthy();
    }
  });

  it("robinhood_get_portfolio validates (nested loose passthrough)", async () => {
    const r = await call("robinhood_get_portfolio", {});
    expect(r.structuredContent?.summary).toBeDefined();
  });

  it("robinhood_get_stock_quote validates (dynamic record outputSchema)", async () => {
    const r = await call("robinhood_get_stock_quote", { symbols: "AAPL" });
    expect((r.structuredContent as Record<string, unknown>).AAPL).toBeDefined();
  });

  it("robinhood_get_fundamentals validates (dynamic record outputSchema)", async () => {
    const r = await call("robinhood_get_fundamentals", { symbols: "AAPL" });
    expect((r.structuredContent as Record<string, unknown>).AAPL).toBeDefined();
  });

  it("robinhood_place_stock_order validates (write tool)", async () => {
    const r = await call("robinhood_place_stock_order", {
      symbol: "AAPL",
      side: "buy",
      quantity: 1,
      time_in_force: "gfd",
      market_hours: "regular_hours",
      account_number: "ACCT",
    });
    expect(r.structuredContent?.status).toBe("submitted");
  });

  // market_hours has no default on purpose: an order tagged to the wrong
  // session silently queues instead of executing, so omitting it must fail
  // loudly rather than pick a session for the caller.
  it("robinhood_place_stock_order requires market_hours", async () => {
    await expect(
      call("robinhood_place_stock_order", {
        symbol: "AAPL",
        side: "buy",
        quantity: 1,
        time_in_force: "gfd",
        account_number: "ACCT",
      }),
    ).rejects.toThrow(/market_hours|invalid_type|Required/i);
  });

  it("robinhood_cancel_order validates", async () => {
    const r = await call("robinhood_cancel_order", { order_id: "o1" });
    expect(r.structuredContent?.status).toBe("cancelled");
  });

  it("robinhood_get_watchlists / add_to_watchlist / remove_from_watchlist validate", async () => {
    await call("robinhood_get_watchlists");
    await call("robinhood_add_to_watchlist", {
      list_id: "11111111-1111-4111-8111-111111111111",
      symbols: ["AAPL"],
    });
    await call("robinhood_remove_from_watchlist", {
      list_id: "11111111-1111-4111-8111-111111111111",
      symbols: ["AAPL", "ZZZZ"],
    });
  });

  it("robinhood_get_option_watchlist validates (fixed contract shape)", async () => {
    await call("robinhood_get_option_watchlist");
  });

  it("robinhood_get_scanner_filter_specs / get_scans validate", async () => {
    await call("robinhood_get_scanner_filter_specs");
    await call("robinhood_get_scans");
  });

  it("robinhood_get_realized_pnl / get_pnl_trade_history validate", async () => {
    await call("robinhood_get_realized_pnl", { account_number: "ACCT" });
    await call("robinhood_get_pnl_trade_history", { account_number: "ACCT" });
  });

  it("robinhood_review_equity_order / review_option_order validate", async () => {
    await call("robinhood_review_equity_order", {
      symbol: "AAA",
      side: "buy",
      quantity: 10,
      limit_price: 130,
      account_number: "ACCT",
    });
    await call("robinhood_review_option_order", {
      symbol: "AAA",
      legs: [
        {
          expiration_date: "2026-08-21",
          strike: 100,
          option_type: "call",
          side: "buy",
          position_effect: "open",
        },
      ],
      price: 1.5,
      quantity: 1,
      direction: "debit",
      account_number: "ACCT",
    });
  });

  it("robinhood_get_equity_tax_lots validates", async () => {
    await call("robinhood_get_equity_tax_lots", { account_number: "ACCT", symbol: "AAPL" });
  });

  it("error path (isError) skips output validation even with outputSchema declared", async () => {
    const r = (await client.callTool({
      name: "robinhood_get_crypto",
      arguments: { info_type: "quote" }, // no symbol -> textError path
    })) as { isError?: boolean; content: Array<{ text: string }> };
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("symbol is required");
  });
});
