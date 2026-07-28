# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-07-27

`robinhood_place_stock_order` gains a required parameter and drops `extended_hours`, which breaks existing callers of that tool, so this release is a major bump. The **client library** API remains backwards-compatible: `extendedHours` still works and `marketHours` is optional there.

### Added

- **24 Hour Market / explicit trading session** — `orderStock()` gained `marketHours` (`"regular_hours" | "extended_hours" | "all_day_hours"`, exported as the `OrderMarketHours` type). `all_day_hours` is Robinhood's overnight 24 Hour Market, previously unreachable. It supersedes the legacy `extendedHours` boolean — on the wire `extended_hours` is simply `market_hours !== "regular_hours"`, so the boolean is derived from it and a contradictory pair throws instead of silently picking one.

- **`robinhood_get_market_hours` / `getMarketHours()`** — market hours for a date: whether it is a trading day, and when the regular and extended sessions open and close. Added because `robinhood_place_stock_order` now requires an explicit session: an agent needs a way to *find out* which one is live rather than inferring it from a local clock that is wrong across time zones, weekends, and holidays. Defaults to today in market time (ET), not the caller's local date. Brings the tool count to 50.
- **`examples/short-selling.ts`** — a runnable, commented walkthrough of the full flow (market-hours check → margin check → shortability check → review → short → cover). Dry-run by default; `--place` is required to submit anything, and `--session=` selects the trading session.

### Changed

- **BREAKING (MCP tool):** `robinhood_place_stock_order` replaces the optional `extended_hours` boolean (default `false`) with a **required** `market_hours` enum. There is deliberately no default: an order tagged to the wrong session silently queues for the next open instead of executing, and a caller that passes only the old `extended_hours` now fails loudly on the missing parameter rather than quietly placing a regular-hours order. The client library keeps `extendedHours` working, so programmatic callers are unaffected.

### Fixed

