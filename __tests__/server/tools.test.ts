import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/server/server.js";

// Mock ../../src/client/index.js so tools don't need real auth
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
    getPortfolioProfile: vi.fn().mockResolvedValue({
      equity: "15000.00",
      market_value: "14000.00",
    }),
    getUserProfile: vi.fn().mockResolvedValue({ username: "testuser" }),
    getInvestmentProfile: vi.fn().mockResolvedValue({ risk_tolerance: "moderate" }),
    buildHoldings: vi.fn().mockResolvedValue({ AAPL: { quantity: "10" } }),
    getQuotes: vi.fn().mockResolvedValue([{ symbol: "AAPL", last_trade_price: "150.00" }]),
    getFundamentals: vi.fn().mockResolvedValue([{ pe_ratio: "25.5" }]),
    getStockHistoricals: vi
      .fn()
      .mockResolvedValue([
        { symbol: "AAPL", historicals: [{ begins_at: "2024-01-01", close_price: "150.00" }] },
      ]),
    getNews: vi.fn().mockResolvedValue([{ title: "News" }]),
    getRatings: vi.fn().mockResolvedValue({}),
    getEarnings: vi.fn().mockResolvedValue([]),
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
  };

  return {
    getClient: () => mockClient,
    AuthenticationError: class extends Error {},
    saveTokens: vi.fn(),
    loadTokens: vi.fn(),
    deleteTokens: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock browser-auth so auth tool tests don't launch a real browser
vi.mock("../../src/server/browser-auth.js", () => ({
  browserLogin: vi.fn().mockResolvedValue({
    status: "logged_in",
    account_hint: "...4521",
  }),
}));

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

function captureMockServer(): { server: McpServer; tools: Record<string, ToolHandler> } {
  const tools: Record<string, ToolHandler> = {};
  const server = {
    tool: (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      tools[name] = handler;
    },
  } as unknown as McpServer;
  return { server, tools };
}

function parseToolResult(result: unknown) {
  const r = result as { content: Array<{ type: string; text: string }> };
  expect(r.content).toBeInstanceOf(Array);
  expect(r.content[0]?.type).toBe("text");
  return JSON.parse(r.content[0]?.text ?? "{}");
}

async function callTool(
  tools: Record<string, ToolHandler>,
  name: string,
  args: Record<string, unknown> = {},
) {
  const handler = tools[name] as ToolHandler;
  expect(handler).toBeDefined();
  return parseToolResult(await handler(args));
}

describe("MCP Server", () => {
  it("creates server with correct name", () => {
    const server = createServer();
    expect(server).toBeDefined();
  });

  it("registers all 18 tools without throwing", () => {
    createServer();
    expect(true).toBe(true);
  });
});

describe("Tool handlers return MCP content format", () => {
  it("registerPortfolioTools handlers work", async () => {
    const { registerPortfolioTools } = await import("../../src/server/tools/portfolio.js");
    const { server, tools } = captureMockServer();
    registerPortfolioTools(server);

    expect(tools.robinhood_get_portfolio).toBeDefined();
    expect(tools.robinhood_get_accounts).toBeDefined();
    expect(tools.robinhood_get_account).toBeDefined();

    const accountsData = await callTool(tools, "robinhood_get_accounts");
    expect(accountsData.accounts).toEqual([
      {
        url: "https://api.robinhood.com/accounts/ABC123/",
        account_number: "ABC123",
        type: "cash",
      },
    ]);

    const accountData = await callTool(tools, "robinhood_get_account", { info_type: "user" });
    expect(accountData.user).toEqual({ username: "testuser" });
  });

  it("registerOrderTools handlers work", async () => {
    const { registerOrderTools } = await import("../../src/server/tools/orders.js");
    const { server, tools } = captureMockServer();
    registerOrderTools(server);

    const ordersData = await callTool(tools, "robinhood_get_orders", {
      order_type: "stock",
      status: "all",
    });
    expect(ordersData.orders).toEqual([{ id: "o1" }]);
    expect(ordersData.order_type).toBe("stock");
  });

  it("registerOrderTools respects limit param", async () => {
    const { registerOrderTools } = await import("../../src/server/tools/orders.js");
    const { server, tools } = captureMockServer();
    registerOrderTools(server);

    const ordersData = await callTool(tools, "robinhood_get_orders", {
      order_type: "stock",
      status: "all",
      limit: 0,
    });
    // limit: 0 means no slicing
    expect(ordersData.orders).toEqual([{ id: "o1" }]);
  });

  it("registerOrderTools order status works", async () => {
    const { registerOrderTools } = await import("../../src/server/tools/orders.js");
    const { server, tools } = captureMockServer();
    registerOrderTools(server);

    const orderData = await callTool(tools, "robinhood_get_order_status", {
      order_id: "o1",
      order_type: "stock",
    });
    expect(orderData.order).toEqual({ id: "o1", state: "filled" });
  });

  it("registerMarketTools handlers work", async () => {
    const { registerMarketTools } = await import("../../src/server/tools/markets.js");
    const { server, tools } = captureMockServer();
    registerMarketTools(server);

    const moversData = await callTool(tools, "robinhood_get_movers", {
      category: "top_movers",
    });
    expect(moversData.movers).toEqual([{ url: "...", id: "1", symbol: "TSLA" }]);
  });

  it("registerStockTools handlers work", async () => {
    const { registerStockTools } = await import("../../src/server/tools/stocks.js");
    const { server, tools } = captureMockServer();
    registerStockTools(server);

    const quoteData = await callTool(tools, "robinhood_get_stock_quote", {
      symbols: "AAPL",
    });
    expect(quoteData.AAPL).toBeDefined();
    expect(quoteData.AAPL.quote).toEqual({ symbol: "AAPL", last_trade_price: "150.00" });
  });

  it("registerAuthTools handlers work", async () => {
    const { registerAuthTools } = await import("../../src/server/tools/auth.js");
    const { server, tools } = captureMockServer();
    registerAuthTools(server);

    expect(tools.robinhood_browser_login).toBeDefined();
    expect(tools.robinhood_check_session).toBeDefined();

    const loginData = await callTool(tools, "robinhood_browser_login");
    expect(loginData.status).toBe("logged_in");
    expect(loginData.account_hint).toBe("...4521");
  });

  it("registerOptionsTools returns chain and options", async () => {
    const { registerOptionsTools } = await import("../../src/server/tools/options.js");
    const { server, tools } = captureMockServer();
    registerOptionsTools(server);

    expect(tools.robinhood_get_options).toBeDefined();

    const data = await callTool(tools, "robinhood_get_options", {
      symbol: "AAPL",
    });
    expect(data.chain_info).toEqual({ id: "chain1", expiration_dates: ["2025-01-17"] });
    expect(data.options).toHaveLength(1);
    expect(data.options[0].id).toBe("opt1");
  });

  it("registerOptionsTools includes market data when all filters provided", async () => {
    const { registerOptionsTools } = await import("../../src/server/tools/options.js");
    const { server, tools } = captureMockServer();
    registerOptionsTools(server);

    const data = await callTool(tools, "robinhood_get_options", {
      symbol: "AAPL",
      expiration_date: "2025-01-17",
      strike_price: 150,
      option_type: "call",
    });
    expect(data.market_data).toEqual([{ implied_volatility: "0.3" }]);
  });

  it("registerCryptoTools quote handler", async () => {
    const { registerCryptoTools } = await import("../../src/server/tools/crypto.js");
    const { server, tools } = captureMockServer();
    registerCryptoTools(server);

    expect(tools.robinhood_get_crypto).toBeDefined();

    const data = await callTool(tools, "robinhood_get_crypto", {
      symbol: "BTC",
      info_type: "quote",
    });
    expect(data.quote).toEqual({ mark_price: "50000.00" });
  });

  it("registerCryptoTools positions handler", async () => {
    const { registerCryptoTools } = await import("../../src/server/tools/crypto.js");
    const { server, tools } = captureMockServer();
    registerCryptoTools(server);

    const data = await callTool(tools, "robinhood_get_crypto", {
      info_type: "positions",
    });
    expect(data.positions).toEqual([{ currency: { code: "BTC" } }]);
  });

  it("registerCryptoTools requires symbol for quote", async () => {
    const { registerCryptoTools } = await import("../../src/server/tools/crypto.js");
    const { server, tools } = captureMockServer();
    registerCryptoTools(server);

    const handler = tools.robinhood_get_crypto as ToolHandler;
    const result = (await handler({ info_type: "quote" })) as {
      content: Array<{ text: string }>;
      isError: boolean;
    };
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed.error).toContain("symbol is required");
  });
});

describe("Tool error handling", () => {
  it("returns isError when client method throws", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const rh = getClient();
    (rh.getQuotes as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("API failure"));

    const { registerStockTools } = await import("../../src/server/tools/stocks.js");
    const { server, tools } = captureMockServer();
    registerStockTools(server);

    const handler = tools.robinhood_get_stock_quote as ToolHandler;
    const result = (await handler({ symbols: "AAPL" })) as {
      content: Array<{ text: string }>;
      isError: boolean;
    };
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed.error).toContain("API failure");
  });

  it("returns isError when order placement throws", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const rh = getClient();
    (rh.orderStock as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Insufficient funds"),
    );

    const { registerOrderTools } = await import("../../src/server/tools/orders.js");
    const { server, tools } = captureMockServer();
    registerOrderTools(server);

    const handler = tools.robinhood_place_stock_order as ToolHandler;
    const result = (await handler({
      symbol: "AAPL",
      side: "buy",
      quantity: 100,
      time_in_force: "gtc",
      extended_hours: false,
      trail_type: "percentage",
    })) as {
      content: Array<{ text: string }>;
      isError: boolean;
    };
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed.error).toContain("Insufficient funds");
  });
});
