/**
 * URL builders for Robinhood API endpoints.
 *
 * API_BASE and NUMMUS_BASE are constants — the client talks directly
 * to Robinhood with Bearer auth injected by the session layer.
 */

export const API_BASE = "https://api.robinhood.com";
export const NUMMUS_BASE = "https://nummus.robinhood.com";
// bonfire: order checks/warnings, unified portfolio, tax_info.
// dora: news feed + similar instruments (research). Both reached with the
// same standard Bearer token as api/nummus. `ceres/v1`, `discovery`, `pluto`,
// `marketdata` and `beacon` (scanners) are path prefixes on API_BASE, so they
// need no new origin.
export const BONFIRE_BASE = "https://bonfire.robinhood.com";
export const DORA_BASE = "https://dora.robinhood.com";

/** Trusted origins for redirect safety. */
export function trustedOrigins(): Set<string> {
  return new Set([
    new URL(API_BASE).origin,
    new URL(NUMMUS_BASE).origin,
    new URL(BONFIRE_BASE).origin,
    new URL(DORA_BASE).origin,
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

/** Unified portfolio snapshot (bonfire): equity/crypto/margin + buying-power breakdown. */
export function unifiedPortfolio(accountNumber: string): string {
  return `${BONFIRE_BASE}/accounts/${safeSegment(accountNumber, "accountNumber")}/unified/`;
}

/** Live per-asset-class market values + cash (bonfire). */
export function portfolioLive(accountNumber: string): string {
  return `${BONFIRE_BASE}/portfolio/account/${safeSegment(accountNumber, "accountNumber")}/live/`;
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

/** Level-2 price book (aggregated bid/ask depth) for an instrument. */
export function priceBookSnapshot(instrumentId: string): string {
  return `${API_BASE}/marketdata/pricebook/snapshots/${safeSegment(instrumentId, "instrumentId")}/`;
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

/** A single option instrument by id — used to validate a raw option_id before a write. */
export function optionInstrument(optionId: string): string {
  return `${API_BASE}/options/instruments/${safeSegment(optionId, "optionId")}/`;
}

export function optionMarketData(optionId: string): string {
  return `${API_BASE}/marketdata/options/${safeSegment(optionId, "optionId")}/`;
}

export function optionHistoricals(optionId: string): string {
  return `${API_BASE}/marketdata/options/historicals/${safeSegment(optionId, "optionId")}/`;
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
// Order review (pre-trade simulation — read-only, standard-token GETs)
// ---------------------------------------------------------------------------

/**
 * Equity pre-trade preflight: collar `threshold_servars`, day-trade buying
 * power, and priceband flags for one instrument. Query params `account_number`
 * + `instrument`. Read-only (the app's order-preview screen calls this).
 */
export function equityOrderCheckPresubmit(): string {
  return `${API_BASE}/orders/order_checks/presubmit_data/`;
}

/**
 * Option pre-trade preflight: contract/spread `threshold_servars` for a chain.
 * Query params `account_number` + `chain_id`. Note: no trailing slash (matches
 * the app's request exactly). Read-only.
 */
export function optionOrderCheckPresubmit(): string {
  return `${API_BASE}/options/order_checks/presubmit_data`;
}

/** Option collateral requirement for a chain. Query param `account_number`. Read-only. */
export function optionChainCollateral(chainId: string): string {
  return `${API_BASE}/options/chains/${safeSegment(chainId, "chainId")}/collateral/`;
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

// ---------------------------------------------------------------------------
// Watchlists (discovery/lists reads · midlands/lists writes)
// ---------------------------------------------------------------------------

/** The user's own watchlists (metadata, not items). */
export function watchlistsDefault(): string {
  return `${API_BASE}/discovery/lists/default/`;
}

/** Robinhood-curated lists the user can follow (paginated). */
export function watchlistsPopular(): string {
  return `${API_BASE}/discovery/lists/popular/`;
}

/**
 * Items of a single watchlist, enriched with symbol/name (query param
 * `list_id`). Works for both user-owned and curated lists; a non-existent
 * list id returns 404, an empty list returns `{results: []}`.
 */
export function watchlistItems(): string {
  return `${API_BASE}/discovery/lists/items/`;
}

/**
 * Watchlist item add/remove (write). The migration from `/watchlists/` →
 * `/discovery/lists/` left the item-write path on `midlands`; the body is a
 * per-list-id map (built internally by the client — never exposed).
 */
export function watchlistItemsWrite(): string {
  return `${API_BASE}/midlands/lists/items/`;
}

/**
 * Create a watchlist (write). `POST /midlands/lists/` with the list object
 * (display_name, …). Same `midlands` service as the confirmed item-write path.
 */
export function watchlistsWrite(): string {
  return `${API_BASE}/midlands/lists/`;
}

/**
 * Update (`PATCH`) or delete (`DELETE`) a single watchlist by id (write).
 * `midlands/lists/{id}/` — same service as create + item-write.
 */
export function watchlistWrite(listId: string): string {
  return `${API_BASE}/midlands/lists/${safeSegment(listId, "listId")}/`;
}

/**
 * Follow (`POST` with an empty `{}` JSON body → 201) or unfollow (`DELETE` → 204)
 * a Robinhood-curated list. The follower id is the caller's OWN profile uuid
 * (from `GET /user/`.id) — never a tool param; only ever placed in the URL.
 */
export function watchlistFollower(listId: string, userId: string): string {
  return `${API_BASE}/discovery/lists/${safeSegment(listId, "listId")}/followers/${safeSegment(userId, "userId")}/`;
}

/**
 * Add an option to the options watchlist (write). `POST /discovery/lists/items/quick_add/`
 * mints a single-leg `option_strategy` object from the leg and auto-routes it to
 * the user's options watchlist (no list_id param). Removal is via the midlands
 * item-write path (`watchlistItemsWrite`), keyed by the minted strategy object_id.
 */
export function watchlistItemQuickAdd(): string {
  return `${API_BASE}/discovery/lists/items/quick_add/`;
}

// ---------------------------------------------------------------------------
// Tax lots (read)
// ---------------------------------------------------------------------------

/**
 * Open tax lots for one equity holding — `GET /tax_lots/open/{account}/{instrument}/`.
 * Each lot is a separate acquisition with its own quantity, cost basis, acquisition
 * date, and long/short-term status. Paginated; standard-token readable.
 */
export function equityTaxLotsOpen(accountNumber: string, instrumentId: string): string {
  return `${API_BASE}/tax_lots/open/${safeSegment(accountNumber, "accountNumber")}/${safeSegment(instrumentId, "instrumentId")}/`;
}

// ---------------------------------------------------------------------------
// Scanners / screeners (Beacon service, on api.robinhood.com)
// ---------------------------------------------------------------------------

/**
 * The user's saved scanners (screeners). Served by the gRPC-transcoded Beacon
 * Scanner service: `GET api.robinhood.com/beacon/scans/` → `{scans: [...]}`
 * (camelCase wire fields), empty `{scans: []}` when the user has none. Takes no
 * query params. The filter-spec catalog that powers scan-building is NOT a live
 * route reachable with a standard token — it's served from an embedded capture
 * (see `scanner-filter-specs.ts`).
 */
export function beaconScans(): string {
  return `${API_BASE}/beacon/scans/`;
}