- **Short selling** ([#26](https://github.com/kevin1chun/robinhood-for-agents/issues/26)) — `side` now accepts `"sell_short"` in `orderStock()`, `reviewEquityOrder()`, `robinhood_place_stock_order`, and `robinhood_review_equity_order`. Robinhood models a short as its own side value paired with `position_effect: "open"`, not as a plain `sell`: a `sell` with no shares to deliver was rejected with `Not enough shares to sell.`, and either field without the other returns `This type of trade is invalid.` Both are now sent together, along with an explicit `market_hours` (short sales are session-scoped — outside regular hours the API demands the session be named, so pass `marketHours: "extended_hours"` on the client or `market_hours: "extended_hours"` on the tool). `order_form_type` is derived server-side and deliberately not sent. The client library's default payload for an ordinary `buy`/`sell` is unchanged when `marketHours` is omitted; note that the MCP tool now always sends `market_hours`, since it is required there. Shorting requires a margin-enabled account — a cash account is rejected upstream with `You need to have margin investing enabled to short.` Fractional short sales are rejected client-side. There is no separate cover side (`buy_to_cover` is not a valid choice); close a short with an ordinary `buy`, which Robinhood stamps `position_effect: "close"` itself. Verified end to end with a live open-and-cover round trip.

- **Order writes resolve symbols by exact match.** `orderStock()` used `findInstruments()[0]` — the first hit of a fuzzy `?query=` search, which can be a same-prefix or relisted/OTC duplicate ticker. It now uses `resolveInstrumentBySymbol()`, the same exact-match resolver `reviewEquityOrder()` already used, so a review and the order it authorises can no longer resolve to different securities and an ambiguous ticker is refused rather than guessed. This was pre-existing, but `sell_short` removes the `Not enough shares to sell.` backstop that made a wrong instrument survivable.
- **Non-limit orders are rejected client-side when tagged to a non-regular session.** Only limit orders execute in `extended_hours` / `all_day_hours`; market, stop, and trailing-stop orders now fail fast with the reason instead of an opaque API rejection. Scoped to an explicit `marketHours`, so a legacy `extendedHours` caller is unaffected.
- **Short-sale constraints reproduced client-side.** Live testing surfaced two the API enforces and this library did not: shorts are rejected in the 24 Hour Market (`Short selling isn't available during the 24 Hour Market.`) and must be good-for-day (`Short sell orders must be good for day only.`). Both now fail fast with the reason, and the docs no longer suggest `all_day_hours` as a valid session for a short.
- **`reviewEquityOrder()` enforces what the place step enforces** — fractional short sales and non-positive limit/stop prices are now rejected at review, instead of returning a clean-looking preview of an order that cannot be placed.

### Documentation

- **Skill-doc audit for agent readability.** Everything learned from live testing is now stated where an agent will actually read it, in all three progressive-disclosure layers. Newly documented: the order-`state` vocabulary — including `locate_completed`, the state an accepted short returns, which was previously undocumented and reads like a failure; that a filled short appears as a **negative** position quantity and is closed by buying, not selling (`portfolio.md` had no mention of shorts at all); and that Robinhood returns one rejection at a time, checking the session before the account type, so a rejection can hide another behind it. Constraint tables now say whether each rejection comes from this library or from Robinhood, and quote the message the caller will actually see.
- **`__tests__/client/doc-accuracy.test.ts`** pins the guard messages to the docs that quote them, so a reworded guard fails CI instead of silently invalidating the skill an agent is following.

- Short selling and trading sessions documented across the README (new **Placing Orders** section with side and session tables), `docs/ARCHITECTURE.md` (side resolution and session wire format, plus the rationale for the required `market_hours`), `docs/ACCESS_CONTROLS.md` (short sales in the high-risk tier), `docs/USE_CASES.md`, `docs/CONTRIBUTING.md` (examples conventions and an unbounded-risk item on the safety checklist), and all three skill layers (`SKILL.md` safety rules, `trade.md` flow, `reference.md` tool parameters, `client-api.md` method reference).
- `examples/` is now covered by `bun run check`; the pre-existing `gateway-auth` example was brought up to the same lint standard (its tests still pass, 30/30).

## [1.1.0] - 2026-07-24

### Added

- **Proactive token renewal** — `TokenData` gained an optional `expires_at` (unix seconds) and a new exported `deriveExpiresAt(accessToken, {expiresIn, issuedAt})` helper that prefers the JWT `exp` claim and falls back to `issuedAt + expires_in`. `RobinhoodSession.ensureFreshToken` is a new pre-request hook that renews the access token 24h before expiry (`REFRESH_SKEW_SEC`) instead of waiting for a 401 — refresh tokens are single-use and rotate on every grant, so it is the chain lapsing while the client is idle, not the access token expiring, that forces a browser re-login. `restoreSession()` backfills `expires_at` for entries persisted before the field existed, so existing logins get proactive renewal without re-authenticating; the field is optional purely for that back-compat.
- **Cross-process token adoption** — when a refresh POST is rejected, `adoptFromStore()` re-reads the `TokenStore` and adopts a token another process may have already persisted, rather than failing while a valid credential sits in the store. Robinhood enforces single-use refresh-token rotation with no cross-process lock available, so two clients refreshing concurrently poison the loser; this makes that recoverable, but a single writer per store is still the supported configuration.

### Changed

- **`robinhood_check_session` now probes the API** instead of reporting `logged_in` whenever tokens merely exist. Returns `logged_in` (probe succeeded), `expired` (tokens dead and unrefreshable, with re-login instructions), `unknown` (transient/network failure — deliberately not claimed as expired), or `not_authenticated`.
- **A 401 surviving the refresh retry raises `TokenExpiredError`** (existing `AuthenticationError` subclass, now actually used) telling the caller to re-authenticate with browser login, instead of a bare `APIError: HTTP 401` that gave no indication a re-login was needed.
- **Refresh-token save failures are no longer silently swallowed** — they log a `CRITICAL` message to stderr. Under enforced rotation the attempted token is already dead, so a lost save leaves the only copy of the new refresh token in memory and strands the next process start.
- Documentation corrected throughout: access-token lifetime is **variable** (~6–8.5 days observed), not a fixed ~8.5 days, and refresh is no longer described as 401-only. `docs/DOCKER.md` gains a single-writer warning and a container re-authentication runbook.

## [1.0.1] - 2026-07-16

### Fixed

- **Documentation accuracy pass** — `docs/ARCHITECTURE.md` rebuilt around the shipped surface (49 tools, was stale at 18; Zod v4; all four API hosts; complete file map); root `SECURITY.md` corrected (supported versions, ~8.5-day token lifetime, keychain-default storage); `robinhood_get_crypto` and `robinhood_get_movers` parameter docs and the `orderCrypto` signature corrected in the skill, and the MCP↔client mapping table completed; `CONTRIBUTING.md` updated to Zod v4 idioms, real test-mock paths, and the unified-skill layout; stale per-domain skill names replaced in `ACCESS_CONTROLS.md`; `SKILL.md` no longer claims Brave/Chromium/`BROWSER_PATH` support (login is Chrome-only)
- **Gateway auth example** — `docker-compose.yml` no longer builds a nonexistent root Dockerfile; the upstream `mcp` service is an explicit placeholder and `docs/GATEWAY-AUTH.md` now states the gateway needs an HTTP-reachable MCP upstream (the bundled MCP server is stdio-only)
- **Changelog** — added the missing 0.7.0/0.7.1 entries (including the 0.7.0 removal of 0.6.2's multi-browser login) and compare links for 1.0.0/0.8.0/0.7.2; corrected the 1.0.0 note that misstated browser support
- README manual setup now registers the npm package via `bunx robinhood-for-agents` (with from-source variants); Bun prerequisite corrected to v1.3+ to match `engines`

### Changed

- npm package now ships `docs/` so README links resolve in the installed tarball
- LICENSE copyright year updated to 2025-2026

### Removed

- Internal planning documents (`docs/superpowers/`, `docs/official-mcp-parity.md`) and the external-tool walkthrough section of `docs/USE_CASES.md`

## [1.0.0] - 2026-07-16

### Added

- **Equity tax lots** — `getEquityTaxLots(symbol, {accountNumber})` client method + `robinhood_get_equity_tax_lots` MCP tool (`GET /tax_lots/open/{account}/{instrument}/`, standard-token readable). Returns the open tax lots for one holding — quantity, book/tax cost basis, acquisition date, long/short-term status, `open_lot_id`. New `TaxLot` type + schema. Symbol resolved by exact match; per-lot `account_number` scrubbed (only the caller-supplied one is echoed); results are complete (no account-encoding pagination cursor is surfaced).
- **Curated-list follow/unfollow** — `robinhood_follow_watchlist` / `robinhood_unfollow_watchlist` (+ `followWatchlist`/`unfollowWatchlist` client methods). `POST`/`DELETE /discovery/lists/{list_id}/followers/{user_id}/`; the caller's own profile id is resolved internally (never a param), cached per session, and structurally redacted from any error text. Results are declarative (`{list_id, followed}`).
- **Options-watchlist contract writes** — `robinhood_add_option_to_watchlist` / `robinhood_remove_option_from_watchlist` (+ `quickAddOption`, `getOptionWatchlistContracts`, `getOptionInstrumentById` client methods). Add mints single-leg contracts via `quick_add` (deduped against current contents so it stays idempotent); remove matches by exact `strategy_code` and deletes via the midlands bulk-delete primitive. `position_type` accepts `"long"` only over this path (short-leg entries are directed to the app).

### Changed

- **`robinhood_get_option_watchlist` now returns the contracts** on the options watchlist (each with its `object_id`, derived `option_id`, and `position_type`), rather than just the list metadata — matching the official Trading MCP tool. It reads with `load_all_attributes=false` (the options list rejects the server default). Multi-leg strategies are listed with a null `option_id` and directed to the app.
- **MCP tool layer modernized** — all 49 tools migrated from the legacy `server.tool()` API to `registerTool` with human-readable `title`s, full annotation coverage (`readOnlyHint: true` on every read; explicit `destructiveHint`/`idempotentHint` on order placement, cancel, and login — previously only the Tier-2 write tools carried annotations), and structured output (`outputSchema` + `structuredContent`). Structured content passes through the same redaction as the text block (built by re-parsing the redacted JSON, so the two can never drift). Output schemas type only handler-constructed envelope keys and stay deliberately loose on API-passthrough data, so upstream schema drift can't become a runtime tool failure. New end-to-end tests run the tools through the real MCP SDK over an in-memory transport (which caught a `z.record()` top-level schema the SDK silently drops — replaced with `z.looseObject({})`).
- **Overlapping tool descriptions disambiguated** — `robinhood_get_stock_quote` vs `robinhood_get_fundamentals` and `robinhood_get_orders` vs `robinhood_get_option_orders` now each state when to prefer the other.
- **Skill + docs accuracy pass** — new client-first `watchlists.md` domain file (extracted from SKILL.md); SKILL.md slimmed by folding its method-inventory table into `client-api.md`, which also gained missing methods and dropped a documented-but-nonexistent `getOpenOptionPositions` (real methods: `getOptionPositions` / `getOptionAggregatePositions`); fixed the stale "~24h token" claim across skill files (access tokens last ~8.5 days with auto-refresh) and aligned browser-support docs with the shipped Chrome-only login (the 0.6.2 multi-browser auto-detection was removed in 0.7.0); skill `allowed-tools` now pre-approves the primary `bun` execution path; CLAUDE.md counts corrected (49 tools, 76 client methods).

## [0.8.0] - 2026-07-14

### Added

- **Short-interest API** — `getShortInterest(symbol, opts?)` client method + `robinhood_get_short_interest` MCP tool. Returns Robinhood's modeled daily short-interest series (`shares_short` and `pc_freefloat`, each with upper/lower confidence bounds) — a modeled estimate, **not** the official biweekly FINRA settlement figure. The endpoint caps each request at a 92-day window; the client transparently walks backward in ≤90-day chunks and merges them, so callers get the full available series (RH's history begins ~mid-2025) in one call. New `ShortInterest` / `ShortInterestDaily` types + schemas.
- **Fundamentals MCP tool** — `robinhood_get_fundamentals` surfaces the existing `getFundamentals()` data (float, shares outstanding, market cap, P/E, P/B, dividend schedule, 52-week range, company profile) as a standalone tool, without the live quote that `robinhood_get_stock_quote` bundles.

## [0.7.2] - 2026-07-14

### Fixed

- **Schema accuracy pass** — every Zod schema returned by a `RobinhoodClient` method was diffed against a live API response and widened to match (`FundamentalSchema`, `QuoteSchema`, `EarningsSchema`, and 14 others). Type-only change: the client casts rather than parses, so this is zero runtime behavior change (#21)

### Added

- Gateway auth example, a follow-up to `AGENT-IDENTITY.md` (#20)

### Changed

- Updated skill docs (`client-api.md`, `research.md`, `options.md`, `reference.md`, `SKILL.md`) to surface the newly-typed fields from the schema accuracy pass; corrected a stale claim in `CLAUDE.md`/`docs/ARCHITECTURE.md` that Zod runtime-validates API responses — it only types them (client casts, not parses) and separately validates MCP tool-call parameters (#22)

## [0.7.1] - 2026-06-23

### Fixed

- **Package runtime entrypoints** — `main`/`bin`/`exports` now point at built `dist/` outputs so the published npm package runs without the TypeScript sources (#16)
- Stop redacting `account_number` from tool output — it is required input for account-scoped tools in multi-account setups (#14, #18)

### Added

- `docs/AGENT-IDENTITY.md` — agent identity verification and per-tool authorization guide for multi-agent deployments (#17)

## [0.7.0] - 2026-04-01

### Changed

- **TokenStore auth architecture** — pluggable `TokenStore` adapters (`KeychainTokenStore` default, `EncryptedFileTokenStore` for Docker/headless with `ROBINHOOD_TOKENS_FILE` + `ROBINHOOD_TOKEN_KEY`), direct Bearer injection, and security hardening across the auth path (#8)
- OpenClaw onboarding installs `robinhood-for-agents` as a workspace dependency so the skill's `bun` imports resolve (#8)

### Removed

- **Multi-browser login support from 0.6.2** — Brave/Chromium auto-detection and the `BROWSER_PATH` override were removed in the auth refactor; browser login is Google Chrome only (`playwright-core` `channel: "chrome"`)

## [0.6.2] - 2026-03-13

### Added

- **Chrome-based browser support** — browser login now auto-detects Brave, Chrome, and Chromium on macOS; accepts custom `executablePath` via `BROWSER_PATH` env or `robinhood_browser_login` tool parameter (#4)
- **Claude Code GitHub Workflow** for CI (#6)

### Fixed

- Use `claude_args` instead of invalid `model` input for Opus 4.6 CLI integration
- Remove unused import and fix import ordering in token-store test

### Changed

- Browser auth refactored with shared `getAccountHint` helper in `_helpers.ts`
- Updated skill setup docs to reflect multi-browser support

## [0.6.1] - 2026-03-11

### Changed

- **Keychain-only token storage** — removed plaintext session fallback; tokens are stored exclusively in OS keychain via `Bun.secrets`

## [0.6.0] - 2026-03-11

### Changed

- **Unified skill** — merged 5 separate skills (setup, portfolio, research, trade, options) into one dual-mode skill with three-layer progressive disclosure (SKILL.md → reference.md → client-api.md)

## [0.5.2] - 2026-03-11

### Fixed

- Option chain ID parameter handling

## [0.5.0] - 2026-03-10

### Changed

- **Renamed package** from `rh-for-agents` to `robinhood-for-agents`
- Updated README with auth flow diagrams and security documentation

## [0.4.0] - 2026-03-10

### Added

- **Multi-leg option spreads** — unified `orderOption()` method and `robinhood_place_option_order` MCP tool now support single-leg and multi-leg orders (verticals, iron condors, straddles, butterflies) via a `legs` array
- **Stop-limit option orders** — new `stop_price` parameter triggers stop-limit behavior on option orders
- **Fractional share guardrails** — fractional stock orders auto-enforce `gfd` time-in-force and reject non-market order types with clear error messages
- **Idempotent orders** — all order types (stock, option, crypto) now include `ref_id` (UUID) for idempotency, matching Robinhood's expected payload format

### Fixed

- **Option order 500 errors** — added missing `ref_id` and `override_dtbp_checks` fields to option order payload; changed default `time_in_force` from `gtc` to `gfd`
- **Crypto dollar-amount + limit price conflict** — when using `amountIn: "price"` with `limitPrice`, the client now correctly derives quantity instead of sending conflicting `price` fields

### Changed

- **Unified option order API** — merged separate single-leg and spread methods into one `orderOption(symbol, legs, price, quantity, direction, opts?)` signature; `direction` is now required
- **Token storage** — migrated from AES-256-GCM file encryption to OS keychain via `Bun.secrets` (zero deps, no files on disk)
- Updated all skill docs (options, trade) to reflect new legs-based option order API
- `StockOrder` type now captures `trailing_peg` and `ref_id`; `OptionOrder` captures `trigger`, `stop_price`, `strategy`, `ref_id`

## [0.2.0] - 2026-03-10

### Added

- **Token refresh flow** using `refresh_token` + `device_token` with `expires_in: 734000` (~8.5 days, matching pyrh). Sessions last significantly longer before requiring browser re-login.
- Detailed encrypt/decrypt flow diagrams in `ARCHITECTURE.md`
- Authentication section in `CLAUDE.md` documenting browser auth mechanism

### Fixed

- **device_token capture** in browser login — Robinhood's frontend sends OAuth requests as JSON, not form-urlencoded. The interceptor now parses JSON first, correctly capturing `device_token`.
- **Release workflow** — added `setup-node` with `registry-url` for npm authentication

### Changed

- README prerequisites clarified: Google Chrome is required by `playwright-core` (no bundled browser)
- Removed `robin_stocks` migration context from `ARCHITECTURE.md`
- Removed OpenClaw MCP bridge references from README

## [0.1.0] - 2026-03-10

### Added

- **MCP Server** with 18 structured tools for any MCP-compatible AI agent
- **Standalone client library** (`robinhood-for-agents`) with ~50 async methods
- **5 Claude Code skills**: setup, portfolio, research, trade, options
- Browser-based authentication via Playwright (Chrome)
- AES-256-GCM encrypted session storage with OS keychain key management
- Multi-account support (first-class across all account-scoped methods)
- Interactive onboarding TUI (`robinhood-for-agents onboard`)
- One-command install for Claude Code (`robinhood-for-agents install`)
- Safety controls: blocked fund transfers, blocked bulk cancels, explicit order parameters
- Support for Claude Code, Codex, and OpenClaw agents

[1.1.0]: https://github.com/kevin1chun/robinhood-for-agents/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/kevin1chun/robinhood-for-agents/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/kevin1chun/robinhood-for-agents/compare/v0.8.0...v1.0.0
[0.8.0]: https://github.com/kevin1chun/robinhood-for-agents/compare/v0.7.2...v0.8.0
[0.7.2]: https://github.com/kevin1chun/robinhood-for-agents/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/kevin1chun/robinhood-for-agents/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/kevin1chun/robinhood-for-agents/compare/v0.6.2...v0.7.0
[0.6.2]: https://github.com/kevin1chun/robinhood-for-agents/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/kevin1chun/robinhood-for-agents/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/kevin1chun/robinhood-for-agents/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/kevin1chun/robinhood-for-agents/compare/v0.5.0...v0.5.2
[0.5.0]: https://github.com/kevin1chun/robinhood-for-agents/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/kevin1chun/robinhood-for-agents/compare/v0.2.0...v0.4.0
[0.2.0]: https://github.com/kevin1chun/robinhood-for-agents/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/kevin1chun/robinhood-for-agents/releases/tag/v0.1.0
