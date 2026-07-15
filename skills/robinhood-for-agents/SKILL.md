---
name: robinhood-for-agents
description: Trade stocks, options, and crypto on Robinhood — dual mode (MCP tools or TypeScript client).
homepage: https://github.com/kevin1chun/robinhood-for-agents
allowed-tools: mcp__robinhood-for-agents__*
install:
  - kind: node
    package: robinhood-for-agents
    bins: [robinhood-for-agents]
requires:
  bins: [bun, google-chrome]
metadata: {"credentials":"OAuth tokens stored via TokenStore adapters: KeychainTokenStore (OS keychain, default) or EncryptedFileTokenStore (for Docker/headless). restoreSession() loads tokens and injects Bearer auth directly. Tokens expire ~24h with auto-refresh on 401.","chrome":"Required only for initial login (bunx robinhood-for-agents onboard). Not needed for subsequent API calls."}
---

# robinhood-for-agents

AI-native Robinhood trading interface. **No MCP server required** — this skill works standalone via the TypeScript client API and `bun`.

## How to Use

Run Robinhood operations by executing TypeScript code with `bun`. The `robinhood-for-agents` npm package provides a full client library — just import it and call methods:

```bash
bun -e '
import { getClient } from "robinhood-for-agents";
const rh = getClient();
await rh.restoreSession();
// call any method, print results as JSON
const holdings = await rh.buildHoldings();
console.log(JSON.stringify(holdings, null, 2));
'
```

See [client-api.md](client-api.md) for all available methods and signatures.

> **MCP users:** If you have the `robinhood-for-agents` MCP server configured, you may use MCP tools instead. See [reference.md](reference.md) for tool parameters. MCP is optional — the client API above does everything the MCP tools do.

## CRITICAL SAFETY RULES
1. **Always confirm before placing any order** — show order preview, get explicit "yes"
2. **Show current price** before order confirmation so user knows the cost
3. **Never place orders without user confirmation**
4. **Fund transfers and bank operations are BLOCKED** — refuse these requests
5. **Never place bulk cancel operations** — cancel orders one at a time

### BLOCKED Operations (never use)
- Bulk cancel operations
- Fund transfers (withdraw/deposit)
- Bank unlinking

## Routing

| User Intent | Domain File | Example Triggers |
|---|---|---|
| Auth / login / connect | [setup.md](setup.md) | "setup robinhood", "connect to robinhood", "robinhood login" |
| Portfolio / holdings / positions | [portfolio.md](portfolio.md) | "show my portfolio", "my holdings", "account summary" |
| Stock research / analysis | [research.md](research.md) | "research AAPL", "analyze TSLA", "due diligence on NVDA" |
| Buy / sell / orders / cancel | [trade.md](trade.md) | "buy 10 shares of AAPL", "sell my TSLA", "cancel my order" |
| Options / calls / puts / chains | [options.md](options.md) | "show AAPL options", "SPX calls", "0DTE options", "covered calls" |
| Watchlists / lists / "add to my list" | (see below) | "my watchlists", "add NVDA to my tech list", "remove TSLA from watchlist" |
| Scanners / screeners / saved screens | [reference.md](reference.md) | "my scanners", "my saved screens", "what filters can I scan on" |
| Realized P&L / gains / "how did my trades do" | [reference.md](reference.md) | "my realized gains", "P&L this year", "how did my trades do" |
| Tax lots / cost basis per holding | [reference.md](reference.md) | "tax lots for AAPL", "cost basis of my NVDA lots", "which lots are long-term" |

Read the corresponding domain file for detailed workflow instructions.

## Authentication Prerequisite
Before any data-fetching or trading operation, verify the session is active:
```bash
bun -e 'import { getClient } from "robinhood-for-agents"; const rh = getClient(); await rh.restoreSession(); console.log("ok");'
```
If it throws, follow [setup.md](setup.md) to authenticate.

## Client Method Inventory

