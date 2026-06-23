# robinhood-for-agents

[![CI](https://github.com/kevin1chun/robinhood-for-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/kevin1chun/robinhood-for-agents/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/robinhood-for-agents)](https://www.npmjs.com/package/robinhood-for-agents)
[![ClawHub](https://img.shields.io/badge/ClawHub-robinhood--for--agents-blue)](https://clawhub.ai/kevin1chun/robinhood-for-agents)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Robinhood for AI agents — MCP server with 18 tools + TypeScript client library.

- **18 MCP tools** for any MCP-compatible AI agent
- **Unified trading skill** for guided workflows (Claude Code, OpenClaw, [ClawHub](https://clawhub.ai/kevin1chun/robinhood-for-agents))
- **TypeScript client library** (~50 async methods) for programmatic use
- **Pluggable token storage** — OS keychain (default) or encrypted file (Docker/headless)

Compatible with **Claude Code**, **Codex**, **OpenClaw**, and any MCP-compatible agent.

## Prerequisites

- [Bun](https://bun.sh/) v1.0+
- Google Chrome (used by `playwright-core` for browser-based login — no bundled browser)
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
robinhood-for-agents onboard --agent claude-code
robinhood-for-agents onboard --agent codex
robinhood-for-agents onboard --agent openclaw
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
claude mcp add -s user robinhood-for-agents -- bun run /path/to/bin/robinhood-for-agents.ts

# Install skills (per-project, optional)
cd your-project
robinhood-for-agents install --skills
```

Restart Claude Code to pick up the changes. Claude Code supports the unified trading skill in addition to the 18 MCP tools — see [Skill](#skill).
</details>

<details>
<summary>Codex</summary>

```bash
codex mcp add robinhood-for-agents -- bun run /path/to/bin/robinhood-for-agents.ts
```

Restart Codex to pick up the changes. Codex uses all 18 MCP tools directly.
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
      "command": "bun",
      "args": ["run", "/absolute/path/to/robinhood-for-agents/bin/robinhood-for-agents.ts"]
    }
  }
}
```
</details>

## Example

> "Buy 1 50-delta SPX call expiring tomorrow"

![SPX options chain with greeks and order summary](docs/images/spx-options-example.png)

## Authenticate

Start your agent and say "setup robinhood" (or call `robinhood_browser_login` directly). Chrome will open to the real Robinhood login page — log in with your credentials and MFA. The session is cached and auto-restores for ~24 hours.

## MCP Tools (18)

All 18 tools work with every MCP-compatible agent.

| Tool | Description |
|------|-------------|
| `robinhood_browser_login` | Authenticate via Chrome browser |
| `robinhood_check_session` | Check if cached session is valid |
| `robinhood_get_portfolio` | Portfolio: positions, P&L, equity, cash |
| `robinhood_get_accounts` | List all brokerage accounts |
| `robinhood_get_account` | Account details and profile |
| `robinhood_get_stock_quote` | Stock quotes and fundamentals |
| `robinhood_get_historicals` | OHLCV price history |
| `robinhood_get_news` | News, analyst ratings, earnings |
| `robinhood_get_movers` | Market movers and popular stocks |
| `robinhood_get_options` | Options chain with greeks |
| `robinhood_get_crypto` | Crypto quotes, history, positions |
| `robinhood_place_stock_order` | Place stock orders (market/limit/stop/trailing) |
| `robinhood_place_option_order` | Place option orders |
| `robinhood_place_crypto_order` | Place crypto orders |
| `robinhood_get_orders` | View order history |
| `robinhood_cancel_order` | Cancel an order by ID |
| `robinhood_get_order_status` | Get status of a specific order by ID |
| `robinhood_search` | Search stocks or browse categories |

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
| 18 MCP tools | Yes | Yes | — | Yes |
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

Token refresh writes re-encrypted tokens back to the file automatically.

> **Security warning:** The encrypted file protects against casual disk access (image leaks, accidental exposure) but NOT against a malicious agent with shell access in the container — it can read the env var and decrypt. Only run agents you trust. See [docs/SECURITY.md](docs/SECURITY.md) for the full threat model.

## Safety

- **Pluggable token storage** — `KeychainTokenStore` (OS keychain, default) or `EncryptedFileTokenStore` (AES-256-GCM, for Docker/headless). See [SECURITY.md](docs/SECURITY.md) for the threat model.
- Fund transfers and bank operations are **blocked** — never exposed
- Bulk cancel operations are **blocked**
- All order placements require explicit parameters (no dangerous defaults)
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
| Direct `accessToken` | Serverless, testing, short-lived scripts | Pass `accessToken` to constructor or set `ROBINHOOD_ACCESS_TOKEN` env var |

**How it works**: `restoreSession()` loads tokens from the configured `TokenStore`, injects `Authorization: Bearer` headers directly into API requests, and registers automatic token refresh on 401.

```typescript
import { RobinhoodClient, EncryptedFileTokenStore } from "robinhood-for-agents";

// Default: KeychainTokenStore
const client = new RobinhoodClient();

// Docker/headless: EncryptedFileTokenStore (auto-detected from ROBINHOOD_TOKENS_FILE env)
const client = new RobinhoodClient({ tokenStore: new EncryptedFileTokenStore() });

// Direct token (no refresh)
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
robinhood-for-agents onboard

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
