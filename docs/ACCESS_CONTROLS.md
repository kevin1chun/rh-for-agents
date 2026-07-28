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
| Short Sales | `robinhood_place_stock_order` (`side: "sell_short"`) | `trade.md` |
| Option Orders | `robinhood_place_option_order` | `trade.md` |
| Crypto Orders | `robinhood_place_crypto_order` | `trade.md` |

Short sales sit at the top of this tier: losses are theoretically unbounded, and "sell" in a user's request almost always means *close my position*. Opening a short therefore requires its own side value (`sell_short`) rather than being inferred from an account holding no shares, so a mis-parsed "sell" fails with `Not enough shares to sell.` instead of silently opening a short. The skill requires the confirmation to be labelled **SHORT SELL**.

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
- `robinhood_place_stock_order` also requires `market_hours` with no default, since an order tagged to the wrong session silently queues for the next open instead of executing. Use `robinhood_get_market_hours` to find out which session is live rather than guessing from the local clock. (`robinhood_place_option_order` does not yet expose a session and is fixed to regular hours.)
- Risky positions are never inferred: opening a short requires `side: "sell_short"`. A plain `sell` cannot open one even partially — an over-sized sell is rejected in full (`Not enough shares to sell.`) rather than closing the held portion and shorting the rest
- Order writes resolve symbols by exact match (never a fuzzy search), so a write cannot land on a same-prefix or relisted duplicate ticker; ambiguous tickers are refused rather than guessed
- Blocked operations return error messages explaining why

### Skills
- Trade skill always shows order preview and waits for user confirmation
- Scripts display current price and estimated cost before proceeding
- Blocked operations are documented as "never use" in reference files

### General
- Access-token lifetime varies (~6–8.5 days observed). Tokens renew automatically — proactively ~24h before expiry, and on a 401 as a fallback — so a session in regular use stays alive; one left idle past the refresh-token lifetime lapses and needs a new browser login
- Browser-based login only — no credentials pass through the tool layer
- Session tokens stored in OS keychain via `Bun.secrets` (macOS Keychain Services) — no plaintext fallback
- See [SECURITY.md](./SECURITY.md) for the full threat model and deployment tiers
