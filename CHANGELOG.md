# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
