# Access Controls

## Risk Levels

The **Skill** column references domain files of the unified `robinhood-for-agents` skill (e.g. `portfolio.md`, `trade.md` under `skills/robinhood-for-agents/`).

### Low Risk (Read Operations)
All data retrieval operations. No financial impact.

| Operation | MCP Tool | Skill |
|-----------|----------|-------|
| Portfolio/Holdings | `robinhood_get_portfolio` | `portfolio.md` |
| Account/Profile | `robinhood_get_account` | - |
| Stock Quotes/Data | `robinhood_get_stock_quote` | `research.md` |
| Historical Data | `robinhood_get_historicals` | `research.md` |
| News/Ratings | `robinhood_get_news` | `research.md` |
| Options Data | `robinhood_get_options` | `options.md` |
| Crypto Data | `robinhood_get_crypto` | - |
| Market Movers | `robinhood_get_movers` | - |
| Search | `robinhood_search` | - |
| Order History | `robinhood_get_orders` | - |
| Order Status | `robinhood_get_order_status` | - |
| Session Check | `robinhood_check_session` | - |
| Dividends/Documents | - | via code |
| Watchlists (read) | `robinhood_get_watchlists`, `robinhood_get_watchlist_items`, `robinhood_get_popular_watchlists`, `robinhood_get_option_watchlist` | via skill |
| Scanners (read) | `robinhood_get_scans`, `robinhood_get_scanner_filter_specs` | via skill |
| Realized P&L (read, computed) | `robinhood_get_realized_pnl`, `robinhood_get_pnl_trade_history` | via skill |
| Tax Lots (read) | `robinhood_get_equity_tax_lots` | via skill |
| Order Review (read, simulation) | `robinhood_review_equity_order`, `robinhood_review_option_order` | `trade.md` |

### Medium Risk
Operations with limited financial impact or credential exposure. Includes **reversible, non-financial writes** (watchlist mutations): confirm-before-calling, single-target/single-operation, no order surface.

| Operation | MCP Tool | Skill |
|-----------|----------|-------|
| Authentication | `robinhood_browser_login` | `setup.md` |
| Cancel Single Order | `robinhood_cancel_order` | `trade.md` |
| Watchlist Add/Remove | `robinhood_add_to_watchlist`, `robinhood_remove_from_watchlist` | via skill |
| Watchlist Create/Update | `robinhood_create_watchlist`, `robinhood_update_watchlist` | via skill |
| Watchlist Follow/Unfollow | `robinhood_follow_watchlist`, `robinhood_unfollow_watchlist` | via skill |
| Options Watchlist Add/Remove | `robinhood_add_option_to_watchlist`, `robinhood_remove_option_from_watchlist` | via skill |

### High Risk (Write Operations)
Order placement. Requires explicit parameters — no dangerous defaults.

| Operation | MCP Tool | Skill |
|-----------|----------|-------|
| Stock Orders | `robinhood_place_stock_order` | `trade.md` |
| Option Orders | `robinhood_place_option_order` | `trade.md` |
| Crypto Orders | `robinhood_place_crypto_order` | `trade.md` |

### Blocked (Critical Risk)
These operations are **never exposed** through MCP tools or skills.

| Operation | Rationale |
|-----------|-----------|
| Fund Transfers (`withdrawl_funds_to_bank_account`) | Irreversible financial impact |
| Deposits (`deposit_funds_to_robinhood_account`) | Irreversible financial impact |
| Bank Unlinking | Could lock user out of transfers |
| Bulk Cancel (`cancel_all_stock_orders`, etc.) | Too destructive without per-order review |

## Safety Measures

### MCP Tools
- Order tools require all parameters explicitly (symbol, side, quantity, type)
- No default values that could cause accidental trades
- Blocked operations return error messages explaining why

### Skills
- Trade skill always shows order preview and waits for user confirmation
- Scripts display current price and estimated cost before proceeding
- Blocked operations are documented as "never use" in reference files

### General
- Access tokens last ~8.5 days and auto-refresh on 401 via the stored refresh token
- Browser-based login only — no credentials pass through the tool layer
- Session tokens stored in OS keychain via `Bun.secrets` (macOS Keychain Services) — no plaintext fallback
- See [SECURITY.md](./SECURITY.md) for the full threat model and deployment tiers
