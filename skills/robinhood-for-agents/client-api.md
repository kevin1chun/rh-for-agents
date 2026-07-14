# TypeScript Client API

Methods from `robinhood-for-agents` for programmatic access without MCP.

## Quick Start

```typescript
import { RobinhoodClient, getClient } from "robinhood-for-agents";

const rh = getClient(); // singleton
await rh.restoreSession();
```

All methods are `async`. Multi-account is first-class: account-scoped methods accept `accountNumber`.

## MCP Tool → Client Method Mapping

| MCP Tool | Client Method |
|----------|--------------|
| `robinhood_check_session` | `restoreSession()` |
| `robinhood_get_account` | `getAccountProfile(accountNumber?)` |
| `robinhood_get_accounts` | `getAccounts(opts?)` |
| `robinhood_get_portfolio` | `buildHoldings(opts?)` |
| `robinhood_get_crypto` (positions) | `getCryptoPositions()` |
| `robinhood_get_crypto` (quote) | `getCryptoQuote(symbol)` |
| `robinhood_get_stock_quote` | `getQuotes(symbols)` + `getFundamentals(symbols)` |
| `robinhood_get_news` | `getNews(symbol)` + `getRatings(symbol)` + `getEarnings(symbol)` |
| `robinhood_get_historicals` | `getStockHistoricals(symbols, opts?)` |
| `robinhood_search` | `findInstruments(query)` |
| `robinhood_get_options` (chain) | `getChains(symbol, opts?)` |
| `robinhood_get_options` (instruments) | `findTradableOptions(symbol, opts?)` |
| `robinhood_get_options` (greeks) | `getOptionMarketData(symbol, expDate, strike, type)` |
| `robinhood_get_options` (index value) | `getIndexValue(symbol)` |
| `robinhood_place_stock_order` | `orderStock(symbol, side, quantity, opts?)` |
| `robinhood_place_option_order` | `orderOption(symbol, legs, price, quantity, direction, opts?)` |
| `robinhood_place_crypto_order` | `orderCrypto(symbol, side, amount, opts?)` |
| `robinhood_get_orders` (stock) | `getAllStockOrders()` / `getOpenStockOrders()` |
| `robinhood_get_orders` (option) | `getAllOptionOrders()` / `getOpenOptionOrders()` |
| `robinhood_get_orders` (crypto) | `getAllCryptoOrders()` / `getOpenCryptoOrders()` |
| `robinhood_cancel_order` | `cancelStockOrder(id)` / `cancelOptionOrder(id)` / `cancelCryptoOrder(id)` |
| `robinhood_get_order_status` | `getStockOrder(id)` / `getOptionOrder(id)` / `getCryptoOrder(id)` |

## Portfolio Methods

### `buildHoldings(opts?): Promise<Record<string, Holding>>`
```typescript
const holdings = await rh.buildHoldings({ withDividends: true });
// => { "AAPL": { price, quantity, average_buy_price, equity, percent_change, name, ... } }
```
Options: `{ accountNumber?: string; withDividends?: boolean }`

### `getAccounts(opts?): Promise<Account[]>`
```typescript
const accounts = await rh.getAccounts();
```

### `getPortfolioProfile(accountNumber?): Promise<Portfolio>`
```typescript
const portfolio = await rh.getPortfolioProfile();
// => { equity, market_value, ... }
```

### `getCryptoPositions(): Promise<CryptoPosition[]>`
### `getCryptoQuote(symbol): Promise<CryptoQuote>`
```typescript
const btc = await rh.getCryptoQuote("BTC");
// => { mark_price, ask_price, bid_price, symbol, ... }
```

## Research Methods

### `getQuotes(symbols): Promise<Quote[]>`
Accepts single symbol or array. Returns `last_trade_price`, `bid_price`, `ask_price`, `bid_size`, `ask_size`, `previous_close`, `pe_ratio`, `state` (trading status).

### `getFundamentals(symbols): Promise<Fundamental[]>`
Returns `market_cap`, `pe_ratio`, `pb_ratio`, `float`, `dividend_yield`, `high_52_weeks`, `low_52_weeks`, `description`, `ceo`, `sector`, plus a full dividend schedule (`dividend_per_share`, `ex_dividend_date`, `payable_date`, `distribution_frequency`).

