# Official Robinhood MCP — Parity & Reverse-Engineering Map

**Status:** research complete · **Build:** Phase 0 + 1A + 1B + 1C + 2 (realized P&L) + 3 (order review) + 4 (watchlist metadata writes) + 5 (tax lots + follow/unfollow + option-watchlist writes) **shipped & live-verified** (49 MCP tools) · **Date:** 2026-07-15 · **Method:** live MCP introspection (`robinhood-trading` connected in-session) + authenticated REST probes with a standard account token + `robinhood.com`/Legend bundle mining + HAR captures.

> **Progress:** Phase 0 (host plumbing + canary), Phase 1A (market-data reads), Phase 1B (watchlists: `get_watchlists`, `get_watchlist_items`, `get_popular_watchlists`, `get_option_watchlist`, `add_to_watchlist`, `remove_from_watchlist` — the **first non-order writes**), Phase 1C (scanner reads: `get_scans`, `get_scanner_filter_specs`), **Phase 2 realized P&L** (`get_realized_pnl`, `get_pnl_trade_history` — the **first computed tools**: equity FIFO + native crypto `gain_loss`), and **Phase 3 order review** (`review_equity_order`, `review_option_order` — the pre-trade simulation half of the review→place gate, composed from read-only preflight GETs + a live quote) are implemented, unit-tested, and **verified against the live API** by the integration suite (§8, incl. a reversible add→remove write probe, value-free P&L invariants, and a live collar-fires check). **Phase 4** adds the watchlist **metadata writes** `create_watchlist` (`POST midlands/lists/`) + `update_watchlist` (`PATCH midlands/lists/{id}/`), bodies mined from the Legend bundle and verified end-to-end by a reversible `ROBINHOOD_TEST_WRITES`-gated integration test (create→readback→rename→readback→delete→assert-absent). **Phase 5** closes most of the long tail: `get_equity_tax_lots` (`GET /tax_lots/open/{account}/{instrument}/` — a real standard-token read, live-verified against a populated lot; the earlier "no route" deferral is resolved, so the computed-estimate/tax-harm concern is moot — this is RH's own lot data, not a compute), `follow_watchlist`/`unfollow_watchlist` (`POST`/`DELETE /discovery/lists/{list_id}/followers/{user_id}/` with an empty `{}` JSON body, from a HAR), and `add_option_to_watchlist`/`remove_option_from_watchlist` (add mints via `POST /discovery/lists/items/quick_add/`; remove matches by **exact `strategy_code`** and deletes via the midlands bulk primitive) — all verified by reversible `ROBINHOOD_TEST_WRITES`-gated probes. `get_option_watchlist` now returns the **contracts** (not just metadata), matching the official tool. 49 `robinhood_*` tools shipped. **Scope calls (owner):** `get_equity_technical_indicators` is **descoped** (not offered). **Still deferred (honest, no stub):** option-watchlist **short-leg** writes (`position_type:"short"` — the `_S1` strategy_code suffix is unconfirmed, so a wrong-guess short removal would be a silent no-op; the tools accept `position_type` for parity but support `"long"` only and direct short to the app); the 4 Beacon **scanner writes** — gRPC-transcoded bodies are unprobeable (a malformed `create_scan` can half-create state with no verified reverse), hence unverifiable.

This document maps Robinhood's **official Trading MCP** (`robinhood-trading`, remote OAuth at `https://agent.robinhood.com/mcp/trading`) to the underlying `*.robinhood.com` REST API, and to `robinhood-for-agents`' current coverage. It's the reference for closing the gap on **architecture B** (reimplement over REST), not proxying the MCP.

---

## 1. Headline findings

1. **A standard, non-agentic account token reverse-engineers essentially the whole official surface.** The test account is `agentic_allowed=false`, yet every gap **read** endpoint returned `200` across all hosts.
2. **The official MCP exposes 48 live tools** (introspected this session), not the 45 its docs list. Live-only extras: `get_equity_price_book` (L2), `get_equity_tax_lots`, `get_option_historicals`, `get_scanner_filter_specs`. Documented-but-absent live: `get_option_level_upgrade_info`.
3. **The surface spans 4+ hosts.** Our `urls.ts` only knows `api` + `nummus`. Add **`bonfire.robinhood.com`**, the **`ceres/v1`** prefix on api, and (for research) **`dora.robinhood.com`**.
4. **The MCP sanitizes responses** — its tool outputs are clean DTOs with backend URLs stripped, so they give us the *response contract* to match, not the endpoint. Endpoints come from the HAR + REST probes.

---

## 1b. Decisions (locked 2026-07-14, reviewed with owner)

These steer the build and are not re-litigated below:

1. **Architecture B** — reimplement every official tool over the standard REST API. Do *not* proxy `agent.robinhood.com/mcp/trading`: its token is `client_id`-gated, writes are agentic-account-only, and it exposes no crypto/research. See §2.
2. **Strict 1:1 tool parity** — one MCP tool per official tool, mirroring official names under our `robinhood_` prefix (e.g. `get_realized_pnl` → `robinhood_get_realized_pnl`). Reads are **not** consolidated. Shipped tools are **never renamed** (that breaks configured clients + skills); where our existing name already differs (`get_equity_quotes` → `robinhood_get_stock_quote`) we keep ours and record the correspondence in §4b. Projected surface: 20 → ~53 tools.
3. **Accept non-order writes** — build watchlist + scanner mutations over REST. They bypass RH's agentic-account gating exactly as our existing order placement already does; no *new* order-placement surface is added, and CLAUDE.md safety rules stand unchanged.
4. **First-class live integration testing** — ship a read-only, PII-free suite any library user can run with their own token. This is a named deliverable, not an afterthought (see §8).

---

## 2. Transport reality — can we reuse the MCP endpoint directly?

Mechanically yes (JSON-RPC over Streamable HTTP: `initialize` → capture `Mcp-Session-Id` → `notifications/initialized` → `tools/call`), **but:**

- **You cannot reuse the token you already have.** The MCP validates the token's issuing `client_id` and rejects the standard app client:
  `POST /mcp/trading initialize → 401 "client id not allowed: <app client_id>"` — the rejected id is the standard-app `CLIENT_ID` already hardcoded in `auth.ts`.
- **The OAuth realm is the same one we already use.** Discovery (`/.well-known/oauth-authorization-server`):
  - authorization_endpoint `https://robinhood.com/oauth`
  - registration_endpoint `https://agent.robinhood.com/oauth/trading/register` (dynamic client registration)
  - token_endpoint `https://api.robinhood.com/oauth2/token/` (**identical to `auth.ts`**)
  - scope `internal`, PKCE `S256`, grants `authorization_code` + `refresh_token`
  - To reach it programmatically: DCR → PKCE consent (one-time browser) → token (~6.8-day TTL) + refresh. Proven end-to-end elsewhere; `browser-auth.ts` already intercepts `/oauth2/token`.
- **Writes are locked to the agentic account.** Only the account with `agentic_allowed=true` accepts `place_*`/`cancel_*`; other real accounts are read-only through the MCP.

**Implication:** the MCP proxy can't deliver our goal (crypto, all-real-account trading, research extras). Keep it as an *optional sanctioned order-routing backend*, not the engine.

---

## 3. Hosts

| Host | Used by us today | Carries |
|---|---|---|
| `api.robinhood.com` | ✅ | accounts, instruments, quotes, orders, options, positions, dividends, markets, midlands, **`marketdata/*`**, **`ceres/v1/*`**, **`pluto/*`**, **`discovery/*`**, **`beacon/*`** (scanners) |
| `nummus.robinhood.com` | ✅ | crypto accounts/holdings/orders/portfolios |
| **`bonfire.robinhood.com`** | ✅ | `equity_trading/orders/checks`, instrument warnings, `accounts/{acct}/unified`, `portfolio/account/{acct}/live`, instrument_buying_power, tax_info, margin, recurring (legacy `screeners/indicators/` exists here but is **not** the scanner parity source — that's Beacon on `api`) |
| **`dora.robinhood.com`** | ❌ add (research) | news feed (`feed/instrument/{id}`), similar instruments |

---

## 4. Per-tool map (all 48 official tools)

Legend — **SDK:** ✅ have · 🔶 gap · 🆕 gap+new-capability. **Verify:** `live` = probed 200 this session · `HAR` = in capture · `DTO` = MCP response shape captured · `compute` = derived, not a REST endpoint.

### Account / Portfolio / Search / P&L
| Official tool | SDK | REST endpoint | Verify |
|---|---|---|---|
| `get_accounts` | ✅ | `GET /accounts/` | live |
| `get_portfolio` | 🔶 | `GET bonfire/accounts/{account_number}/unified/` + `bonfire/portfolio/account/{account_number}/live` (we use `/portfolios/{acct}/`) | HAR, DTO |
| `get_realized_pnl` | ✅ 2 | equity: **computed FIFO from `/orders/`** (confirmed no native endpoint — `/wormhole/*` 404s, twice-probed; the app's PnL hub composes client-side); crypto: native `gain_loss` on `nummus/orders/`; **options excluded** (expirations/assignments live in the options events stream, not `/orders/`). Needs `account_number` | computed, live-verified |
| `get_pnl_trade_history` | ✅ 2 | per-trade from the same sources (equity FIFO; crypto native `gain_loss`; options excluded). Returned complete — `next_cursor` always null | computed, live-verified |
| `search` | ✅ | `GET /instruments/?query=` (also `asset_type=currency_pair`/`market_index`) | live |

DTO `get_portfolio`: `total_value, equity_value, options_value, futures_value, event_contracts_value, crypto_value, cash, pending_deposits, mutual_funds_value, fixed_income_value, currency, buying_power{buying_power, unleveraged_buying_power, display_currency}`

**Correction (live multi-account testing, post-ship):** §"multi-account: bonfire is account-scoped by path" (below) turned out to be only half true. `bonfire/portfolio/account/{acct}/live` and `/portfolios/{acct}/` genuinely accept any of the user's real account numbers. `bonfire/accounts/{acct}/unified/` does not — it 404s for every account_number except the one Robinhood treats as default, live-verified across a 4-account (cash × 3 + margin) session. `getUnifiedPortfolio()` now catches that 404 and returns `null` instead of throwing; `robinhood_get_portfolio` degrades gracefully (the six unified-sourced summary fields are omitted, everything else still populates). See `src/client/client.ts`'s `getUnifiedPortfolio` and `skills/robinhood-for-agents/{reference,client-api,portfolio}.md` for the user-facing writeup.
DTO `get_realized_pnl`: `{account_number, window, display_currency, data_points[{start_time, end_time, realized_gain, rate_of_realized_gain, number_of_trades}], total_returns, total_rate_of_return}`
DTO `get_pnl_trade_history`: `{account_number, span, trades[{symbol, side, quantity, price, realized_gain}], next_cursor}`

**Realized P&L — computed, stated honestly (Phase 2).** There is no standard-token realized-P&L REST endpoint; `robinhood-for-agents` computes it. The FIFO engine is a pure module (`src/compute/realized-pnl.ts`, golden-vector unit-tested) fed by the client (`getRealizedPnl`), and the MCP layer (`src/server/tools/pnl.ts`) windows/buckets it and carries every caveat in the result `note` (never inside the DTO objects):
- **Equity:** independent **economic FIFO including fees** matched from filled `/orders/` — *not* Robinhood's booked/tax-adjusted figure. Wash sales and non-FIFO `tax_lot_selection_type` are not modeled (the chosen lots aren't in the order object — a non-FIFO selection can only be *detected*, never reproduced); stock splits are not basis-adjusted; a sell exceeding accumulated long lots (a short, transfer-in, reward, or unadjusted split) is reported via an "basis incomplete" note rather than fabricated.
- **Crypto:** native `gain_loss` on filled `nummus/orders/` (reshaped, not recomputed).
- **Options:** **not computed** — noted explicitly, never silently omitted.
- **`rate_of_realized_gain` / `total_rate_of_return`:** returned **null** with a note — the denominator convention isn't reproducible and an invented percentage would mislead (scanner-precedent fidelity rule). `total_returns` (the well-defined sum) and `number_of_trades` are computed.
- **Validation:** synthetic golden vectors (never live-captured — that would embed real trade history) + value-free live invariants (Σ per-trade = bucket total; buckets tile the window; no NaN; overrun-detect) + a **user-run local oracle harness** (`bun run pnl:harness`) that keeps the account number off any assistant transcript. Exact-value oracle diffing against the official MCP is intentionally *not* automated: it requires the account number as a tool-call param, which must not enter a transcript.
- **futures/event** realized P&L (`ceres/v1/.../realized_pnl`) is out of scope for this equity/crypto build.

### Watchlists (migrated legacy `/watchlists/` → `/midlands/lists/` → **`/discovery/lists/`**)
| Official tool | SDK | REST endpoint | Verify |
|---|---|---|---|
| `get_watchlists` | ✅ | `GET /discovery/lists/default/` (user's own custom lists) | live ✅ |
| `get_watchlist_items` | ✅ | `GET /discovery/lists/items/?list_id=` — **enriched with symbol/name**; works for owned + curated; unknown id → 404; empty → `{results:[]}` | live ✅ |
| `get_popular_watchlists` | ✅ | `GET /discovery/lists/popular/` (paginated) | live ✅ |
| `get_option_watchlist` | ✅ 5 | the `default/` list whose `allowed_object_types ∋ option_strategy`, then `GET /discovery/lists/items/?list_id=&load_all_attributes=false` → the **single-leg contracts** (each with `object_id` + `strategy_code`). Now returns contracts, not just metadata (matches the official tool); multi-leg strategies list with a null `option_id` | live ✅ |
| `create_watchlist` / `update_watchlist` | ✅ 4 | `POST /midlands/lists/` (body = list object; server fills defaults) / `PATCH /midlands/lists/{id}/` (partial) — routes from the Legend bundle, same `midlands` service as the confirmed item-write. Reversible gated integration test verifies both. `delete` exists on the client (test cleanup) but is **not** an MCP tool (no official `delete_watchlist`). | Legend + gated test |
| `add_to_watchlist` / `remove_from_watchlist` | ✅ | `POST /midlands/lists/items/` (write) — shipped | live write-probe ✅ |
| `follow_watchlist` / `unfollow_watchlist` | ✅ 5 | `POST`/`DELETE /discovery/lists/{list_id}/followers/{user_id}/`; `user_id` = `GET /user/`.id (internal, cached, never a param). Follow needs an empty `{}` JSON body (a no-body POST 500s) → 201; unfollow → 204 | live write-probe ✅ (HAR) |
| `add_option_to_watchlist` / `remove_option_from_watchlist` | ✅ 5 (long only) | add: `POST /discovery/lists/items/quick_add/` mints one single-leg `option_strategy` per `option_id` (deduped); remove: exact `strategy_code === "{option_id}_L1"` → midlands bulk-delete by strategy `object_id`. `position_type` accepted for parity but only `"long"` supported (`_S1` short suffix unconfirmed → short directed to the app) | live write-probe ✅ (HAR) |

**Confirmed write payload** (reversible live probe, 2026-07-14): `POST /midlands/lists/items/` JSON body `{"<list_id>":[{"object_type":"instrument","object_id":"<instrument_id>","operation":"create"|"delete"}]}` → `200`, response echoes the request. The `midlands` write path still works post-`discovery` read migration. **Shipped 1B:** the body is a per-list-id *map* whose entries each carry an operation — a bulk/mixed-mutation surface — so the client's `updateWatchlistItems(listId, op, items)` builds it internally from one list + one op, making multi-list/mixed writes inexpressible (see CLAUDE.md write-tiers). **Option remove (Phase 5)** reuses this exact primitive with `object_type:"option_strategy"` and the item's minted strategy `object_id` — confirmed working on an option_strategy item.

**Items endpoint (resolved 1B):** `GET /discovery/lists/items/?list_id=` returns items **already enriched with `symbol`/`name`** (+ snapshot market-data), for both owned and curated lists — so no manual `object_id→symbol` resolution is needed. A non-existent list id → `404`; an empty list → `{results:[]}`. The `user_items` map endpoint (bare `{object_id,object_type}` refs) is therefore unused. The option-strategy list rejects the server's **default `load_all_attributes=true`** with `400` (matches the official tool's own note) — Phase 5 sends `load_all_attributes=false`, which returns the single-leg contracts, so `get_option_watchlist` now expands them.

### Market data
| Official tool | SDK | REST endpoint | Verify |
|---|---|---|---|
| `get_equity_quotes` | ✅ | `GET /marketdata/quotes/?ids=&include_bbo_source=true` (we use `/quotes/?symbols=`) | HAR |
| `get_equity_historicals` | ✅ | `GET /marketdata/historicals/{id}/?span=&interval=&bounds=` (we use `/quotes/historicals/?symbols=`) | HAR |
| `get_equity_fundamentals` | ✅ | `GET /marketdata/fundamentals/{id}/` (rich: sector/industry/ceo/employees) or `/fundamentals/?symbols=` | HAR |
| `get_earnings_results` | ✅ | `GET /marketdata/earnings/?instrument=/instruments/{id}/` (we use `?symbol=`) | HAR |
| `get_earnings_calendar` | 🔶 | `GET /marketdata/earnings/?range=Nday` (market-wide; +N forward / −N look-back; ~29 events/day) — **confirmed** | live ✅ |
| `get_indexes` | ✅ | `GET /indexes/` | live |
| `get_index_quotes` | ✅ | `GET /marketdata/indexes/values/v1/?ids=` | live |
| `get_equity_technical_indicators` | ⛔ descoped | **compute** — MCP computes from `/marketdata/historicals/` (rsi/macd/ema/bbands/vwap/atr/…); no per-symbol values endpoint. **Not offered** (owner decision, Phase 2); the recursive-seeding parity work was validated (bar-set + Wilder/EMA seeding matchable against the oracle) but is not shipped | compute, DTO |
| `get_equity_price_book` | 🆕 | `GET /marketdata/pricebook/snapshots/{id}/` (asks/bids/instrument_id/updated_at) — **confirmed** | live ✅ |
| `get_equity_tax_lots` | ✅ 5 | per-instrument open tax lots — `GET /tax_lots/open/{account}/{instrument}/?sort_type=date&sort_direction=DESC&fetch_max_abs_values=true`. Route from the robin_stocks PR #1648; **live-verified** against a populated lot (standard token → 200). A **real endpoint passthrough** (RH's own server-computed lots), so the earlier computed-estimate/tax-harm concern is moot. Symbol resolved by exact match; per-lot `account_number` scrubbed; complete results (no account-encoding cursor surfaced) | live ✅ |

DTO `get_equity_technical_indicators`: `{symbol, interval, bounds, indicators[{type, params, series[{begins_at, value}]}]}`
DTO `get_equity_price_book`: `{books[{symbol, updated_at, asks[{price,quantity}], bids[…]}], errors[]}`
DTO `get_equity_tax_lots` (14 fields, live-verified): `{account_number, symbol, tax_lots[{account_number(scrubbed), instrument_id, open_lot_id, order_id, open_tran_type, quantity, quantity_available, book_cost_basis, tax_cost_basis, book_proceeds, open_date, term, is_selectable, cost_per_share(string|null)}], next_cursor(null)}` — money fields are flat decimal strings (no currency sub-object)
DTO `get_earnings_calendar`: `{results[{symbol, year, quarter, eps{estimate, actual}, report{date, timing, verified}}]}`

### Equities (orders)
| Official tool | SDK | REST endpoint | Verify |
|---|---|---|---|
| `get_equity_positions` | ✅ | `GET /positions/` | live |
| `get_equity_orders` | ✅ | `GET /orders/` (filters: state, symbol, created_at_gte, placed_agent) | live |
| `get_equity_tradability` | ✅ | fields on `GET /instruments/` (`tradeable, tradability, rhs_tradability, account_type_tradabilities`) | live |
| `review_equity_order` | ✅ 3 | **read-only compose** — `GET /orders/order_checks/presubmit_data/?account_number=&instrument=` (collar `threshold_servars` + day-trade BP; the app's own order-preview preflight) + a live quote. The doc's earlier `POST bonfire/…/orders/checks/` was the agentic-account path; the standard, non-agentic Legend GET returns 200 and needs no agentic account. | live 200; DTO ✅ |
| `place_equity_order` | ✅ | `POST /orders/` | — |
| `cancel_equity_order` | ✅ | `POST /orders/{id}/cancel/` | — |

DTO `review_equity_order` (simulation — nothing placed): `{symbol, side, type, quantity, limit_price, order_checks{alertType, <alertType>Details{enteredPrice{amount,currency}, lastTradePrice{…}, side}}, quote_data{…full quote…}, market_data_disclosure}` — `order_checks` is `{}` when no alerts.

**Order review — composed read-only, stated honestly (Phase 3).** There is no need for the agentic order-checks POST: the app's pre-trade preview is itself built from read-only GETs a standard token can call. `review_equity_order` reproduces Robinhood's "extremely marketable / unmarketable" limit/stop **price collar** — the single highest-value check for an agent caller (it catches a fat-fingered price, e.g. a buy limit 10× the market) — from the account's live `threshold_servars` (a pure module, `src/compute/order-review.ts`, golden-vector unit-tested). Honest-fidelity guardrails: the servars are **runtime-parsed, not cast** (a silent shape change degrades an affected criterion to `not_evaluated`, never to a false "no alert"); `order_checks` is `{}` **only** when the collar actually ran (the envelope always lists `evaluated_checks` + `not_evaluated_checks`, so an empty `order_checks` is never read as a blanket clearance); the checks Robinhood computes server-side that a standard token can't reproduce (priceband, day-trade suitability, killswitches, short eligibility) are **named as not-evaluated**, never emitted; `market_data_disclosure` is **null** (Robinhood renders it MCP-side). Account identifiers read from any response body are **scrubbed** — only the caller-supplied `account_number` is echoed. `review_option_order` adds per-leg market data + the chain **collateral** requirement (account-scrubbed) with a deliberately thin, honestly-labeled check set (options have no simple last-trade collar). Both are `readOnlyHint:true` — nothing is placed. TOCTOU: the review echoes `quote_timestamp`; the skill instructs a re-review if stale before placing.

### Options
| Official tool | SDK | REST endpoint | Verify |
|---|---|---|---|
| `get_option_chains` | ✅ | `GET /options/chains/` | live |
| `get_option_instruments` | ✅ | `GET /options/instruments/` | live |
| `get_option_quotes` | ✅ | `GET /marketdata/options/{id}/` | live |
| `get_option_positions` | 🔶 | `GET /options/positions/` (+ `/options/aggregate_positions/`) | live |
| `get_option_orders` | ✅ | `GET /options/orders/` | live |
| `get_option_historicals` | 🆕 | `GET /marketdata/options/historicals/{id}/` | schema |
| `review_option_order` | ✅ 3 | **read-only compose** — `GET /options/chains/{id}/collateral/?account_number=` (collateral) + `GET /options/order_checks/presubmit_data?account_number=&chain_id=` (contract/spread thresholds) + per-leg `GET /marketdata/options/{id}/`. Account-scrubbed; thin honest check set. | live 200 |
| `place_option_order` | ✅ | `POST /options/orders/` | — |
| `cancel_option_order` | ✅ | `POST /options/orders/{id}/cancel/` | — |

### Scanners / screeners (Beacon service on `api.robinhood.com/beacon/`)
The scanner tools are **not** on `bonfire` (a Phase-0 assumption that live probing disproved). They are served by the gRPC-transcoded **Beacon** Scanner service on `api.robinhood.com/beacon/` — proven transcoded because a stray query param returns `Could not find field "x" in the type "google.protobuf.Empty"` and unknown routes 404 with `Could not resolve X to a method`.

| Official tool | SDK | REST endpoint | Verify |
|---|---|---|---|
| `get_scans` | ✅ 1C | `GET api.robinhood.com/beacon/scans/` → `{scans:[...]}` (no params) | **live 200** (empty acct) |
| `get_scanner_filter_specs` | ✅ 1C | live Beacon route **not reachable** w/ standard token → served from embedded static catalog | catalog vs official MCP |
| `run_scan` | 🔶 4 | Beacon (write) | — |
| `create_scan` | 🔶 4 | Beacon (write) | — |
| `update_scan_filters` / `update_scan_config` | 🔶 4 | Beacon (write) | — |

There is **no `delete_scan`** in the official 48-tool MCP — absence is the tier-3 gate for the scanner write surface (Phase 4).

**`get_scans` — raw vs. official DTO.** Raw Beacon (`GET /beacon/scans/`) returns camelCase wire objects: `{scanId, id, title, columnCount, activeScanConfiguration:{columns, filters, sortingColumnId, sortingDirection, version}, conversationId, …}`. The official DTO is `{scan_id, title, filter_summary, cortex_managed, column_count, sorting}`. Only `scan_id`/`title`/`column_count` are 1:1-derivable; `filter_summary` (i18n render of the filters), `cortex_managed` (no raw analog), and `sorting` (a human-readable *column label*, not the raw column-id) are produced MCP-side and are **not reproducible** from raw data. `robinhood_get_scans` therefore derives the three faithful fields, returns the other three as `null` (with an explicit result `note` so their null is never read as meaningful), and preserves the complete raw object under `raw`.

**`get_scanner_filter_specs` — embedded catalog.** The official DTO is `{filter_specs[{filter_type, display_name, filter_group(FUNDAMENTAL|OPTION|PRICE_VOLUME|TECHNICAL), value_type, unit_type, supported_predicates[], supported_lengths?[], supported_intervals?[], supported_plots?[]}]}` — **56 filters** incl. RSI/MACD/EMA/Bollinger/VWAP/ATR/CCI/Aroon/Stochastic + IV/OI + fundamentals. The live Beacon filter-spec route is not locatable with a standard token, and the raw wire model bundles inputs under a single `supportedInputs` field (camelCase) that would require an **unverifiable** reshape to reach this flat DTO. So the catalog is served from an embedded static capture (`src/client/scanner-filter-specs.ts`), captured verbatim from the official MCP on 2026-07-14 and guarded by `__tests__/client/scanner-filter-specs.test.ts`. Provenance is surfaced in the tool description + result `note`, never inside the spec objects (which stay byte-parity with the official DTO). Phase 4 may wire this to the live route if a Legend HAR captures the transcoded path.

**Correction to the Phase-0 canary:** `bonfire/screeners/indicators/` is a *different, legacy Legend-UI model* (indicator groups + column keys), **not** the parity source; the Phase-0 canary that pointed there has been reworked to serve the embedded catalog.

**Tally vs. official 48:** ✅ shipped through Phase 5 (49 `robinhood_*` tools: full read surface + watchlist add/remove + create/update + **follow/unfollow** + **option add/remove (long)** + **tax lots** + scanner reads + realized-P&L ×2 + order review ×2) · ⛔ descoped: `get_equity_technical_indicators` (owner) · 🔶 deferred (honest, no stub): option-watchlist **short-leg** writes (`_S1` suffix unconfirmed — long only, short → app), 4 scanner writes (unprobeable Beacon bodies).

---

## 4b. Parity name-map (contract of record)

Strict 1:1: every official tool has a corresponding `robinhood_*` tool. `✅ = shipped` · `🔶 = shipped-but-upgrade` · `🆕 = to build`. Existing names that already diverge are **kept** (never renamed) and the correspondence is recorded here. Planned names are the mirror of the official name under our prefix.

| Official tool | Our tool | Status | Lands in |
|---|---|---|---|
| `get_accounts` | `robinhood_get_accounts` (+ `robinhood_get_account`) | ✅ | shipped |
| `get_portfolio` | `robinhood_get_portfolio` | 🔶 upgrade → bonfire `unified` | 1A |
| `get_realized_pnl` | `robinhood_get_realized_pnl` | ✅ computed | 2 |
| `get_pnl_trade_history` | `robinhood_get_pnl_trade_history` | ✅ computed | 2 |
| `search` | `robinhood_search` | ✅ | shipped |
| `get_equity_quotes` | `robinhood_get_stock_quote` *(name kept)* | ✅ | shipped |
| `get_equity_historicals` | `robinhood_get_historicals` *(name kept)* | ✅ | shipped |
| `get_equity_fundamentals` | `robinhood_get_fundamentals` | ✅ | shipped |
| `get_earnings_results` | `robinhood_get_earnings_results` | 🆕 | 1A |
| `get_earnings_calendar` | `robinhood_get_earnings_calendar` | 🆕 | 1A |
| `get_indexes` | `robinhood_get_indexes` | 🆕 | 1A |
| `get_index_quotes` | `robinhood_get_index_quotes` | 🆕 | 1A |
| `get_equity_technical_indicators` | *(not offered)* | ⛔ descoped | — |
| `get_equity_price_book` | `robinhood_get_equity_price_book` | 🆕 | 1A |
| `get_equity_tax_lots` | `robinhood_get_equity_tax_lots` | ✅ read (live-verified) | 5 |
| `get_equity_positions` | `robinhood_get_equity_positions` | 🆕 | 1A |
| `get_equity_orders` | `robinhood_get_orders` *(name kept)* | ✅ | shipped |
| `get_equity_tradability` | `robinhood_get_equity_tradability` | 🆕 | 1A |
| `review_equity_order` | `robinhood_review_equity_order` | ✅ read-only compose | 3 |
| `place_equity_order` | `robinhood_place_stock_order` *(name kept)* | ✅ | shipped |
| `cancel_equity_order` | `robinhood_cancel_order` *(shared)* | ✅ | shipped |
| `get_option_chains` | `robinhood_get_options` *(bundled today)* | 🔶 | shipped |
| `get_option_instruments` | `robinhood_get_options` *(bundled today)* | 🔶 | shipped |
| `get_option_quotes` | `robinhood_get_options` *(bundled today)* | 🔶 | shipped |
| `get_option_positions` | `robinhood_get_option_positions` | 🆕 | 1A |
| `get_option_orders` | `robinhood_get_option_orders` | 🆕 | 1A |
| `get_option_historicals` | `robinhood_get_option_historicals` | 🆕 | 1A |
| `review_option_order` | `robinhood_review_option_order` | ✅ read-only compose | 3 |
| `place_option_order` | `robinhood_place_option_order` | ✅ | shipped |
| `cancel_option_order` | `robinhood_cancel_order` *(shared)* | ✅ | shipped |
| `get_watchlists` | `robinhood_get_watchlists` | ✅ | 1B |
| `get_watchlist_items` | `robinhood_get_watchlist_items` | ✅ | 1B |
| `get_popular_watchlists` | `robinhood_get_popular_watchlists` | ✅ | 1B |
| `get_option_watchlist` | `robinhood_get_option_watchlist` | ✅ (returns contracts) | 1B→5 |
| `add_to_watchlist` | `robinhood_add_to_watchlist` | ✅ write | 1B |
| `remove_from_watchlist` | `robinhood_remove_from_watchlist` | ✅ write | 1B |
| `create_watchlist` | `robinhood_create_watchlist` | ✅ write | 4 |
| `update_watchlist` | `robinhood_update_watchlist` | ✅ write | 4 |
| `follow_watchlist` | `robinhood_follow_watchlist` | ✅ write (HAR-verified) | 5 |
| `unfollow_watchlist` | `robinhood_unfollow_watchlist` | ✅ write (HAR-verified) | 5 |
| `add_option_to_watchlist` | `robinhood_add_option_to_watchlist` | ✅ write, long only | 5 |
| `remove_option_from_watchlist` | `robinhood_remove_option_from_watchlist` | ✅ write, long only | 5 |
| `get_scans` | `robinhood_get_scans` | ✅ | 1C |
| `get_scanner_filter_specs` | `robinhood_get_scanner_filter_specs` | ✅ (embedded catalog) | 1C |
| `run_scan` | `robinhood_run_scan` | 🔶 deferred (Beacon route uncaptured) | 4? |
| `create_scan` | `robinhood_create_scan` | ⛔ deferred (unprobeable body) | — |
| `update_scan_filters` | `robinhood_update_scan_filters` | ⛔ deferred (unprobeable body) | — |
| `update_scan_config` | `robinhood_update_scan_config` | ⛔ deferred (unprobeable body) | — |

**Our extras with no official counterpart** (kept): `robinhood_get_crypto`, `robinhood_place_crypto_order`, `robinhood_get_movers`, `robinhood_get_news`, `robinhood_get_short_interest`, `robinhood_get_order_status`, `robinhood_browser_login`, `robinhood_check_session`.

---

## 5. Endpoints beyond BOTH the official MCP and our SDK (research differentiators)

From the HAR — Robinhood exposes these to a standard token; neither the official MCP nor we surface them:

| Capability | Endpoint |
|---|---|
| 13F hedge-fund holdings + sentiment | `GET /marketdata/hedgefunds/summary\|transactions/{id}/` |
| Insider trading | `GET /marketdata/insiders/summary\|transactions/{id}/` |
| Robinhood trading-trends / popularity | `GET /marketdata/equities/summary/robinhood/{id}/` → `daily_transactions` |
| News feed / similar names | `GET dora/feed/instrument/{id}/` · `GET dora/instruments/similar/{id}/` |
| Short availability | `GET /instruments/{id}/shorting/` |
| Option corporate events | `GET /options/events/` |
| Corporate actions | `GET /corp_actions/adr_fees/` · `/corp_actions/v2/split_payments/` |
| Documents / stock-lending | `GET /documents/` · `GET /accounts/stock_loan_payments/` |
| Analyst ratings overview | `GET /discovery/ratings/{id}/overview/` (we use `/midlands/ratings/`) |

Our existing extras the official MCP lacks: **crypto** (quotes/historicals/positions/orders), **news** (`getNews`), **ratings** (`getRatings`), **short interest** (`getShortInterest`), **movers**.

---

## 6. Open items (need one more targeted capture)

1. ~~`get_earnings_calendar`~~ **RESOLVED** — `GET /marketdata/earnings/?range=Nday` market-wide (+N forward, −N look-back; ~29 events/day), live-confirmed.
2. ~~Wormhole realized-P&L~~ **RESOLVED** (PnL-hub HAR) — there is no single equity P&L REST endpoint. The hub composes: `/orders/` + `/options/orders/` executions (equity/option, **computed**), `GET /ceres/v1/accounts/{guid}/realized_pnl?orderIds=` → `{realizedPnlForOrders}` (futures/event, native), and `nummus/orders/` `gain_loss`/`book_gain_loss` (crypto). "Wormhole" is the MCP's internal aggregator, not a REST route — so equity realized P&L = compute-from-orders, now **confirmed as the intended approach** (the app does the same).
5. ~~`get_equity_tax_lots`~~ **RESOLVED (Phase 5)** — there IS a dedicated endpoint: `GET /tax_lots/open/{account}/{instrument}/` (route from robin_stocks PR #1648), live-verified against a populated lot with a standard token. RH's own server-computed lots (14 flat fields), not a derive-from-executions estimate.
3. **Write bodies** — watchlist add/remove **confirmed** (`POST /midlands/lists/items/`); `review_equity_order` DTO captured; **follow/unfollow** and **option add** bodies captured from HARs (`…/followers/{user_id}/` empty-`{}` POST; `quick_add` `{legs:[{option_id,position_type,ratio_quantity:1}],object_type:"option_strategy"}`) and option remove confirmed via the midlands bulk-delete. Still uncaptured: the 4 **Beacon scanner** write bodies (screeners = *Beacon* service: `create_scan` preset+`FILTER_TYPE_*`, `update_scan_filters` REPLACE-semantics, `update_scan_config` sort) and the option **short-leg** (`_S1`) strategy_code. MCP `review_*` is agentic-account-only (the REST `orders/checks/` likely isn't).
4. **`portfolio_historicals`** — old `robin_stocks` path 404s; superseded by `bonfire/…/unified` + `/live`.

---

## 7. Implementation phases (architecture B)

Sequenced by verification confidence and dependency, not by category. Each phase ships in review-sized slices and updates skills/docs/tests in the same change.

| Phase | Goal | Adds | Size | Visible |
|---|---|---|---|---|
| **0 — Plumbing + canary** ✅ | make all 4 hosts reachable | `BONFIRE_BASE`/`DORA_BASE` + `trustedOrigins()` + URL builders in `urls.ts`; `session.patch()`/`requestPatch`; `src/version.ts` + drift-guard test; `.gitignore *.har`; doc-drift fixes; **canary** `getScannerFilterSpecs()` + integration test | S | no |
| **1A — Market-data reads** ✅ | live-verified reads | `robinhood_get_portfolio` (upgraded w/ unified+live), `_get_equity_positions`, `_get_option_positions`, `_get_option_orders`, `_get_equity_price_book`, `_get_earnings_calendar`, `_get_earnings_results`, `_get_indexes`, `_get_index_quotes`, `_get_option_historicals`, `_get_equity_tradability` | M | yes |
| **1B — Watchlists slice** ✅ | reads + first non-order writes | `_get_watchlists`, `_get_watchlist_items`, `_get_popular_watchlists`, `_get_option_watchlist`, `_add_to_watchlist`, `_remove_from_watchlist`; client `resolveInstrumentBySymbol` (exact-match), `updateWatchlistItems` (single-list/op primitive), `getCurrencyPairs`; CLAUDE.md write-tiers policy; MCP tool annotations; gated reversible write integration test | M | yes |
| **1C — Scanner reads** ✅ | scan discovery | `_get_scans` (live Beacon `/beacon/scans/`), `_get_scanner_filter_specs` (embedded static catalog, 56 specs, drift-guarded); reworked the Phase-0 canary off the wrong legacy `bonfire/screeners/indicators/` model | S | yes |
| **2 — Compute tools** ✅ (partial) | derived analytics (highest correctness risk) | `src/compute/realized-pnl.ts` (pure FIFO + bucketing, golden-vector tested); `_get_realized_pnl`, `_get_pnl_trade_history` (equity FIFO + native crypto, options excluded, rates nulled); `pnl:harness` local oracle script. **Descoped:** `_get_equity_technical_indicators` (owner). **Later shipped in Phase 5:** `_get_equity_tax_lots` — turned out to be a real standard-token endpoint (RH's own lots), not a compute, so the unbounded-estimate concern never applied | L | yes |
| **3 — Order review gate** ✅ | pre-trade simulation (read-only) | `_review_equity_order`, `_review_option_order` — composed from the app's own read-only preflight GETs (`order_checks/presubmit_data`, options `collateral`) + a live quote; the price collar is reproduced from live `threshold_servars` in a pure module (`src/compute/order-review.ts`, golden-vector tested), honest-fidelity note enumerates evaluated/not-evaluated checks; account identifiers scrubbed from response bodies. `readOnlyHint:true` | M | yes |
| **4 — Watchlist metadata writes** ✅ | reversibly-verified list writes | `_create_watchlist` (`POST midlands/lists/`), `_update_watchlist` (`PATCH midlands/lists/{id}/`) — bodies from the Legend bundle, verified by a reversible `ROBINHOOD_TEST_WRITES`-gated integration test (create→readback→rename→readback→delete→assert-absent). Client-only `deleteWatchlist` (no MCP tool — no official `delete_watchlist`) | M | yes |
| **5 — Long-tail writes + tax lots** ✅ | close the deferred tail | `_get_equity_tax_lots` (`GET /tax_lots/open/{account}/{instrument}/`, live-verified passthrough, exact-match symbol, per-lot account scrubbed); `_follow`/`_unfollow_watchlist` (`POST`/`DELETE …/followers/{user_id}/`, empty-`{}` body, uuid from cached `/user/`, error-path uuid redaction); `_add`/`_remove_option_from_watchlist` (`quick_add` mint + dedupe / exact-`strategy_code` midlands bulk-delete, **long only**); `_get_option_watchlist` upgraded to return contracts. New client methods + `TaxLot`/`OptionWatchlistContract` types; fable-reviewed (PII/user_id, exact-match removal, dedupe, C1 shape change); reversible `ROBINHOOD_TEST_WRITES`-gated probes for both write pairs. **Deferred (honest, no stub):** option **short-leg** writes (`_S1` suffix unconfirmed → short → app), scanner writes (`_run_scan`/`_create_scan`/`_update_scan_*` — unprobeable Beacon bodies) | M | yes |
| **6 — Research extras (optional)** | exceed parity | 13F/insider/popularity, `dora` news+similar, shorting, corp actions, ratings overview | M | yes |

**Cross-cutting:** (a) names per §4b — never rename shipped tools; (b) multi-account: add `resolveAccountNumber(accountNumber?)` beside `resolveAccountUrl()` in `client.ts` (bonfire is account-scoped by *path*); (c) DTOs: client returns raw typed shapes (cast), MCP layer shapes to captured official DTOs; (d) compute lives in `src/compute/` as pure fns; (e) add date-bounded order fetch (`created_at_gte`/`state`) before P&L; (f) split `types.ts` (1,127 lines) into `src/client/types/`; (g) add a Vitest drift-guard diffing registered tool names vs. `reference.md`.

**Refinements vs. the original phase sketch:** tax-lots moved out of Phase 1 (endpoint uncaptured, per §6) into 2/4; earnings-calendar moved into 1A (resolved, not a Phase-4 straggler); Phase 1 split into 1A/1B/1C; all remaining captures batched into one Phase-4 session; added the Phase-0 canary + drift-guard test.

---

## 8. Integration-testing story (owner requirement) — ✅ implemented

**Status:** live suite shipped in `__tests__/integration/client.test.ts` — all green against the live API (every Phase 0–5 read/compute endpoint + the pre-existing surface, incl. the Phase-3 review tools with a live collar-fires check and the Phase-5 tax-lots read). Reads are value-free; the **4 writes** (watchlist add→remove; the Phase-4 create→rename→delete; the Phase-5 follow→unfollow; and the Phase-5 option add→remove) are additionally gated behind `ROBINHOOD_TEST_WRITES=1` and fully reversible (each verifies presence, then always restores the prior state and asserts it). Auto-skips cleanly when no credentials are configured (CI-safe).

**Token input (any of three), then `bun run test:integration`:**
- `ROBINHOOD_ACCESS_TOKEN=<token>` — direct token
- `ROBINHOOD_TOKENS_FILE=<path> ROBINHOOD_TOKEN_KEY=<key>` — encrypted file (Docker/headless)
- `robinhood-for-agents onboard` then `ROBINHOOD_INTEGRATION=1` — OS keychain

**Goal:** any library user drops in their own token and runs a read-only suite that proves the client against the *live* API — no PII committed, no trades placed.

- **One-command flow:** `robinhood-for-agents onboard` (one-time token capture) → `bun run test:integration`. Token sourced from OS keychain **or** `ROBINHOOD_TOKENS_FILE` + `ROBINHOOD_TOKEN_KEY` (Docker/headless), matching `restoreSession()`. Suite **auto-skips** with a clear message when no token is present, so it's safe in CI and for contributors without an account.
- **Shape, never values:** every test asserts field *presence* / types (`expect(x.symbol).toBeDefined()`), never balances/prices/account numbers — this is how PII stays out of the repo. Live responses are strict-parsed through the Zod schemas here (using the underused `parseOne`/`parseArray` in `http.ts`) to catch upstream API drift early.
- **Read-only by construction:** the suite calls only GET/read methods. The one exception — watchlist add/remove — uses the reversible probe pattern (add → assert → remove → assert back to original) and is gated behind an explicit `ROBINHOOD_TEST_WRITES=1` opt-in.
- **Coverage grows per phase:** each phase adds one shape-assertion per new endpoint, so the suite becomes a living 48-tool parity checklist. A `docs/`-friendly summary (tool → pass/skip) can be emitted without any values.
- **Contributor docs:** README + `skills/` document the token-plug-in flow, the write opt-in, and the auto-skip behavior so it's genuinely turnkey.

Unit tests (Vitest + `vi.mock`, PII-free fixtures) remain the CI gate; the integration suite is local-only and excluded from default runs (already the pattern in `__tests__/integration/`).

---

> No real PII in this doc: account identifiers are placeholders (`{account_number}`, `{id}`); no balances, tokens, or device ids.
