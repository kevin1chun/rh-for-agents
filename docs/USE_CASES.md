# Use Cases

## Interactive (Skills via Claude Code)

### Morning Portfolio Check
**User**: "How's my portfolio doing?"
**Claude**: Writes script calling `buildHoldings()`, computes daily P&L, formats table.
**Output**: "Portfolio: $45,230 (+1.2% today). Top gainer: NVDA +3.4%. Top loser: META -1.1%."

### Stock Research Before Buying
**User**: "Research PLTR before I decide to buy"
**Claude**: Writes script pulling fundamentals, news, ratings, earnings, 1-year price history. Computes 52-week range position, PE context. Outputs structured research report.

### Options Screening
**User**: "Find covered call opportunities on my holdings"
**Claude**: Gets holdings, fetches options chains for each, filters OTM calls 30-45 DTE, calculates annualized premium yield, sorts by yield.

### Dividend Income Tracking
**User**: "Show me my dividend history"
**Claude**: Writes script calling `buildHoldings({ withDividends: true })`, groups dividends by instrument, calculates totals by quarter.

### Order Management
**User**: "Cancel my open TSLA order"
**Claude**: Gets open orders, finds TSLA, confirms with user, cancels.

### Opening a Short
**User**: "Short 10 shares of SPY"
**Claude**: Confirms the account is margin-enabled and the symbol is shortable, reviews a `sell_short` limit order, shows the preview labelled **SHORT SELL** with the session named, and places only after an explicit yes. Covering later is an ordinary `buy`.

## Programmatic (MCP via External Agents)

### Automated Rebalancing
1. Agent calls `robinhood_get_portfolio()` → gets current allocation
2. Compares to target allocation
3. Calls `robinhood_get_stock_quote()` for current prices
4. Determines trades needed
5. Calls `robinhood_place_stock_order()` for each trade

### Multi-Agent Trading System
1. **Research agent** calls MCP tools to gather market data
2. Passes analysis to **decision agent**
3. Decision agent calls MCP order tools
4. **Monitoring agent** polls open orders via MCP

### Price Alert System
1. Agent periodically calls `robinhood_get_stock_quote()` for watchlist
2. Compares to threshold prices
3. Triggers notifications or orders when conditions met

### Portfolio Reporting
1. Agent calls `robinhood_get_portfolio()` daily
2. Stores snapshots for historical tracking
3. Generates performance reports with trends
