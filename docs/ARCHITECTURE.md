# robinhood-for-agents -- Architecture & Design

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        User / Claude                            │
│                                                                 │
│   "show my portfolio"          robinhood_get_portfolio(...)     │
│          │                              │                       │
│          ▼                              ▼                       │
│   ┌─────────────┐              ┌──────────────┐                 │
│   │   Skills    │              │  MCP Tools   │                 │
│   │ (SKILL.md)  │              │ (JSON-RPC)   │                 │
│   └──────┬──────┘              └──────┬───────┘                 │
│          │                            │                         │
│          │  RobinhoodClient()         │  getClient() singleton  │
│          │  .restoreSession()         │  getAuthenticatedRh()   │
│          │  .getPositions()           │                         │
│          ▼                            ▼                         │
│   ┌───────────────────────────────────────────┐                 │
│   │      TypeScript client (src/client/)      │                 │
│   │  ┌─────────────────────────────────────┐  │                 │
│   │  │  session: RobinhoodSession (fetch)  │  │                 │
│   │  │  auth.ts  ──► TokenStore + refresh  │  │                 │
│   │  │  http.ts  ──► get/post/delete+paging│  │                 │
│   │  │  urls.ts  ──► const URL builders    │  │                 │
│   │  └─────────────────────────────────────┘  │                 │
│   └──────────────────┬────────────────────────┘                 │
│                      │                                          │
│                      │  Authorization: Bearer <token>           │
│                      ▼                                          │
│            api.robinhood.com                                    │
│            nummus.robinhood.com (crypto)                        │
│            bonfire.robinhood.com (portfolio, earnings, lists)   │
│            dora.robinhood.com (research)                        │
└─────────────────────────────────────────────────────────────────┘
```

`src/client/` is the TypeScript API client. `src/server/` is the MCP server that wraps it. Both talk directly to Robinhood APIs with Bearer auth -- no intermediate proxy.

## Tech Stack

| Choice | Rationale |
|--------|-----------|
| **Bun** | Native TS execution, fast startup, built-in fetch |
| **ESM-only** | Bun is ESM-native, no CJS needed |
| **@modelcontextprotocol/sdk** | Official MCP SDK, StdioServerTransport for agent compatibility |
| **Zod v4** | Types API response shapes (client casts, not runtime-parsed) + runtime-validates MCP tool parameters |
| **Vitest** | Fast TS-native testing, correct module isolation via `vi.mock()` |
| **Biome v2** | All-in-one lint + format, 10-25x faster than ESLint |
| **Bun.secrets** | OS keychain access (macOS Keychain Services, Linux libsecret) |
| **playwright-core** | Browser auth via system Chrome, no bundled browser (~1MB) |

## File Map

```
src/client/                    <- robinhood-for-agents client library
├── index.ts                   <- Exports: RobinhoodClient, getClient(), login()
├── client.ts                  <- RobinhoodClient class (76 async methods)
├── auth.ts                    <- Direct auth: TokenStore load, Bearer injection, proactive +
│                                 401 refresh, rotation recovery (adoptFromStore)
├── token-store.ts             <- TokenStore interface + KeychainTokenStore + EncryptedFileTokenStore
├── session.ts                 <- fetch wrapper (Bearer injection, pre-request ensureFreshToken,
│                                 401 retry, redirect safety)
├── http.ts                    <- GET/POST/DELETE with pagination + trusted-origin validation
├── urls.ts                    <- Const URL builders (API_BASE, NUMMUS_BASE, BONFIRE_BASE, DORA_BASE)
├── errors.ts                  <- Exception hierarchy
├── types.ts                   <- Zod schemas + inferred types
└── branded.ts                 <- AccountNumber, OrderId, etc. branded types

src/compute/                   <- Pure derived-data modules (no HTTP)
├── realized-pnl.ts            <- FIFO realized P&L + bucketing
└── order-review.ts            <- Price-collar simulation for order review

