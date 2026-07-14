/**
 * URL builders for Robinhood API endpoints.
 *
 * API_BASE and NUMMUS_BASE are constants — the client talks directly
 * to Robinhood with Bearer auth injected by the session layer.
 */

export const API_BASE = "https://api.robinhood.com";
export const NUMMUS_BASE = "https://nummus.robinhood.com";

/** Trusted origins for redirect safety. */
export function trustedOrigins(): Set<string> {
  return new Set([
    new URL(API_BASE).origin,
    new URL(NUMMUS_BASE).origin,
    new URL("https://robinhood.com").origin,
  ]);
}

const SAFE_PATH_SEGMENT = /^[a-zA-Z0-9_.-]+$/;

/** Reject path segments that could cause path traversal or injection. */
function safeSegment(value: string, label: string): string {
  if (!SAFE_PATH_SEGMENT.test(value)) {
    throw new Error(
      `Invalid ${label}: must contain only alphanumeric, hyphen, underscore, or dot characters`,
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function oauthToken(): string {
  return `${API_BASE}/oauth2/token/`;
}

export function oauthRevoke(): string {
  return `${API_BASE}/oauth2/revoke_token/`;
}

export function challenge(challengeId: string): string {
  return `${API_BASE}/challenge/${safeSegment(challengeId, "challengeId")}/respond/`;
}

export function pathfinderUserMachine(): string {
  return `${API_BASE}/pathfinder/user_machine/`;
}

export function pathfinderInquiry(machineId: string): string {
  return `${API_BASE}/pathfinder/inquiries/${safeSegment(machineId, "machineId")}/user_view/`;
}

export function pushPromptStatus(challengeId: string): string {
  return `${API_BASE}/push/${safeSegment(challengeId, "challengeId")}/get_prompts_status/`;
}

// ---------------------------------------------------------------------------
// Accounts & Profiles
// ---------------------------------------------------------------------------

export function accounts(): string {
  return `${API_BASE}/accounts/`;
}

export function account(accountNumber: string): string {
  return `${API_BASE}/accounts/${safeSegment(accountNumber, "accountNumber")}/`;
}

export function portfolios(): string {
  return `${API_BASE}/portfolios/`;
}

export function portfolio(accountNumber: string): string {
  return `${API_BASE}/portfolios/${safeSegment(accountNumber, "accountNumber")}/`;
}

export function portfolioHistoricals(accountNumber: string): string {
  return `${API_BASE}/portfolios/historicals/${safeSegment(accountNumber, "accountNumber")}/`;
}

export function user(): string {
  return `${API_BASE}/user/`;
}

export function userBasicInfo(): string {
  return `${API_BASE}/user/basic_info/`;
}

export function investmentProfile(): string {
  return `${API_BASE}/user/investment_profile/`;
}

export function dividends(): string {
  return `${API_BASE}/dividends/`;
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

export function positions(): string {
  return `${API_BASE}/positions/`;
}

// ---------------------------------------------------------------------------
// Stocks
// ---------------------------------------------------------------------------

export function quotes(): string {
  return `${API_BASE}/quotes/`;
}

export function quote(symbol: string): string {
  return `${API_BASE}/quotes/${safeSegment(symbol.toUpperCase(), "symbol")}/`;
}

export function instruments(): string {
  return `${API_BASE}/instruments/`;
}

export function instrument(instrumentId: string): string {
  return `${API_BASE}/instruments/${safeSegment(instrumentId, "instrumentId")}/`;
}

export function fundamentals(): string {
  return `${API_BASE}/fundamentals/`;
}

export function fundamental(symbol: string): string {
  return `${API_BASE}/fundamentals/${safeSegment(symbol.toUpperCase(), "symbol")}/`;
}

export function stockHistoricals(): string {
  return `${API_BASE}/quotes/historicals/`;
}

export function stockHistoricalsFor(symbol: string): string {
  return `${API_BASE}/quotes/historicals/${safeSegment(symbol.toUpperCase(), "symbol")}/`;
}

export function news(symbol: string): string {
  return `${API_BASE}/midlands/news/${safeSegment(symbol.toUpperCase(), "symbol")}/`;
}

export function ratings(instrumentId: string): string {
  return `${API_BASE}/midlands/ratings/${safeSegment(instrumentId, "instrumentId")}/`;
}

export function earnings(): string {
  return `${API_BASE}/marketdata/earnings/`;
}

/**
 * Daily short-interest series. Keyed on instrument ID via the `ids` query
 * param; accepts an optional `start_date` (YYYY-MM-DD). Returns a modeled
 * daily estimate (with confidence bounds), not the official biweekly FINRA
 * settlement figure.
 */
export function shortInterest(): string {
  return `${API_BASE}/marketdata/fundamentals/short/v1/`;
}

export function tags(tag: string): string {
  return `${API_BASE}/midlands/tags/tag/${safeSegment(tag, "tag")}/`;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export function optionChains(): string {
  return `${API_BASE}/options/chains/`;
}

export function optionChain(chainId: string): string {
  return `${API_BASE}/options/chains/${safeSegment(chainId, "chainId")}/`;
}

export function optionInstruments(): string {
  return `${API_BASE}/options/instruments/`;
}

export function optionMarketData(optionId: string): string {
  return `${API_BASE}/marketdata/options/${safeSegment(optionId, "optionId")}/`;
}

export function optionOrders(): string {
  return `${API_BASE}/options/orders/`;
}

export function optionOrder(orderId: string): string {
  return `${API_BASE}/options/orders/${safeSegment(orderId, "orderId")}/`;
}

export function optionPositions(): string {
  return `${API_BASE}/options/positions/`;
}

export function optionAggregatePositions(): string {
  return `${API_BASE}/options/aggregate_positions/`;
}

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

export function indexes(): string {
  return `${API_BASE}/indexes/`;
}

export function indexValues(): string {
  return `${API_BASE}/marketdata/indexes/values/v1/`;
}

// ---------------------------------------------------------------------------
// Crypto
// ---------------------------------------------------------------------------

export function cryptoCurrencyPairs(): string {
  return `${NUMMUS_BASE}/currency_pairs/`;
}

export function cryptoQuote(pairId: string): string {
  return `${API_BASE}/marketdata/forex/quotes/${safeSegment(pairId, "pairId")}/`;
}

export function cryptoHistoricals(pairId: string): string {
  return `${API_BASE}/marketdata/forex/historicals/${safeSegment(pairId, "pairId")}/`;
}

export function cryptoHoldings(): string {
  return `${NUMMUS_BASE}/holdings/`;
}

export function cryptoOrders(): string {
  return `${NUMMUS_BASE}/orders/`;
}

export function cryptoOrder(orderId: string): string {
  return `${NUMMUS_BASE}/orders/${safeSegment(orderId, "orderId")}/`;
}

export function cryptoAccounts(): string {
  return `${NUMMUS_BASE}/accounts/`;
}

// ---------------------------------------------------------------------------
// Stock Orders
// ---------------------------------------------------------------------------

export function stockOrders(): string {
  return `${API_BASE}/orders/`;
}

export function stockOrder(orderId: string): string {
  return `${API_BASE}/orders/${safeSegment(orderId, "orderId")}/`;
}

export function cancelStockOrder(orderId: string): string {
  return `${API_BASE}/orders/${safeSegment(orderId, "orderId")}/cancel/`;
}

export function cancelOptionOrder(orderId: string): string {
  return `${API_BASE}/options/orders/${safeSegment(orderId, "orderId")}/cancel/`;
}

export function cancelCryptoOrder(orderId: string): string {
  return `${NUMMUS_BASE}/orders/${safeSegment(orderId, "orderId")}/cancel/`;
}

// ---------------------------------------------------------------------------
// Markets
// ---------------------------------------------------------------------------

export function markets(): string {
  return `${API_BASE}/markets/`;
}

export function marketHours(market: string, date: string): string {
  return `${API_BASE}/markets/${safeSegment(market, "market")}/hours/${safeSegment(date, "date")}/`;
}

export function topMoversSp500(): string {
  return `${API_BASE}/midlands/movers/sp500/`;
}

export function topMovers(): string {
  return `${API_BASE}/midlands/tags/tag/top-movers/`;
}

export function top100(): string {
  return `${API_BASE}/midlands/tags/tag/100-most-popular/`;
}