| Method | Category | Description |
|---|---|---|
| `restoreSession()` | Auth | Restore/validate session (throws if not authenticated) |
| `getAccountProfile()` | Account | Account details and preferences |
| `getAccounts()` | Account | All brokerage accounts |
| `buildHoldings(opts?)` | Portfolio | Holdings with P&L, equity, buying power |
| `getUnifiedPortfolio(accountNumber?)` | Portfolio | Total equity + full buying-power breakdown (bonfire) |
| `getPortfolioLive(accountNumber?)` | Portfolio | Live per-asset-class market values + cash (bonfire) |
| `getPositions(opts?)` | Portfolio | Raw equity positions (shares, avg price) |
| `getCryptoPositions()` | Crypto | Crypto holdings |
| `getCryptoQuote(symbol)` | Crypto | Current crypto price |
| `getQuotes(symbols)` | Research | Stock quotes (price, bid/ask, P/E) |
| `getFundamentals(symbols)` | Research | Market cap, valuation, dividends, 52-week range, sector |
| `getPriceBook(symbol)` | Research | Level-2 bid/ask depth |
| `getTradability(symbols)` | Research | Tradability flags (fractional, short-selling, per-account) |
| `getNews(symbol)` | Research | Recent news articles |
| `getRatings(symbol)` | Research | Analyst buy/hold/sell ratings |
| `getEarnings(symbol)` | Research | Quarterly EPS history for one symbol |
| `getEarningsCalendar(rangeDays?)` | Research | Market-wide earnings calendar for a day window |
| `getStockHistoricals(symbols, opts?)` | Research | OHLCV price history |
| `findInstruments(query)` | Research | Search stocks by keyword |
| `getChains(symbol)` | Options | Option chain expirations |
| `findTradableOptions(symbol, opts?)` | Options | Option instruments by expiration/strike/type |
| `getOptionMarketData(symbol, exp, strike, type)` | Options | Greeks and pricing |
| `getOptionPositions(opts?)` / `getOptionAggregatePositions(opts?)` | Options | Open option positions (per-leg or by strategy) |
| `getOptionHistoricals(symbol, exp, strike, type, opts?)` | Options | Historical OHLC for one contract |
| `getIndexValue(symbol)` | Options | Current index value (SPX, NDX, etc.) |
| `getIndexInstruments()` / `getIndexQuotes(symbols)` | Markets | List indexes / current index values |
| `getMovers()` | Markets | Top market movers |
| `getWatchlists()` | Watchlists | Your own watchlists (with list ids) |
| `getWatchlistItems(listId)` | Watchlists | Items of a list, enriched with symbol/name |
| `getPopularWatchlists()` | Watchlists | Robinhood-curated lists to follow |
| `getOptionWatchlist()` | Watchlists | Your options watchlist (metadata) |
| `getOptionWatchlistContracts()` | Watchlists | Single-leg option contracts on the options watchlist (backend for `get_option_watchlist`) |
| `updateWatchlistItems(listId, op, items)` | Watchlists | Add/remove list items — **confirm first** |
| `createWatchlist(name, opts?)` | Watchlists | Create a new (empty) watchlist — **confirm first** |
| `updateWatchlist(listId, updates)` | Watchlists | Rename / re-describe a watchlist — **confirm first** |
| `followWatchlist(listId)` | Watchlists | Follow a Robinhood-curated list — **confirm first** |
| `unfollowWatchlist(listId)` | Watchlists | Unfollow a curated list — **confirm first** |
| `getOptionInstrumentById(optionId)` | Options | Validate/fetch one option instrument by id |
| `quickAddOption(optionId, "long")` | Options | Mint one single-leg long contract on the options watchlist — **confirm first** (long only) |
| `getScannerFilterSpecs()` | Scanners | Filter vocabulary for scans (embedded catalog) |
| `getScans()` | Scanners | Your saved scanners (raw Beacon objects) |
| `getRealizedPnl(opts?)` | P&L | Realized P&L computed from order history (equity FIFO + native crypto; options excluded) |
| `getEquityTaxLots(symbol, { accountNumber })` | Tax Lots | Open tax lots for one equity holding (quantity, cost basis, term, open date) — real endpoint passthrough |
| `resolveInstrumentBySymbol(symbol)` | Research | Exact instrument for a ticker (no fuzzy guess) |
| `reviewEquityOrder(opts)` | Trading | Pre-trade simulation: live quote + reproduced price collar (places nothing) |
| `reviewOptionOrder(opts)` | Trading | Pre-trade option simulation: per-leg data + required collateral (places nothing) |
| `orderStock(symbol, side, qty, opts?)` | Trading | Place stock order |
| `orderOption(symbol, legs, price, qty, dir, opts?)` | Trading | Place option order |
| `orderCrypto(symbol, side, amount, opts?)` | Trading | Place crypto order |
| `getAllStockOrders()` / `getOpenStockOrders()` | Trading | View stock orders |
| `cancelStockOrder(id)` | Trading | Cancel stock order |
| `getStockOrder(id)` | Trading | Check order fill status |

## Watchlists

Watchlists are identified by **list_id (UUID)** — there is no "default list" shortcut, by design (so a write can never hit the wrong list). The flow:

1. **Look up the id** — `robinhood_get_watchlists` (your own lists) or `robinhood_get_popular_watchlists` (curated). Pick the list; note its `id` and `owner_type`.
2. **Read items** — `robinhood_get_watchlist_items` with that `list_id` (items come back enriched with `symbol`). For the options watchlist use `robinhood_get_option_watchlist` — it now returns the actual single-leg option **contracts** (each with `option_id`, `position_type`, `chain_symbol`, `strategy`), not just metadata.
3. **Write items** — `robinhood_add_to_watchlist` / `robinhood_remove_from_watchlist`. **Always confirm the exact list + symbols with the user before calling** (these mutate the user's account). Pass exactly one of `symbols`, `currency_pair_ids`, or `index_ids`. Adds/removes are idempotent (already-present / not-present items are no-ops, reported as such — never an error).
4. **Create / rename a list** — `robinhood_create_watchlist` (new empty list; returns its `id`, then populate with add) / `robinhood_update_watchlist` (change name/description/emoji only — not items). **Confirm with the user first.**
5. **Follow / unfollow a curated list** — `robinhood_follow_watchlist` / `robinhood_unfollow_watchlist` (by `list_id` from `robinhood_get_popular_watchlists`) make a Robinhood-curated list appear in / disappear from the user's watchlists. **Confirm with the user first.**
6. **Add / remove option contracts** — `robinhood_add_option_to_watchlist` / `robinhood_remove_option_from_watchlist` (by `option_ids`, 1–20 per call) manage single-leg contracts on the options watchlist. **Confirm with the user first.**

Writes are single-list, single-operation only. To move a symbol between lists, that's a remove then an add — two confirmed calls. There is **no** delete-watchlist tool (by design — the official MCP has none).

**Options watchlist limits:** only **long** single-leg contracts can be added/removed here (`position_type: "long"` is the only supported path — "short" returns an error directing to the Robinhood app). **Multi-leg** option strategies are not modifiable here (they surface in `get_option_watchlist` with a null `option_id` and a pointer to the app). Use the Robinhood app for short legs and multi-leg strategies.

## Important Notes
- **Do NOT use `phoenix.robinhood.com`** — use `api.robinhood.com` endpoints only
- Multi-account is first-class: always ask which account when multiple exist
- Session tokens expire ~24h; the client auto-refreshes before requiring re-auth