src/server/                    <- robinhood-for-agents MCP server
├── index.ts                   <- main() export, StdioServerTransport
├── server.ts                  <- McpServer creation + tool registration
├── browser-auth.ts            <- Playwright browser login capture
├── cli/
│   ├── onboard.ts            <- Interactive setup TUI (also handles Docker token export)
│   ├── install-mcp.ts        <- Install MCP server config
│   ├── install-skills.ts     <- Install Claude Code skills
│   ├── install-workspace-dep.ts <- Install npm dep into agent workspaces (OpenClaw)
│   ├── detect.ts             <- Agent detection
│   ├── paths.ts              <- Package/bin path resolution
│   └── agents/               <- Agent-specific config generators
└── tools/                     <- 50 MCP tools across 12 modules
    ├── auth.ts               <- browser_login, check_session
    ├── portfolio.ts          <- get_portfolio, get_equity_positions, get_accounts, get_account
    ├── stocks.ts             <- get_stock_quote, get_historicals, get_fundamentals, get_short_interest,
    │                            get_news, search, get_equity_price_book, get_earnings_results,
    │                            get_earnings_calendar, get_equity_tradability
    ├── options.ts            <- get_options, get_option_positions, get_option_orders, get_option_historicals
    ├── crypto.ts             <- get_crypto
    ├── orders.ts             <- place_stock_order, place_option_order, place_crypto_order,
    │                            get_orders, cancel_order, get_order_status
    ├── markets.ts            <- get_movers, get_indexes, get_index_quotes
    ├── watchlists.ts         <- get/create/update watchlists, add/remove items,
    │                            follow/unfollow, options-watchlist read + add/remove
    ├── scanners.ts           <- get_scans, get_scanner_filter_specs
    ├── pnl.ts                <- get_realized_pnl, get_pnl_trade_history
    ├── review.ts             <- review_equity_order, review_option_order
    └── tax-lots.ts           <- get_equity_tax_lots
