# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.6.2]: https://github.com/kevin1chun/robinhood-for-agents/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/kevin1chun/robinhood-for-agents/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/kevin1chun/robinhood-for-agents/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/kevin1chun/robinhood-for-agents/compare/v0.5.0...v0.5.2
[0.5.0]: https://github.com/kevin1chun/robinhood-for-agents/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/kevin1chun/robinhood-for-agents/compare/v0.2.0...v0.4.0
[0.2.0]: https://github.com/kevin1chun/robinhood-for-agents/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/kevin1chun/robinhood-for-agents/releases/tag/v0.1.0
