# MCP Tools Reference

## Auth

### robinhood_check_session
Check if a Robinhood session is active.

**Parameters:** none

**Response:** `{ "status": "logged_in" | "not_authenticated" }`

### robinhood_browser_login
Open Chrome for browser-based Robinhood login. Captures OAuth tokens automatically.

**Parameters:** none

### robinhood_get_account
Get account details, profile, and investment preferences.

**Parameters:**
- `info_type` (enum: "all", "account", "user", "investment", default: "all")

**Response:**
```json
{
  "account": { "account_number": "123", "buying_power": "2000.00" },
  "user": { "username": "user@email.com", "first_name": "John" },
  "investment": { "risk_tolerance": "moderate" }
}
```

## Account & Portfolio

### robinhood_get_accounts
Get all brokerage accounts (multi-account support).

**Parameters:** none

**Response:**
```json
{
  "accounts": [{ "account_number": "123", "type": "cash", "cash": "1000.00", "buying_power": "2000.00" }]
}
```

### robinhood_get_portfolio
Get complete portfolio: positions with P&L, equity, buying power, cash.

**Parameters:**
- `account_number` (string, optional) — specific account
- `with_dividends` (boolean, default: false) — include dividend info

**Response:**
```json
{
  "holdings": {
    "AAPL": {
      "price": "150.00", "quantity": "10", "average_buy_price": "120.00",
      "equity": "1500.00", "percent_change": "25.0", "name": "Apple"
    }
  },
  "summary": {
    "equity": "15000.00", "market_value": "14000.00", "cash": "1000.00",
    "buying_power": "2000.00", "crypto_buying_power": "500.00"
  }
}
```

## Crypto

### robinhood_get_crypto
Get crypto positions or a quote.

**Parameters:**
- `info_type` (enum: "positions", "quote", default: "positions")
- `symbol` (string, required when `info_type: "quote"`)

## Research

### robinhood_get_stock_quote
Get quote and fundamentals. Also works for index symbols (SPX, NDX, VIX, RUT, XSP).

**Parameters:**
- `symbols` (string, required) — comma-separated, e.g. "AAPL" or "AAPL,MSFT"

**Response:**
```json
{
  "AAPL": {
    "quote": { "last_trade_price": "150.00", "bid_price": "149.90", "ask_price": "150.10", "previous_close": "148.00", "pe_ratio": "25.5" },
    "fundamentals": { "market_cap": "2500000000000", "pb_ratio": "45.20", "dividend_yield": "0.55", "high_52_weeks": "180.00", "low_52_weeks": "120.00" }
  }
}
```

### robinhood_get_fundamentals
Get company fundamentals (no live quote). Use `robinhood_get_stock_quote` if you also need the current price.

**Parameters:**
- `symbols` (string, required) — comma-separated, e.g. "AAPL" or "AAPL,MSFT"

**Response:** keyed by symbol; each value is the fundamentals object (`float`, `shares_outstanding`, `market_cap`, `pe_ratio`, `pb_ratio`, dividend schedule, `high_52_weeks`/`low_52_weeks`, `sector`, `industry`, `ceo`, `description`).

### robinhood_get_short_interest
Robinhood's **modeled daily** short-interest series — NOT the official biweekly FINRA figure. Each day has a point estimate plus upper/lower confidence bounds. History begins ~mid-2025; the client auto-pages the endpoint's 92-day window limit.

**Parameters:**
- `symbol` (string, required)
- `start_date` (string, optional, YYYY-MM-DD) — narrows the series; omit for full history

**Response:**
```json
{
  "symbol": "AAPL",
  "short_interest": {
    "symbol": "AAPL",
    "instrument_id": "...",
    "daily_data": [
      { "date": "2026-07-13", "shares_short": "141171395.64", "shares_upper_bound": "148709498.66", "shares_lower_bound": "133393566.55", "pc_freefloat": "0.9628" }
    ]
  }
}
```
`pc_freefloat` is a percent (e.g. `0.9628` = 0.9628% of free float).

### robinhood_get_news
Get news, analyst ratings, and earnings.

**Parameters:**
- `symbol` (string, required)