```

## Authentication

### TokenStore Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  restoreSession(session, store)                                        │
│  (every tool call)                                                     │
│          │                                                              │
│          ▼                                                              │
│  store.load() → TokenData | null                                       │
│          │                                                              │
│          ├── KeychainTokenStore (default)                               │
│          │   Bun.secrets.get("robinhood-for-agents", "session-tokens") │
│          │                                                              │
│          ├── EncryptedFileTokenStore (ROBINHOOD_TOKENS_FILE set)       │
│          │   AES-256-GCM decrypt from ~/.robinhood-for-agents/tokens.enc│
│          │                                                              │
│          └── null → AuthenticationError("No tokens found")             │
│          │                                                              │
│          ▼                                                              │
│  backfill tokens.expires_at if absent (deriveExpiresAt)                │
│  session.setAccessToken(tokens.access_token)                           │
│  session.onUnauthorized  = refreshCallback(state)      (reactive, 401) │
│  session.ensureFreshToken = ensureFreshCallback(state) (proactive, 24h)│
│          │                                                              │
│          ▼                                                              │
│  return { status: "logged_in", method: "keychain" | "encrypted_file" }│
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

`status: "logged_in"` here means only that tokens loaded from the store — it is not a claim that they still work. See [Session Health](#session-health).

The client constructor accepts `tokenStore` to override the default, or `accessToken` for direct token injection (no store, no refresh — neither the proactive hook nor the 401 handler is wired up, so an expired token surfaces as `TokenExpiredError`).

```typescript
new RobinhoodClient()                          // auto-detect store
new RobinhoodClient({ tokenStore: myStore })   // custom store
new RobinhoodClient({ accessToken: "xxx" })    // direct token, no refresh
```

Auto-detection (`createTokenStore()`): if `ROBINHOOD_TOKENS_FILE` is set, uses `EncryptedFileTokenStore`; otherwise uses `KeychainTokenStore`.

### Browser Login Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  robinhood_browser_login                                               │
│  (first-time / expired)                                                │
│          │                                                              │
│          ▼                                                              │
│  ┌───────────────────┐                                                  │
│  │ Playwright launches│                                                  │
│  │ system Chrome      │                                                  │
│  │ (headless: false)  │                                                  │
│  └────────┬──────────┘                                                  │
│           │                                                              │
│           ▼                                                              │
│  ┌───────────────────┐                                                  │
│  │ Navigate to        │                                                  │
│  │ robinhood.com/login│                                                  │
│  └────────┬──────────┘                                                  │
│           │                                                              │
│           ▼                                                              │
│  ┌───────────────────┐                                                  │
│  │ User logs in       │                                                  │
│  │ (email, password,  │                                                  │
│  │  MFA push/SMS)     │                                                  │
│  └────────┬──────────┘                                                  │
│           │                                                              │
│           ▼                                                              │
│  ┌───────────────────────────┐                                          │
│  │ Robinhood frontend calls   │                                          │
│  │ POST /oauth2/token         │                                          │
│  │                            │                                          │
│  │ Playwright intercepts:     │                                          │
│  │  request  → device_token   │                                          │
│  │  response → access_token,  │                                          │
│  │             refresh_token   │                                          │
│  └────────┬──────────────────┘                                          │
│           │                                                              │
│           ▼                                                              │
│  saveTokens() ──► token-store.ts                                        │
│           │       createTokenStore().save() → OS keychain (default)     │
│           │       or an AES-256-GCM encrypted file if                   │
│           │       ROBINHOOD_TOKENS_FILE is set (see Token Storage below) │
│           │                                                              │
│           ▼                                                              │
│  Close browser, return tokens to caller                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

The browser login is **purely passive** -- Playwright never clicks buttons, fills forms, or predicts the login flow. It opens a real Chrome window, the user completes login entirely on their own (including whatever MFA Robinhood requires), and Playwright only intercepts the network traffic:

- `page.on("request")` captures `device_token` from POST body to `/oauth2/token`
- `page.on("response")` captures `access_token` + `refresh_token` from the 200 response

This design is resilient to Robinhood UI changes -- it doesn't depend on any DOM selectors, page structure, or login step ordering. `playwright-core` is used (not `playwright`) so no browser binary is bundled.

### Token Storage

```
┌─ token-store.ts ──────────────────────────────────────────────────┐
│                                                                    │
│  INTERFACE                                                         │
│  ─────────                                                         │
│  TokenStore { load(), save(), delete() }                          │
│                                                                    │
│  ADAPTERS                                                          │
│  ────────                                                          │
│                                                                    │
│  1. KeychainTokenStore (default)                                  │
│     ├── load:  Bun.secrets.get("robinhood-for-agents",            │
│     │          "session-tokens") → JSON.parse → TokenData         │
│     ├── save:  Bun.secrets.set(..., JSON.stringify(tokens))       │
│     └── delete: Bun.secrets.delete(...)                           │
│     Storage: OS keychain (macOS Keychain Services, Linux          │
│     libsecret). Never touches the filesystem.                     │
│                                                                    │
│  2. EncryptedFileTokenStore (ROBINHOOD_TOKENS_FILE set)           │
│     ├── load:  readFile → JSON.parse → AES-256-GCM decrypt       │
│     ├── save:  AES-256-GCM encrypt → writeFile                   │
│     └── delete: unlink                                            │
│     File: ~/.robinhood-for-agents/tokens.enc (default)            │
│     Key resolution:                                               │
│       1. ROBINHOOD_TOKEN_KEY env var (base64)                     │
│       2. Keychain ("encryption-key" entry)                        │
│       3. Generate random key → store in keychain                  │
│     Use case: Docker, headless servers, CI — no OS keychain.      │
│                                                                    │
│  HELPERS                                                           │
│  ───────                                                           │
│  deriveExpiresAt(token, {expiresIn, issuedAt})                    │
│    JWT `exp` claim (authoritative) → else issuedAt + expiresIn    │
│  withTimestamp(tokens) → stamps saved_at + expires_at             │
│                                                                    │
│  TokenData (JSON):                                                 │
│  {access_token, refresh_token, token_type, device_token,          │
│   account_hint?, saved_at, expires_at?}                           │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Request Flow (Direct Auth)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Client: GET https://api.robinhood.com/positions/?nonzero=true         │
│          + Authorization: Bearer <access_token>                        │
│         │                                                               │
│         ▼                                                               │
│  session.get(url, params)                                              │
│         ├── authHeaders(): inject Authorization: Bearer <token>        │
│         ├── ensureFreshToken(): renew if within 24h of expires_at,     │
│         │      then re-stamp the Authorization header                  │
│         ├── safeFetch(): manual redirect following (trusted origins)   │
│         │                                                               │
│         ▼                                                               │
│  Robinhood response: 200 / 401                                        │
│         │                                                               │
│         ├── 200 → return response to http.ts for data processing      │
│         │                                                               │
│         └── 401 → fetchWithRetry() calls onUnauthorized()             │
│                    ├── POST /oauth2/token/ (refresh_token grant)       │
│                    ├── Update state.tokens + store.save(newTokens)     │
│                    ├── on rejection: adoptFromStore() re-reads the     │
│                    │      store in case another process rotated first  │
│                    ├── session.accessToken = newToken                   │
│                    └── Retry original request with new Bearer token    │
│                    (concurrent 401s share a single refresh attempt)    │
│                    (still 401 → TokenExpiredError, not APIError)       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Token Refresh & Rotation

