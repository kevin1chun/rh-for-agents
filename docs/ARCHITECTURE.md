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
└─────────────────────────────────────────────────────────────────┘
```

`src/client/` is the TypeScript API client. `src/server/` is the MCP server that wraps it. Both talk directly to Robinhood APIs with Bearer auth -- no intermediate proxy.

## Tech Stack

| Choice | Rationale |
|--------|-----------|
| **Bun** | Native TS execution, fast startup, built-in fetch |
| **ESM-only** | Bun is ESM-native, no CJS needed |
| **@modelcontextprotocol/sdk** | Official MCP SDK, StdioServerTransport for agent compatibility |
| **Zod v3.24** | Types API response shapes (client casts, not runtime-parsed) + runtime-validates MCP tool parameters |
| **Vitest** | Fast TS-native testing, correct module isolation via `vi.mock()` |
| **Biome v2** | All-in-one lint + format, 10-25x faster than ESLint |
| **Bun.secrets** | OS keychain access (macOS Keychain Services, Linux libsecret) |
| **playwright-core** | Browser auth via system Chrome, no bundled browser (~1MB) |

## File Map

```
src/client/                    <- robinhood-for-agents client library
├── index.ts                   <- Exports: RobinhoodClient, getClient(), login()
├── client.ts                  <- RobinhoodClient class (76 async methods)
├── auth.ts                    <- Direct auth: TokenStore load, Bearer injection, 401 refresh
├── token-store.ts             <- TokenStore interface + KeychainTokenStore + EncryptedFileTokenStore
├── session.ts                 <- fetch wrapper (Bearer injection, 401 retry, redirect safety)
├── http.ts                    <- GET/POST/DELETE with pagination + trusted-origin validation
├── urls.ts                    <- Const URL builders (API_BASE, NUMMUS_BASE)
├── errors.ts                  <- Exception hierarchy
├── types.ts                   <- Zod schemas + inferred types
└── branded.ts                 <- AccountNumber, OrderId, etc. branded types

src/server/                    <- robinhood-for-agents MCP server
├── index.ts                   <- main() export, StdioServerTransport
├── server.ts                  <- McpServer creation + tool registration
├── browser-auth.ts            <- Playwright browser login capture
├── cli/
│   ├── onboard.ts            <- Interactive setup TUI (also handles Docker token export)
│   ├── install-mcp.ts        <- Install MCP server config
│   ├── install-skills.ts     <- Install Claude Code skills
│   ├── detect.ts             <- Agent detection
│   └── agents/               <- Agent-specific config generators
└── tools/
    ├── auth.ts               <- robinhood_browser_login, robinhood_check_session
    ├── portfolio.ts          <- robinhood_get_portfolio, _get_accounts, _get_account
    ├── stocks.ts             <- robinhood_get_stock_quote, _get_historicals, _get_news, _search
    ├── options.ts            <- robinhood_get_options
    ├── crypto.ts             <- robinhood_get_crypto
    ├── orders.ts             <- robinhood_place_stock_order, _option, _crypto, _cancel, _get_orders
    └── markets.ts            <- robinhood_get_movers
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
│  session.setAccessToken(tokens.access_token)                           │
│  session.onUnauthorized = refreshCallback(state)                       │
│          │                                                              │
│          ▼                                                              │
│  return { status: "logged_in", method: "keychain" | "encrypted_file" }│
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

The client constructor accepts `tokenStore` to override the default, or `accessToken` for direct token injection (no store, no refresh).

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
│  TokenData (JSON):                                                 │
│  {access_token, refresh_token, token_type, device_token, saved_at}│
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
│                    ├── session.accessToken = newToken                   │
│                    └── Retry original request with new Bearer token    │
│                    (concurrent 401s share a single refresh attempt)    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

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

## MCP Tools (18 total)

```
┌──────────────────────────────────────────────────────┐
│  MCP Tool                    Client Methods Wrapped  │
├──────────────────────────────────────────────────────┤
│  robinhood_browser_login     (Playwright browser)    │
│  robinhood_check_session     restoreSession()        │
│  robinhood_get_portfolio     buildHoldings()         │
│                              getAccountProfile()     │
│                              getPortfolioProfile()   │
│  robinhood_get_accounts      getAccounts()           │
│  robinhood_get_account       getAccountProfile()     │
│                              getUserProfile()        │
│                              getInvestmentProfile()  │
│  robinhood_get_stock_quote   getQuotes()             │
│                              getFundamentals()       │
│  robinhood_get_historicals   getStockHistoricals()   │
│  robinhood_get_news          getNews()               │
│  robinhood_search            findInstruments()       │
│  robinhood_get_options       getChains()             │
│                              findTradableOptions()   │
│                              getOptionMarketData()   │
│  robinhood_get_crypto        getCryptoQuote()        │
│                              getCryptoHistoricals()  │
│                              getCryptoPositions()    │
│  robinhood_get_orders        getAllStockOrders()      │
│                              getOpenStockOrders()    │
│                              (+ option, crypto)      │
│  robinhood_place_stock_order orderStock()            │
│  robinhood_place_option_order orderOption()          │
│  robinhood_place_crypto_order orderCrypto()          │
│  robinhood_cancel_order      cancelStockOrder()      │
│                              cancelOptionOrder()     │
│                              cancelCryptoOrder()     │
│  robinhood_get_order_status  getStockOrder()         │
│                              getOptionOrder()        │
│                              getCryptoOrder()        │
│  robinhood_get_movers        getTopMovers()          │
│                              getTopMoversSp500()     │
│                              getTop100()             │
└──────────────────────────────────────────────────────┘
```

Each tool accesses the client via `getClient()` singleton.

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
| **401 retry in session** | `onUnauthorized` callback refreshes the token and retries once. Concurrent 401s coalesce into a single refresh. |
| **Const URL builders** | `API_BASE` and `NUMMUS_BASE` are `const` -- no mutable state, no `configureProxy()`. All URLs point to Robinhood directly. |
| **Bun + native fetch** | Zero deps for HTTP, native TS execution, fast startup |
| **Class-based over module globals** | Instance-scoped session prevents shared mutable state. Testable. |
| **Bun.secrets for keychain** | Tokens stored directly in OS keychain -- no files on disk, no custom encryption layer. Zero deps. |
| **EncryptedFileTokenStore for Docker** | AES-256-GCM encrypted file with key in env var or keychain. No need for an auth proxy sidecar. |
| **No phoenix.robinhood.com** | TLS handshake fails. `api.robinhood.com` has equivalent data. |
| **Unified order methods** | `orderStock()` with optional params vs 10 separate `orderBuyMarket()` etc. |
| **Vitest over bun test** | Proper module isolation via worker processes. Critical for mocking. |
| **Zod schemas** | Type API response shapes for TS consumers -- the client casts rather than `.parse()`s, so zero runtime overhead (caveat: an under-declared schema silently hides real response fields from the TS types without erroring). Opt-in `parseOne`/`parseArray` helpers in `src/client/http.ts` runtime-validate when a caller wants it. MCP tool-call parameters, by contrast, ARE runtime-validated via the same library. |
| **ESM-only** | Bun is ESM-native, no CJS compatibility needed. |
