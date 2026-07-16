---
name: robinhood-for-agents
description: Trade stocks, options, and crypto on Robinhood — dual mode (MCP tools or TypeScript client).
homepage: https://github.com/kevin1chun/robinhood-for-agents
allowed-tools: Bash(bun:*), Bash(bunx robinhood-for-agents:*), mcp__robinhood-for-agents__*
install:
  - kind: node
    package: robinhood-for-agents
    bins: [robinhood-for-agents]
requires:
  bins: [bun]
metadata: {"credentials":"OAuth tokens stored via TokenStore adapters: KeychainTokenStore (OS keychain, default) or EncryptedFileTokenStore (for Docker/headless). restoreSession() loads tokens and injects Bearer auth directly. Access tokens last ~8.5 days and auto-refresh on 401 via the stored refresh token, so the user stays logged in for roughly a week+ before a browser re-login is needed.","chrome":"A Chromium-based browser (Chrome, Brave, or Chromium — auto-detected on macOS, override with BROWSER_PATH) is required only for initial login (bunx robinhood-for-agents onboard). Not needed for subsequent API calls."}
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
| Watchlists / lists / "add to my list" | [watchlists.md](watchlists.md) | "my watchlists", "add NVDA to my tech list", "remove TSLA from watchlist" |
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

## Client Methods

The client exposes 70+ async methods across auth, portfolio, research, options, orders, watchlists, scanners, P&L, and tax lots.

- [client-api.md](client-api.md) — full method reference (signatures, options, examples) and the MCP↔client mapping table
- [reference.md](reference.md) — MCP tool parameters (if using MCP mode instead of the client)

## Important Notes
- **Do NOT use `phoenix.robinhood.com`** — use `api.robinhood.com` endpoints only
- Multi-account is first-class: always ask which account when multiple exist
- Session tokens (access token) last ~8.5 days; the client auto-refreshes on 401 via the stored refresh token, so re-auth is only needed roughly once a week+