Robinhood enforces **single-use refresh-token rotation**: each refresh returns a new `refresh_token`, kills the old one immediately (`HTTP 401 invalid_grant` on replay), and revokes the previous access token as well. Access-token TTL is not fixed -- the `expires_in: 734000` (~8.5 days) we send is only sometimes honored, and observed lifetimes run from ~5.9 to ~8.5 days. The client never assumes a duration: `deriveExpiresAt()` reads the JWT `exp` claim off the access token (falling back to `issuedAt + expires_in`) and persists it as `TokenData.expires_at`.

```
┌─ two refresh paths ───────────────────────────────────────────────┐
│                                                                    │
│  PROACTIVE — session.ensureFreshToken (pre-request hook)           │
│    now >= expires_at - REFRESH_SKEW_SEC (24h) → refresh            │
│    expires_at undefined (legacy entry, non-JWT) → skip, leave      │
│      it to the reactive path                                       │
│                                                                    │
│  REACTIVE — session.onUnauthorized (401 handler)                   │
│    fallback when the proactive hook did not fire or failed         │
│                                                                    │
│  BOTH → refreshTokens(state)                                       │
│    POST api.robinhood.com/oauth2/token/                            │
│      grant_type=refresh_token, client_id=<mobile app>,             │
│      device_token=<stored>, expires_in=734000                      │
│    ok     → new {access,refresh} → state.tokens → store.save()     │
│    not ok → adoptFromStore(): re-read the store; if another        │
│             process already rotated, adopt its token               │
│    save fails → CRITICAL to stderr (rotated token is memory-only)  │
│                                                                    │
│  GUARDS: one in-flight refresh per client (state.refreshing),      │
│  5s minimum interval (MIN_REFRESH_INTERVAL_MS)                     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

Proactive renewal exists because the reactive path alone cannot keep the chain alive: nothing refreshes while the process is idle, so an idle gap longer than the token lifetime lets the refresh chain lapse and forces a new browser login. It is the chain lapsing -- not the access token expiring -- that costs the user a re-login.

`adoptFromStore()` narrows but does not close the multi-process race. There is no cross-process lock, so two clients sharing one store can both attempt a refresh; the loser holds a token the server has already killed and recovers only if the winner has finished persisting. One long-lived process per token store is the intended deployment.

`restoreSession()` backfills `expires_at` for entries persisted before the field existed, and `logout()` clears both `onUnauthorized` and `ensureFreshToken`.

### Session Health

`robinhood_check_session` does not report on stored tokens alone -- loading a token proves nothing about whether it still works. It calls `restoreSession()` and then probes `getAccountProfile()`:

| Status | Meaning |
|---|---|
| `logged_in` | Probe succeeded. Returns `account_hint` (last 4 of the account number) |
| `expired` | Probe raised `AuthenticationError` -- refresh already ran and could not recover. Re-run `robinhood_browser_login` |
| `unknown` | Probe failed for a non-auth reason (network/transient). The session may well be fine |
| `not_authenticated` | No tokens in the store |

## HTTP Layer

### Request Pipeline

```
client.get(url, { dataType: "pagination", params: {...} })
    │
    ▼
