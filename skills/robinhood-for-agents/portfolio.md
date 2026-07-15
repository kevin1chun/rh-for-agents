# Portfolio — Holdings, P&L, Account Summary

### Fetch Portfolio Data

```bash
bun -e '
import { getClient } from "robinhood-for-agents";
const rh = getClient();
await rh.restoreSession();

const [holdings, accounts, crypto] = await Promise.all([
  rh.buildHoldings(),
  rh.getAccounts(),
  rh.getCryptoPositions(),
]);
console.log(JSON.stringify({ holdings, accounts, crypto }, null, 2));
'
```

### Enrich (Optional)
For crypto positions, get current prices:
```bash
bun -e '
import { getClient } from "robinhood-for-agents";
const rh = getClient();
await rh.restoreSession();
const btc = await rh.getCryptoQuote("BTC");
console.log(JSON.stringify(btc, null, 2));
'
```

## Multi-Account Support
`getAccounts()` returns all accounts. To get portfolio for a specific account:
```typescript
rh.buildHoldings({ accountNumber: "ACCT_ID" })
```

**Caveat:** for `robinhood_get_portfolio` / `getUnifiedPortfolio(accountNumber)`, only Robinhood's *default* account returns a populated `unified` snapshot — any other real, valid account_number gets `unified: null` (bonfire's unified-portfolio endpoint 404s for non-default accounts). Holdings, cash, and buying power are unaffected either way; only the bonfire-sourced parity fields (`total_equity`, `total_market_value`, `portfolio_equity`, `options_buying_power`, `uninvested_cash`, `withdrawable_cash`) are missing when scoped to a non-default account. Don't treat a `null` `unified` as a failure.

## Output Format
Present results as a formatted table:
- Account summary: account number, type, portfolio value, cash, buying power
- Per-holding: Symbol, Name, Shares, Price, Avg Cost, Equity, P&L %, Allocation %
- Separate sections for stocks and crypto
- Summary line: Total holdings value, day change

## Key Response Fields
**`holdings`** — per ticker: `price`, `quantity`, `average_buy_price`, `equity`, `percent_change`, `intraday_percent_change`, `equity_change`, `name`

**`summary`**: `equity`, `market_value`, `cash`, `buying_power`, `crypto_buying_power`, `cash_available_for_withdrawal`

For all client methods, see [client-api.md](client-api.md).