**Response:**
```json
{
  "news": [{ "title": "...", "source": "...", "published_at": "...", "url": "..." }],
  "ratings": { "summary": { "num_buy_ratings": 20, "num_hold_ratings": 5, "num_sell_ratings": 2 } },
  "earnings": [{ "year": 2025, "quarter": 1, "eps": { "estimate": "1.50", "actual": "1.55" } }]
}
```

### robinhood_get_historicals
Get OHLCV price history.

**Parameters:**
- `symbols` (string, required) — comma-separated
- `interval` (enum: "5minute", "10minute", "hour", "day", "week", default: "day")
- `span` (enum: "day", "week", "month", "3month", "year", "5year", default: "month")
- `bounds` (enum: "regular", "extended", "trading", default: "regular")

### robinhood_search
Search stocks by keyword or browse by market category.

**Parameters:**
- `query` (string, required) — search keyword (ignored if tag provided)
- `tag` (string, optional) — e.g., "technology", "most-popular-under-25"

## Options

### robinhood_get_options
Get options chain with greeks for a stock or index symbol.

**Parameters:**
- `symbol` (string, required) — stock or index ticker
- `expiration_date` (string, optional) — "YYYY-MM-DD"
- `strike_price` (number, optional) — filter by strike
- `option_type` (enum: "call", "put", optional)
- `max_strikes` (number, optional) — limit to N strikes nearest ATM

**Response (equity):**
```json
{
  "chain_info": { "id": "chain-uuid", "symbol": "AAPL", "expiration_dates": ["2025-01-17", "2025-02-21"] },
  "options": [{ "id": "option-uuid", "type": "call", "strike_price": "150.0000", "expiration_date": "2025-01-17" }],
  "market_data": [{ "adjusted_mark_price": "3.50", "delta": "0.5500", "gamma": "0.0300", "theta": "-0.0500", "vega": "0.2000", "implied_volatility": "0.3000", "open_interest": 15000, "volume": 5000 }]
}
```

**Response (index — additional field):**
```json
{ "index_value": { "value": "5700.00", "symbol": "SPX" }, "chain_info": { "symbol": "SPXW" }, "options": [...] }
```

**Notes:**
- `market_data` only included when all three filters (`expiration_date`, `strike_price`, `option_type`) are set.
- `index_value` only for index symbols.
- Chain auto-selected by `expiration_date`. SPXW (daily, PM-settled) is default; SPX monthly (AM-settled) for monthly-only dates.

## Orders

### robinhood_place_stock_order
**Parameters:**
- `symbol` (string, required), `side` ("buy"/"sell"), `quantity` (number, supports fractional)
- `limit_price` (number, optional), `stop_price` (number, optional)
- `trail_amount` (number, optional), `trail_type` ("percentage"/"amount", default: "percentage")
- `account_number` (string, required), `time_in_force` ("gtc"/"gfd", **required**), `extended_hours` (boolean)

### robinhood_place_option_order
**Parameters:**
- `symbol` (string, required), `legs` (array of `{ expiration_date, strike, option_type, side, position_effect, ratio_quantity }`)
- `price` (number, required), `quantity` (number), `direction` ("debit"/"credit")
- `stop_price` (number, optional), `time_in_force` ("gtc"/"gfd"/"ioc"/"opg", **required**)
- `account_number` (string, required)

### robinhood_place_crypto_order
**Parameters:**
- `symbol` (string, required), `side` ("buy"/"sell")
- `amount_or_quantity` (number), `amount_in` ("quantity"/"price", default: "quantity")
- `order_type` ("market"/"limit", **required**), `limit_price` (number, optional)

### robinhood_get_orders
**Parameters:**
- `order_type` ("stock"/"option"/"crypto", default: "stock")
- `status` ("open"/"all", default: "all")
- `account_number` (string, optional), `limit` (number, default: 50)

### robinhood_cancel_order
**Parameters:**
- `order_id` (string, required), `order_type` ("stock"/"option"/"crypto", default: "stock")

### robinhood_get_order_status
**Parameters:**
- `order_id` (string, required), `order_type` ("stock"/"option"/"crypto", default: "stock")

## Markets

### robinhood_get_movers
Get top movers by category.

**Parameters:**
- `direction` (enum: "up", "down", optional)