http.requestGet(session, url, { dataType, params })
    │
    ▼
session.get(url, params)                <- native fetch
    │
    ├── Headers: Accept, Content-Type, X-Robinhood-API-Version: 1.431.4
    ├── Authorization: Bearer <access_token> (injected by session)
    ├── Timeout: AbortSignal.timeout(16000)
    ├── Redirect: manual (safeFetch validates trusted origins)
    │
    ▼
raiseForStatus(response)
    ├── 404 -> NotFoundError
    ├── 429 -> RateLimitError
    ├── 401 -> TokenExpiredError  (refresh already ran and failed)
    └── other non-2xx -> APIError(statusCode, responseBody)
    │
    ▼
dataType processing:
    ├── "regular"    -> return response.json()
    ├── "results"    -> return data.results
    ├── "indexzero"  -> return data.results[0]
    └── "pagination" -> assertTrustedUrl(next), follow links, accumulate results
```

Pagination URLs returned by Robinhood point directly to `api.robinhood.com` -- no URL rewriting needed. The `assertTrustedUrl()` check ensures pagination never follows links to untrusted domains.

### Exception Hierarchy

```
RobinhoodError
├── AuthenticationError
│   └── TokenExpiredError
├── NotLoggedInError
└── APIError  (.statusCode, .responseBody)
    ├── RateLimitError
    └── NotFoundError