### `getStockHistoricals(symbols, opts?): Promise<StockHistorical[]>`
```typescript
const hist = await rh.getStockHistoricals("AAPL", { interval: "day", span: "year", bounds: "regular" });
// => [{ symbol, historicals: [{ begins_at, open_price, close_price, high_price, low_price, volume }] }]
```

### `getNews(symbol): Promise<News[]>`
### `getRatings(symbol): Promise<Rating>`
### `getEarnings(symbol): Promise<Earnings[]>`
EPS is nested under `eps` (`eps.estimate`, `eps.actual`) — not flat top-level fields (assuming flat returns `undefined`). Also includes `report` (date/timing) and `call` (datetime, replay_url).
### `findInstruments(query): Promise<Instrument[]>`

## Options Methods

### `getChains(symbol, opts?): Promise<OptionChain>`
Works for equities and indexes (SPX, NDX, VIX, RUT, XSP). For indexes with multiple chains, pass `expirationDate` to select. Defaults to SPXW.
```typescript
const chain = await rh.getChains("AAPL");
// => { id, expiration_dates: [...], ... }
```

### `findTradableOptions(symbol, opts?): Promise<OptionInstrument[]>`
```typescript
const calls = await rh.findTradableOptions("AAPL", {
  expirationDate: "2026-04-17", strikePrice: 200, optionType: "call"
});
```

### `getOptionMarketData(symbol, expirationDate, strikePrice, optionType): Promise<OptionMarketData[]>`
```typescript
const data = await rh.getOptionMarketData("AAPL", "2026-04-17", 200, "call");
// => [{ adjusted_mark_price, delta, gamma, theta, vega, implied_volatility, open_interest, volume, ... }]
```

### `getIndexValue(symbol): Promise<IndexValue | null>`
```typescript
const spx = await rh.getIndexValue("SPX");
// => { value: "5700.00", symbol: "SPX" } or null for non-index
```

### `getOpenOptionPositions(accountNumber?): Promise<OptionPosition[]>`

## Order Methods

**Safety**: Always confirm with the user before calling any order method.

### `orderStock(symbol, side, quantity, opts)`
```typescript
await rh.orderStock("AAPL", "buy", 10, { timeInForce: "gfd" });                          // market
await rh.orderStock("AAPL", "buy", 10, { limitPrice: 150.0, timeInForce: "gfd" });       // limit
await rh.orderStock("AAPL", "sell", 10, { stopPrice: 145.0, limitPrice: 144.0, timeInForce: "gfd" }); // stop-limit
await rh.orderStock("AAPL", "sell", 10, { trailAmount: 5, trailType: "percentage", timeInForce: "gfd" }); // trailing stop
```
Options: `{ limitPrice, stopPrice, trailAmount, trailType, accountNumber, timeInForce (required), extendedHours }`

### `orderOption(symbol, legs, price, quantity, direction, opts?)`
```typescript
// Single call
await rh.orderOption("AAPL", [
  { expirationDate: "2026-04-17", strike: 200, optionType: "call", side: "buy", positionEffect: "open" }
], 3.50, 1, "debit");

// Bull call spread
await rh.orderOption("AAPL", [
  { expirationDate: "2026-04-17", strike: 200, optionType: "call", side: "buy", positionEffect: "open" },
  { expirationDate: "2026-04-17", strike: 210, optionType: "call", side: "sell", positionEffect: "open" },
], 2.50, 1, "debit");
```

### `orderCrypto(symbol, side, quantityOrPrice, opts?)`
```typescript
await rh.orderCrypto("BTC", "buy", 0.5);                           // buy 0.5 BTC
await rh.orderCrypto("BTC", "buy", 100, { amountIn: "price" });    // buy $100 of BTC
await rh.orderCrypto("BTC", "buy", 0.5, { limitPrice: 60000 });    // limit buy
```
Options: `{ amountIn?: "quantity" | "price"; limitPrice?: number; timeInForce?: string }`

### Order Queries
```typescript
const allOrders = await rh.getAllStockOrders();
const openOrders = await rh.getOpenStockOrders();
const order = await rh.getStockOrder("order-uuid");
```

### Cancel Orders
```typescript
await rh.cancelStockOrder("order-uuid");
await rh.cancelOptionOrder("order-uuid");
await rh.cancelCryptoOrder("order-uuid");
```
