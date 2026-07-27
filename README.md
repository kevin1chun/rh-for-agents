# robinhood-for-agents

[![CI](https://github.com/kevin1chun/robinhood-for-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/kevin1chun/robinhood-for-agents/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/robinhood-for-agents)](https://www.npmjs.com/package/robinhood-for-agents)
[![ClawHub](https://img.shields.io/badge/ClawHub-robinhood--for--agents-blue)](https://clawhub.ai/kevin1chun/robinhood-for-agents)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Robinhood for AI agents — MCP server with 50 tools + TypeScript client library.

- **50 MCP tools** for any MCP-compatible AI agent
- **Unified trading skill** for guided workflows (Claude Code, OpenClaw, [ClawHub](https://clawhub.ai/kevin1chun/robinhood-for-agents))
- **TypeScript client library** (70+ async methods) for programmatic use
- **Pluggable token storage** — OS keychain (default) or encrypted file (Docker/headless)
- **Self-renewing sessions** — tokens refresh ahead of expiry and on 401, so continuous use never needs a re-login

Compatible with **Claude Code**, **Codex**, **OpenClaw**, and any MCP-compatible agent.

## Prerequisites

- [Bun](https://bun.sh/) v1.3+
- Google Chrome for login (driven by `playwright-core` via `channel: "chrome"`, no bundled browser). Chrome must be installed — there's no Brave/Chromium fallback or `BROWSER_PATH` override yet.
- A Robinhood account

## Quick Start

### Guided setup (recommended)

```bash
# Requires Bun runtime — see Prerequisites
npx robinhood-for-agents onboard
```

The interactive setup detects your agent, registers the MCP server, installs skills (where supported), and walks you through Robinhood login. It handles both local and Docker deployments — just pick "This machine" or "Docker container / remote host" when prompted.

You can also specify your agent directly:

```bash
npx robinhood-for-agents onboard --agent claude-code
npx robinhood-for-agents onboard --agent codex
npx robinhood-for-agents onboard --agent openclaw
```

### From source

```bash
git clone https://github.com/kevin1chun/robinhood-for-agents.git
cd robinhood-for-agents
bun install
bun run onboard
```

### Manual setup

<details>
<summary>Claude Code</summary>

```bash
# Register MCP server (global — available in all projects)
claude mcp add -s user robinhood-for-agents -- bunx robinhood-for-agents

# Install skills (per-project, optional)
cd your-project
npx robinhood-for-agents install --skills
```

From a source checkout, register the server as `claude mcp add -s user robinhood-for-agents -- bun run /path/to/checkout/bin/robinhood-for-agents.ts` instead.

Restart Claude Code to pick up the changes. Claude Code supports the unified trading skill in addition to the 50 MCP tools — see [Skill](#skill).
</details>

<details>
<summary>Codex</summary>

```bash
codex mcp add robinhood-for-agents -- bunx robinhood-for-agents
```

From a source checkout, use `-- bun run /path/to/checkout/bin/robinhood-for-agents.ts` instead.

Restart Codex to pick up the changes. Codex uses all 50 MCP tools directly.
</details>

<details>
<summary>OpenClaw</summary>

**Via ClawHub (recommended):**
```bash
clawhub install robinhood-for-agents
```

**Via onboard CLI:**
```bash
robinhood-for-agents onboard --agent openclaw
```

Both install the unified `robinhood-for-agents` skill to `~/.openclaw/workspace/skills/`. No MCP server required — the skill uses the TypeScript client API directly via `bun`.

</details>

<details>
<summary>Other MCP clients (Claude Desktop, etc.)</summary>

Add to your MCP client's config (e.g. `~/Library/Application Support/Claude/claude_desktop_config.json` for Claude Desktop):

```json
{
  "mcpServers": {
    "robinhood-for-agents": {
      "command": "bunx",
      "args": ["robinhood-for-agents"]
    }
  }
}
```

From a source checkout, use `"command": "bun", "args": ["run", "/absolute/path/to/checkout/bin/robinhood-for-agents.ts"]` instead.
</details>

## Example

> "Buy 1 50-delta SPX call expiring tomorrow"

![SPX options chain with greeks and order summary](docs/images/spx-options-example.png)

## Authenticate

Start your agent and say "setup robinhood" (or call `robinhood_browser_login` directly). Your browser will open to the real Robinhood login page — log in with your credentials and MFA. The session is cached in your OS keychain and renews itself: the client refreshes the token a day before it expires, and again on any 401. Regular use keeps you logged in indefinitely — a browser re-login is only needed if the client sits unused long enough for the refresh chain to lapse. Ask your agent to run `robinhood_check_session` if you're unsure.

## MCP Tools (50)

All 50 tools work with every MCP-compatible agent.

| Tool | Description |
|------|-------------|
| `robinhood_browser_login` | Authenticate via Chrome browser |
| `robinhood_check_session` | Probe the cached session: `logged_in` / `expired` / `unknown` / `not_authenticated` |
| `robinhood_get_portfolio` | Portfolio: positions, P&L, equity, cash, buying power |
| `robinhood_get_equity_positions` | Raw equity positions (shares, avg price) |
| `robinhood_get_equity_tax_lots` | Open tax lots for one equity holding (cost basis, term, open date) |
| `robinhood_get_accounts` | List all brokerage accounts |
| `robinhood_get_account` | Account details and profile |
| `robinhood_get_stock_quote` | Stock quotes and fundamentals |
| `robinhood_get_fundamentals` | Fundamentals: float, shares outstanding, valuation, profile |
| `robinhood_get_short_interest` | Daily short-interest estimate (% of float, with bounds) |
| `robinhood_get_historicals` | OHLCV price history |
| `robinhood_get_equity_price_book` | Level-2 price book (bid/ask depth) |
| `robinhood_get_equity_tradability` | Tradability flags (fractional, short-selling, per-account) |
| `robinhood_get_earnings_results` | Earnings for a symbol (EPS estimate vs. actual) |
| `robinhood_get_earnings_calendar` | Market-wide earnings calendar for a day window |
| `robinhood_get_news` | News, analyst ratings, earnings |
| `robinhood_get_movers` | Market movers and popular stocks |
| `robinhood_get_market_hours` | Market hours for a date: is it a trading day, when each session opens/closes |
| `robinhood_get_indexes` | Tradable market indexes (SPX, NDX, VIX, …) |
| `robinhood_get_index_quotes` | Current values for index symbols |
| `robinhood_get_options` | Options chain with greeks |
| `robinhood_get_option_positions` | Open option positions (per-leg or by strategy) |
| `robinhood_get_option_orders` | Option order history |
| `robinhood_get_option_historicals` | Historical OHLC for a specific option contract |
| `robinhood_get_crypto` | Crypto positions and quotes |
| `robinhood_review_equity_order` | Simulate a stock order before placing (price-collar check, live quote) |
| `robinhood_review_option_order` | Simulate an option order before placing (per-leg data, collateral) |
| `robinhood_place_stock_order` | Place stock orders (market/limit/stop/trailing, incl. `sell_short`) |
| `robinhood_place_option_order` | Place option orders |
| `robinhood_place_crypto_order` | Place crypto orders |
| `robinhood_get_orders` | View order history |
| `robinhood_cancel_order` | Cancel an order by ID |
| `robinhood_get_order_status` | Get status of a specific order by ID |
| `robinhood_search` | Search stocks or browse categories |
| `robinhood_get_watchlists` | List your own watchlists (with list ids) |
| `robinhood_get_watchlist_items` | Items of a watchlist (enriched with symbols) |
| `robinhood_get_popular_watchlists` | Robinhood-curated lists to follow |
| `robinhood_get_option_watchlist` | Your options watchlist — single-leg option contracts |
| `robinhood_create_watchlist` | Create a new watchlist (confirm first) |
| `robinhood_update_watchlist` | Rename / re-describe a watchlist (confirm first) |
| `robinhood_add_to_watchlist` | Add symbols / indexes / crypto to a list (confirm first) |
| `robinhood_remove_from_watchlist` | Remove items from a list (confirm first) |
| `robinhood_follow_watchlist` | Follow a Robinhood-curated list (confirm first) |
| `robinhood_unfollow_watchlist` | Unfollow a curated list (confirm first) |
| `robinhood_add_option_to_watchlist` | Add long single-leg option contracts to the options watchlist (confirm first) |
| `robinhood_remove_option_from_watchlist` | Remove single-leg option contracts from the options watchlist (confirm first) |
| `robinhood_get_scans` | List your saved scanners (screeners) |
| `robinhood_get_scanner_filter_specs` | Filter vocabulary for building scans (RSI/MACD/fundamentals/…) |
| `robinhood_get_realized_pnl` | Realized P&L over a window, bucketed (computed FIFO; equity + crypto) |
| `robinhood_get_pnl_trade_history` | Per-trade realized P&L (computed FIFO; equity + crypto) |

## Placing Orders

Every order goes through **review → confirm → place**. `robinhood_review_equity_order` simulates the order over read-only endpoints (live quote + a reproduction of Robinhood's price collar) and places nothing; show its result to the user, get an explicit confirmation, then call `robinhood_place_stock_order`.

**Side** — `buy`, `sell`, or `sell_short`:

| Intent | Side | Notes |
|---|---|---|
| Open / add to a long | `buy` | Fractional shares supported |
| Close a long | `sell` | Only sells shares you hold |
| **Open a short** | `sell_short` | Margin-enabled account, whole shares only |
| **Cover a short** | `buy` | No separate cover side exists |

`sell` closes a long position — it does **not** open a short. Selling stock the account doesn't hold is rejected by Robinhood with `Not enough shares to sell.` Use `sell_short` to open a short; a cash account is rejected with `You need to have margin investing enabled to short.` Shorting carries unlimited loss potential, so confirm the user asked to open a *short* rather than to sell a holding.

**Trading session** — `market_hours` is **required**, with no default:

| Value | Window | Executes |
|---|---|---|
| `regular_hours` | 09:30–16:00 ET | All order types |
| `extended_hours` | Pre / post-market | Limit orders only |
| `all_day_hours` | 24 Hour Market (overnight) | Limit orders only |

There's deliberately no default because an order tagged to the wrong session **silently queues for the next open instead of executing** — a failure that looks like success. A short sell placed outside regular hours is rejected unless the session says so.

See [`examples/short-selling.ts`](examples/short-selling.ts) for a runnable walkthrough, and [`skills/robinhood-for-agents/trade.md`](skills/robinhood-for-agents/trade.md) for the full order flow.

## Skill

A single unified skill (`robinhood-for-agents`) provides guided workflows for auth, portfolio, research, trading, and options. Available on [ClawHub](https://clawhub.ai/kevin1chun/robinhood-for-agents) and supported by **Claude Code** and **OpenClaw**.

```bash
# Install via ClawHub
clawhub install robinhood-for-agents
```

| Domain | Example Triggers |
|--------|-----------------|
| Setup | "setup robinhood", "connect to robinhood" |
| Portfolio | "show my portfolio", "my holdings" |
| Research | "research AAPL", "analyze TSLA" |
| Trading | "buy 10 AAPL", "sell my position" |
| Options | "show AAPL options", "SPX calls" |

**Dual-mode:** The skill works with MCP tools (Claude Code) or standalone via the TypeScript client API and `bun` (OpenClaw, any agent with shell access). No MCP server required.

The skill uses progressive disclosure — `SKILL.md` is the compact router, with domain-specific files (`portfolio.md`, `trade.md`, etc.) and a full `client-api.md` reference loaded on demand.

## Agent Compatibility

| Feature | Claude Code | Codex | OpenClaw | Other MCP |
|---------|:-----------:|:-----:|:--------:|:---------:|
| 50 MCP tools | Yes | Yes | — | Yes |
| Trading skill | Yes | — | Yes | — |
| ClawHub install | — | — | Yes | — |
| `onboard` setup | Yes | Yes | Yes | — |
| Browser auth | Yes | Yes | Yes | Yes |

## Client Library (standalone)

```typescript
import { RobinhoodClient } from "robinhood-for-agents";

const client = new RobinhoodClient();
await client.restoreSession();

const quotes = await client.getQuotes("AAPL");
const portfolio = await client.buildHoldings();
```

## Docker / Headless Deployment

When deploying in Docker, headless servers, or cloud environments where no OS keychain is available, use the `EncryptedFileTokenStore`:

### Setup

The guided setup handles Docker — pick "Docker container / remote host" when prompted:

```bash
npx robinhood-for-agents onboard
```

This will:
1. Open Chrome for Robinhood login (on the host)
2. Encrypt tokens and export to `./tokens.enc`
3. Print the encryption key and env vars to set in your container

### Manual setup

```bash
# 1. Login on the host
npx robinhood-for-agents onboard

# 2. In your container, set env vars:
export ROBINHOOD_TOKENS_FILE=/path/to/tokens.enc
export ROBINHOOD_TOKEN_KEY=<base64-key-from-step-1>
```

```yaml
# docker-compose.yml
services:
  agent:
    image: your-agent-image
    volumes:
      - ./tokens.enc:/app/tokens.enc:rw
    environment:
      ROBINHOOD_TOKENS_FILE: "/app/tokens.enc"
      ROBINHOOD_TOKEN_KEY: "${ROBINHOOD_TOKEN_KEY}"
```

Token refresh writes re-encrypted tokens back to the file automatically — keep the mount read-write. Refresh tokens are single-use: Robinhood kills the old one the instant a new one is issued, so a failed write leaves the only usable copy in memory and the container is stranded after restart. The client logs a `CRITICAL` message to stderr when a save fails — alert on it. See [docs/DOCKER.md](docs/DOCKER.md).

> **Security warning:** The encrypted file protects against casual disk access (image leaks, accidental exposure) but NOT against a malicious agent with shell access in the container — it can read the env var and decrypt. Only run agents you trust. See [docs/SECURITY.md](docs/SECURITY.md) for the full threat model.

## Safety

- **Pluggable token storage** — `KeychainTokenStore` (OS keychain, default) or `EncryptedFileTokenStore` (AES-256-GCM, for Docker/headless). See [SECURITY.md](docs/SECURITY.md) for the threat model.
- Fund transfers and bank operations are **blocked** — never exposed
- Bulk cancel operations are **blocked**
- All order placements require explicit parameters (no dangerous defaults). `robinhood_place_stock_order` additionally requires the trading session — it has no default, so an agent cannot silently tag an order to the wrong one. (In the client library, `marketHours` is optional for backwards compatibility and falls back to regular hours; pass it explicitly.)
- Opening a short requires the explicit `sell_short` side; a plain `sell` can only close a long, so a mis-parsed "sell" can never open an unbounded-risk position
- Order writes resolve the symbol by exact match, never a fuzzy search, so an order cannot land on a same-prefix or relisted duplicate ticker
- Skills always confirm with the user before placing orders
- See [ACCESS_CONTROLS.md](docs/ACCESS_CONTROLS.md) for the full risk matrix
- For multi-agent deployments, see [AGENT-IDENTITY.md](docs/AGENT-IDENTITY.md) for agent identity verification and per-tool authorization patterns

## Authentication

**Login**: Call `robinhood_browser_login` (MCP) or say "setup robinhood" (skills) to open Chrome. Log in normally with your credentials and MFA. Playwright passively intercepts the OAuth token response — it never clicks buttons or fills forms.

**Token storage** uses pluggable `TokenStore` adapters:

| Store | When to use | Config |
|---|---|---|
| `KeychainTokenStore` (default) | Local dev, macOS/Linux with desktop | Nothing — works out of the box |
| `EncryptedFileTokenStore` | Docker, headless servers, CI, cloud | Set `ROBINHOOD_TOKENS_FILE` + `ROBINHOOD_TOKEN_KEY` env vars |
| Direct `accessToken` | Serverless, testing, short-lived scripts | Pass `accessToken` to constructor or set `ROBINHOOD_ACCESS_TOKEN` env var — no refresh; expiry raises `TokenExpiredError` |

**How it works**: `restoreSession()` loads tokens from the configured `TokenStore`, injects `Authorization: Bearer` headers directly into API requests, and registers both refresh paths — a pre-request hook that renews the token 24 hours ahead of expiry, and a 401 handler that refreshes and retries once. Sessions saved before token expiry was tracked are backfilled on load, so existing keychain logins get proactive renewal without re-authenticating.

**Session lifetime**: Access-token TTL varies (~6–8.5 days observed — never assume a fixed number). Robinhood rotates refresh tokens on every use: each refresh returns a new one and instantly invalidates the old, so it is the refresh *chain*, not the access token, that keeps you logged in. Regular use keeps the chain alive; a long idle gap lets it lapse.

**When a session expires**: API calls raise `TokenExpiredError` (a subclass of `AuthenticationError`) instead of a bare `HTTP 401`, and `robinhood_check_session` probes the API and reports:

| Status | Meaning |
|---|---|
| `logged_in` | Tokens loaded and a live API probe succeeded |
| `expired` | Tokens no longer work and could not be refreshed — run `robinhood_browser_login` |
| `unknown` | Probe failed for a transient/network reason; the session may still be fine |
| `not_authenticated` | No tokens in the store — run `robinhood-for-agents onboard` |

Recovery is always the same: re-run browser login (`robinhood_browser_login`, or say "setup robinhood").

**One writer per token store**: rotation is single-use, so two processes sharing one store can poison each other — the loser refreshes with a token the winner already spent. The client recovers by re-reading the store and adopting whatever the other process persisted, but there is no cross-process lock. Point a single process at a given store where you can.

```typescript
import { RobinhoodClient, EncryptedFileTokenStore } from "robinhood-for-agents";

// Default: KeychainTokenStore
const client = new RobinhoodClient();

// Docker/headless: EncryptedFileTokenStore (auto-detected from ROBINHOOD_TOKENS_FILE env)
const client = new RobinhoodClient({ tokenStore: new EncryptedFileTokenStore() });

// Direct token (no store, no refresh — expiry surfaces as TokenExpiredError)
const client = new RobinhoodClient({ accessToken: "..." });
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full auth flow and [docs/SECURITY.md](docs/SECURITY.md) for the threat model.

## Development

```bash
bun install                    # Install deps
bun run typecheck              # tsc --noEmit
bun run check                  # Biome lint + format
npx vitest run                 # Run all tests
```

### Integration tests (verify local setup)

Integration tests hit the real Robinhood API (read-only). Use them to confirm your local dev environment is working end-to-end.

```bash
# 1. Login (opens Chrome — one-time)
npx robinhood-for-agents onboard

# 2. Run integration tests
bun run test:integration
```

These are excluded from CI and the default test commands since they require real credentials.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full system design, authentication flow, HTTP pipeline, and exception hierarchy.

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for how to add new tools, create skills, and run tests.

## Disclaimer

This project is **not affiliated with, endorsed by, or sponsored by Robinhood Markets, Inc.** "Robinhood" is a trademark of Robinhood Markets, Inc. This software interacts with Robinhood's services through publicly accessible interfaces but is an independent, third-party tool.

**USE AT YOUR OWN RISK.** This software enables AI agents to read data from and place orders on your Robinhood brokerage account. Automated and AI-assisted trading carries inherent risks, including but not limited to:

- Unintended order execution due to AI misinterpretation
- Financial losses from erroneous trades
- Stale or inaccurate market data
- Software bugs or unexpected behavior

You are solely responsible for all activity on your brokerage account, whether initiated manually or through this software. The authors and contributors assume no liability for any financial losses, damages, or other consequences arising from the use of this software. Review all AI-proposed actions before confirming, and never grant unsupervised trading authority to any automated system.

This software is provided "as is" without warranty of any kind. See [LICENSE](LICENSE) for full terms.

## License

MIT — see [LICENSE](LICENSE).