```

Every error carries context. No silent `undefined` returns.

Note the branch: `TokenExpiredError` descends from `AuthenticationError`, **not** `APIError`. A 401 that survives the automatic refresh retry now raises `TokenExpiredError` ("session expired and could not be refreshed. Re-authenticate with browser login.") rather than a bare `APIError: HTTP 401`. Callers that previously matched `APIError` with `statusCode === 401` must catch `AuthenticationError` (or `TokenExpiredError`) instead -- `TokenExpiredError` carries no `statusCode` or `responseBody`.

## Multi-Account

Standard Robinhood `/accounts/` only returns the default APEX account. We always pass:

```typescript
const MULTI_ACCOUNT_PARAMS = {
  default_to_all_accounts: "true",
  include_managed: "true",
  include_multiple_individual: "true",
};
```

Every account-scoped method accepts `accountNumber?: string`:
- `getPositions({ accountNumber })` -- positions for specific account
- `orderStock(..., { accountNumber })` -- place order on specific account
- `buildHoldings({ accountNumber })` -- P&L for specific account
- Omitted -> default account

## MCP Tools (50 total)

Each tool accesses the client via the `getClient()` singleton. Tools are registered by module in `src/server/tools/`:

| Module | Tools (all `robinhood_`-prefixed) |
|---|---|
| `auth.ts` (2) | `browser_login`, `check_session` |
| `portfolio.ts` (4) | `get_portfolio`, `get_equity_positions`, `get_accounts`, `get_account` |
| `stocks.ts` (10) | `get_stock_quote`, `get_historicals`, `get_fundamentals`, `get_short_interest`, `get_news`, `search`, `get_equity_price_book`, `get_earnings_results`, `get_earnings_calendar`, `get_equity_tradability` |
| `options.ts` (4) | `get_options`, `get_option_positions`, `get_option_orders`, `get_option_historicals` |
| `crypto.ts` (1) | `get_crypto` |
| `orders.ts` (6) | `place_stock_order`, `place_option_order`, `place_crypto_order`, `get_orders`, `cancel_order`, `get_order_status` |
| `markets.ts` (4) | `get_movers`, `get_market_hours`, `get_indexes`, `get_index_quotes` |
| `watchlists.ts` (12) | `get_watchlists`, `get_watchlist_items`, `get_popular_watchlists`, `get_option_watchlist`, `create_watchlist`, `update_watchlist`, `add_to_watchlist`, `remove_from_watchlist`, `follow_watchlist`, `unfollow_watchlist`, `add_option_to_watchlist`, `remove_option_from_watchlist` |
| `scanners.ts` (2) | `get_scans`, `get_scanner_filter_specs` |
| `pnl.ts` (2) | `get_realized_pnl`, `get_pnl_trade_history` |
| `review.ts` (2) | `review_equity_order`, `review_option_order` |
| `tax-lots.ts` (1) | `get_equity_tax_lots` |

The [README](../README.md#mcp-tools-50) describes each tool; [`skills/robinhood-for-agents/reference.md`](../skills/robinhood-for-agents/reference.md) documents parameters and response shapes; [`skills/robinhood-for-agents/client-api.md`](../skills/robinhood-for-agents/client-api.md) maps each tool to the client methods it wraps.

## Order Placement

### Order Type Resolution

`orderStock()` determines type from which price parameters are set:

```
Parameters present          -> (orderType, trigger)
─────────────────────────────────────────────────
trailAmount                 -> ("market", "stop")      trailing stop
stopPrice + limitPrice      -> ("limit",  "stop")      stop-limit
stopPrice only              -> ("market", "stop")      stop-loss
limitPrice only             -> ("limit",  "immediate") limit
none                        -> ("market", "immediate") market
```

Stock order payloads include `order_form_version: 7` (required by the Robinhood API).

### Side Resolution (long vs. short)

Robinhood does not infer a short sale from the absence of a position — a short is its own side value, paired with a `position_effect`:

```
Intent                 -> wire payload
──────────────────────────────────────────────────────────
buy to open a long     -> side: "buy"                        (server derives position_effect)
sell to close a long   -> side: "sell"                       (server derives position_effect)
sell to open a short   -> side: "sell_short" + position_effect: "open"
buy to cover a short   -> side: "buy"                        (server stamps position_effect: "close")
```

Both fields are required together for a short: `side: "sell"` alone on an account with no shares is rejected with `Not enough shares to sell.`, and either of `sell_short` / `position_effect` without the other returns `This type of trade is invalid.` `order_form_type` (`"short_selling"`) is derived server-side and deliberately not sent. There is no cover side — `buy_to_cover` is not a valid choice for the field.

Short sales carry constraints beyond the side/effect pair, all verified against the live API and reproduced client-side so the caller gets the reason before an order is attempted:

| Constraint | API rejection when violated |
|---|---|
| Margin-enabled account | `You need to have margin investing enabled to short.` |
| Whole shares | (fractional shorts are not supported) |
| `gfd` only | `Short sell orders must be good for day only.` |
| `regular_hours` / `extended_hours` only | `Short selling isn't available during the 24 Hour Market.` |
| Session named outside regular hours | `It's after market close. To place this short sell order, change your trading session to extended hours.` |
 `orderStock()` sets `position_effect` **only** for `sell_short`, so an ordinary buy/sell payload from the client library is byte-identical to what it sent before. (Orders placed through the MCP tool always carry `market_hours`, because the tool requires it — matching what Robinhood's own client sends on every order.)

Order writes resolve the symbol with `resolveInstrumentBySymbol()`, an **exact** match that refuses ambiguous tickers, never `findInstruments()[0]` — the first hit of a fuzzy `?query=` search can be a same-prefix or relisted/OTC duplicate. `reviewEquityOrder()` uses the same resolver, so a review and the order it authorises cannot resolve to different securities.

### Trading Sessions

`market_hours` tags an order to a session: `regular_hours` (09:30–16:00 ET), `extended_hours` (pre/post-market), or `all_day_hours` (the 24 Hour Market). On the wire `extended_hours` is exactly `market_hours !== "regular_hours"`, so `orderStock()` derives the boolean from `marketHours` and throws if a caller passes both with contradictory values.

Only limit orders execute outside regular hours — `orderStock()` rejects a market, stop, or trailing order tagged to a non-regular session before any network call (scoped to an explicit `marketHours`, so legacy `extendedHours` callers are untouched). Short sales are session-scoped: outside regular hours the API rejects them unless the session is named (`It's after market close. To place this short sell order, change your trading session to extended hours.`), so `orderStock()` always sends an explicit `market_hours` for `sell_short`. The `robinhood_place_stock_order` MCP tool makes `market_hours` **required** with no default — an order tagged to the wrong session silently queues for the next open rather than executing, which is a failure that looks like success. Because a required parameter the caller has to guess is no safer than a default, `robinhood_get_market_hours` ships alongside it: the agent can ask which session is live instead of inferring it from a local clock that is wrong across time zones, weekends, and holidays.

`orderOption()` does not yet expose a session and is fixed to `regular_hours`.

### Safety Model

```
┌─────────────┬──────────────────────────────────────────┐
│   Tier      │  Operations                              │
├─────────────┼──────────────────────────────────────────┤
│  Allowed    │  All read operations (quotes, positions, │
│             │  orders, historicals, news, options)      │
├─────────────┼──────────────────────────────────────────┤
│  Guarded    │  Order placement -- requires explicit    │
│             │  parameters, no dangerous defaults.      │
│             │  Claude must confirm with user first.    │
├─────────────┼──────────────────────────────────────────┤
│  Blocked    │  Fund transfers, bank operations,        │
│             │  bulk cancel (cancelAll*)                 │
│             │  These functions do not exist in client. │
└─────────────┴──────────────────────────────────────────┘
```

## Key Design Decisions

| Decision | Why |
|---|---|
| **TokenStore adapters** | Pluggable token storage. KeychainTokenStore for desktop, EncryptedFileTokenStore for Docker/headless. Client never hard-codes a storage strategy. |
| **Direct Bearer auth** | Session injects `Authorization: Bearer` directly on every request. No proxy, no URL rewriting, no shared secret. Simpler, fewer moving parts. |
| **Proactive + reactive refresh** | `ensureFreshToken` renews 24h ahead of `expires_at` before each request; `onUnauthorized` refreshes and retries once on a 401 as a fallback. Concurrent 401s coalesce into a single refresh. Proactive is required because refresh tokens are single-use and an idle process would otherwise let the chain lapse. |
| **`adoptFromStore` over hard failure** | A rejected refresh re-reads the TokenStore before giving up — another process may have already rotated and persisted a working token. Narrows the multi-process race; there is no cross-process lock, so it does not eliminate it. |
| **Const URL builders** | `API_BASE`, `NUMMUS_BASE`, `BONFIRE_BASE`, and `DORA_BASE` are `const` -- no mutable state, no `configureProxy()`. All URLs point to Robinhood directly. |
| **Bun + native fetch** | Zero deps for HTTP, native TS execution, fast startup |
| **Class-based over module globals** | Instance-scoped session prevents shared mutable state. Testable. |
| **Bun.secrets for keychain** | Tokens stored directly in OS keychain -- no files on disk, no custom encryption layer. Zero deps. |
| **EncryptedFileTokenStore for Docker** | AES-256-GCM encrypted file with key in env var or keychain. No need for an auth proxy sidecar. |
| **No phoenix.robinhood.com** | TLS handshake fails. `api.robinhood.com` has equivalent data. |
| **Unified order methods** | `orderStock()` with optional params vs 10 separate `orderBuyMarket()` etc. |
| **`market_hours` required on the MCP tool, optional on the client** | The MCP tool is the agent-facing surface, where a defaulted session is a silent failure mode: an order tagged `regular_hours` after the close queues for the next open instead of executing, and looks placed. Requiring it also makes a stale caller that passes only the old `extended_hours` fail loudly on a missing parameter. The client library keeps `extendedHours` working so programmatic callers are not broken. |
| **Vitest over bun test** | Proper module isolation via worker processes. Critical for mocking. |
| **Zod schemas** | Type API response shapes for TS consumers -- the client casts rather than `.parse()`s, so zero runtime overhead (caveat: an under-declared schema silently hides real response fields from the TS types without erroring). Opt-in `parseOne`/`parseArray` helpers in `src/client/http.ts` runtime-validate when a caller wants it. MCP tool-call parameters, by contrast, ARE runtime-validated via the same library. |
| **ESM-only** | Bun is ESM-native, no CJS compatibility needed. |
