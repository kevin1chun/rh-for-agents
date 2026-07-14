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
| `getCryptoPositions()` | Crypto | Crypto holdings |
| `getCryptoQuote(symbol)` | Crypto | Current crypto price |
| `getQuotes(symbols)` | Research | Stock quotes (price, bid/ask, P/E) |
| `getFundamentals(symbols)` | Research | Market cap, valuation, dividends, 52-week range, sector |
| `getNews(symbol)` | Research | Recent news articles |
| `getRatings(symbol)` | Research | Analyst buy/hold/sell ratings |
| `getEarnings(symbol)` | Research | Quarterly EPS history |
| `getStockHistoricals(symbols, opts?)` | Research | OHLCV price history |
| `findInstruments(query)` | Research | Search stocks by keyword |
| `getChains(symbol)` | Options | Option chain expirations |
| `findTradableOptions(symbol, opts?)` | Options | Option instruments by expiration/strike/type |
| `getOptionMarketData(symbol, exp, strike, type)` | Options | Greeks and pricing |
| `getIndexValue(symbol)` | Options | Current index value (SPX, NDX, etc.) |
| `getMovers()` | Markets | Top market movers |
| `orderStock(symbol, side, qty, opts?)` | Trading | Place stock order |
| `orderOption(symbol, legs, price, qty, dir, opts?)` | Trading | Place option order |
| `orderCrypto(symbol, side, amount, opts?)` | Trading | Place crypto order |
| `getAllStockOrders()` / `getOpenStockOrders()` | Trading | View stock orders |
| `cancelStockOrder(id)` | Trading | Cancel stock order |
| `getStockOrder(id)` | Trading | Check order fill status |

## Important Notes
- **Do NOT use `phoenix.robinhood.com`** — use `api.robinhood.com` endpoints only
- Multi-account is first-class: always ask which account when multiple exist
- Session tokens expire ~24h; the client auto-refreshes before requiring re-auth
