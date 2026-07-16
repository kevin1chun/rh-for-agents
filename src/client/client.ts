/**
 * RobinhoodClient — the primary interface for Robinhood API access.
 *
 * All methods are async. Call `restoreSession()` before any data method.
 * Multi-account is first-class: account-scoped methods accept `accountNumber`.
 */

import {
  deriveOrderType,
  evaluateEquityCollar,
  type ReviewOrderType,
  ThresholdServarsSchema,
} from "../compute/order-review.js";
import { computeFifoRealized, type Fill } from "../compute/realized-pnl.js";
import { redactTokens, scrubAccountIdentifiers } from "../redact.js";
import type { AuthState, LoginResult } from "./auth.js";
import {
  logout as logoutFn,
  restoreSession as restoreSessionFn,
  restoreSessionFromToken,
} from "./auth.js";
import { NotFoundError, NotLoggedInError } from "./errors.js";
import { requestDelete, requestGet, requestPatch, requestPost } from "./http.js";
import { SCANNER_FILTER_SPECS } from "./scanner-filter-specs.js";
import { createSession, type RobinhoodSession } from "./session.js";
import { createTokenStore, type TokenStore } from "./token-store.js";
import type {
  Account,
  CryptoOrder,
  CryptoPosition,
  CryptoQuote,
  Earnings,
  EquityOrderReview,
  Fundamental,
  HistoricalDataPoint,
  Holding,
  IndexInstrument,
  IndexValue,
  Instrument,
  InvestmentProfile,
  News,
  OptionAggregatePosition,
  OptionChain,
  OptionHistorical,
  OptionInstrument,
  OptionMarketData,
  OptionOrder,
  OptionOrderReview,
  OptionOrderReviewLeg,
  OptionPosition,
  OptionWatchlistContract,
  Portfolio,
  PortfolioLive,
  Position,
  PriceBook,
  Quote,
  Rating,
  RealizedPnlData,
  RealizedPnlTrade,
  Scan,
  ScannerFilterSpec,
  ShortInterest,
  ShortInterestDaily,
  StockHistorical,
  StockOrder,
  TaxLot,
  UnifiedPortfolio,
  UserProfile,
  Watchlist,
  WatchlistItem,
  WatchlistItemRef,
} from "./types.js";
import * as urls from "./urls.js";

const MULTI_ACCOUNT_PARAMS: Record<string, string> = {
  default_to_all_accounts: "true",
  include_managed: "true",
  include_multiple_individual: "true",
};

export class RobinhoodClient {
  private session: RobinhoodSession;
  private tokenStore: TokenStore;
  private authState: AuthState | null = null;
  private _loggedIn = false;
  private _indexCache: Map<string, IndexInstrument> | null = null;
  private _userId: string | null = null;

  constructor(opts?: { tokenStore?: TokenStore; accessToken?: string; timeoutMs?: number }) {
    this.session = createSession(opts);
    this.tokenStore = opts?.tokenStore ?? createTokenStore();

    // Direct access token — no store, no refresh
    if (opts?.accessToken) {
      restoreSessionFromToken(this.session, opts.accessToken);
      this._loggedIn = true;
    }
  }

  get isLoggedIn(): boolean {
    return this._loggedIn;
  }

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  async restoreSession(): Promise<LoginResult> {
    const { result, state } = await restoreSessionFn(this.session, this.tokenStore);
    this.authState = state;
    this._loggedIn = true;
    return result;
  }

  async logout(): Promise<void> {
    await logoutFn(this.session, this.authState);
    this.authState = null;
    this._loggedIn = false;
  }

  private requireAuth(): void {
    if (!this._loggedIn) {
      throw new NotLoggedInError();
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /** Resolve account URL — required by Robinhood for all order submissions. */
  private async resolveAccountUrl(accountNumber?: string): Promise<string> {
    if (accountNumber) return urls.account(accountNumber);
    const accounts = await this.getAccounts();
    if (accounts.length === 0) throw new NotFoundError("No brokerage account found");
    return (accounts[0] as Account).url;
  }

  /**
   * Resolve a bare account number — for path-scoped hosts (bonfire) that key
   * on the number itself rather than a URL. Falls back to the default account.
   */
  private async resolveAccountNumber(accountNumber?: string): Promise<string> {
    if (accountNumber) return accountNumber;
    const accounts = await this.getAccounts();
    if (accounts.length === 0) throw new NotFoundError("No brokerage account found");
    return (accounts[0] as Account).account_number;
  }

  // ---------------------------------------------------------------------------
  // Accounts & Profiles
  // ---------------------------------------------------------------------------

  async getAccounts(opts?: { allAccounts?: boolean }): Promise<Account[]> {
    this.requireAuth();
    const params = opts?.allAccounts !== false ? { ...MULTI_ACCOUNT_PARAMS } : {};
    return (await requestGet(this.session, urls.accounts(), {
      dataType: "results",
      params,
    })) as Account[];
  }

  async getAccountProfile(accountNumber?: string): Promise<Account> {
    this.requireAuth();
    if (accountNumber) {
      return (await requestGet(this.session, urls.account(accountNumber))) as Account;
    }
    const accounts = await this.getAccounts();
    return accounts[0] as Account;
  }

  async getPortfolioProfile(accountNumber?: string): Promise<Portfolio> {
    this.requireAuth();
    if (accountNumber) {
      return (await requestGet(this.session, urls.portfolio(accountNumber))) as Portfolio;
    }
    return (await requestGet(this.session, urls.portfolios(), {
      dataType: "indexzero",
    })) as Portfolio;
  }

  /**
   * Unified portfolio snapshot (bonfire): total equity, per-bucket market
   * values, and the full buying-power breakdown (equity/options/crypto). This
   * is the data the official `get_portfolio` tool surfaces.
   *
   * Bonfire's unified endpoint only recognizes a user's default account
   * number — every other real, valid account_number 404s here even though
   * the sibling `portfolioLive`/`portfolios` endpoints accept it fine. Treat
   * that 404 as "no unified snapshot for this account" rather than failing
   * the whole call, so scoping to a non-default account doesn't break.
   */
  async getUnifiedPortfolio(accountNumber?: string): Promise<UnifiedPortfolio | null> {
    this.requireAuth();
    const acct = await this.resolveAccountNumber(accountNumber);
    try {
      return (await requestGet(this.session, urls.unifiedPortfolio(acct))) as UnifiedPortfolio;
    } catch (e) {
      if (e instanceof NotFoundError) return null;
      throw e;
    }
  }

  /** Live per-asset-class market values + cash (bonfire). */
  async getPortfolioLive(accountNumber?: string): Promise<PortfolioLive> {
    this.requireAuth();
    const acct = await this.resolveAccountNumber(accountNumber);
    return (await requestGet(this.session, urls.portfolioLive(acct))) as PortfolioLive;
  }

  async getUserProfile(): Promise<UserProfile> {
    this.requireAuth();
    return (await requestGet(this.session, urls.user())) as UserProfile;
  }

  async getInvestmentProfile(): Promise<InvestmentProfile> {
    this.requireAuth();
    return (await requestGet(this.session, urls.investmentProfile())) as InvestmentProfile;
  }

  // ---------------------------------------------------------------------------
  // Positions & Holdings
  // ---------------------------------------------------------------------------

  async getPositions(opts?: { accountNumber?: string; nonzero?: boolean }): Promise<Position[]> {
    this.requireAuth();
    const params: Record<string, string> = { ...MULTI_ACCOUNT_PARAMS };
    if (opts?.nonzero) params.nonzero = "true";
    if (opts?.accountNumber) params.account_number = opts.accountNumber;
    return (await requestGet(this.session, urls.positions(), {
      dataType: "pagination",
      params,
    })) as Position[];
  }

  async getInstrumentByUrl(url: string): Promise<Instrument> {
    this.requireAuth();
    if (!url.startsWith(urls.API_BASE)) {
      throw new Error(`Refusing to fetch instrument from untrusted URL: ${url}`);
    }
    return (await requestGet(this.session, url)) as Instrument;
  }

  async buildHoldings(opts?: {
    accountNumber?: string;
    withDividends?: boolean;
  }): Promise<Record<string, Holding>> {
    this.requireAuth();
    const positions = await this.getPositions({
      accountNumber: opts?.accountNumber,
      nonzero: true,
    });

    if (positions.length === 0) return {};

    // Resolve instruments in parallel
    const instruments = await Promise.all(
      positions.map((pos) => this.getInstrumentByUrl(pos.instrument)),
    );

    const symbolList = instruments.map((i) => i.symbol);
    const quotes = await this.getQuotes(symbolList);

    const dividendMap: Record<string, string | null> = {};
    if (opts?.withDividends) {
      const fundies = await this.getFundamentals(symbolList);
      for (const f of fundies) {
        if (f.symbol) {
          dividendMap[f.symbol] = f.dividend_yield ?? null;
        }
      }
    }

    const holdings: Record<string, Holding> = {};
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i] as Position;
      const inst = instruments[i] as Instrument;
      const quote = quotes.find((q) => q.symbol === inst.symbol);

      const quantity = parseFloat(pos.quantity);
      const avgCost = parseFloat(pos.average_buy_price);
      const price = parseFloat(quote?.last_trade_price ?? "0");
      const equity = quantity * price;
      const equityChange = equity - quantity * avgCost;
      const percentChange = avgCost > 0 ? ((price - avgCost) / avgCost) * 100 : 0;

      const holding: Holding = {
        symbol: inst.symbol,
        name: inst.simple_name ?? inst.name,
        quantity: String(quantity),
        average_buy_price: String(avgCost),
        price: String(price),
        equity: String(equity),
        equity_change: String(equityChange),
        percent_change: String(percentChange),
        pe_ratio: quote?.pe_ratio ?? null,
      };

      if (opts?.withDividends) {
        holding.dividend_rate = dividendMap[inst.symbol] ?? null;
      }

      holdings[inst.symbol] = holding;
    }

    return holdings;
  }

  // ---------------------------------------------------------------------------
  // Quotes & Fundamentals
  // ---------------------------------------------------------------------------

  async getQuotes(symbols: string | string[]): Promise<Quote[]> {
    this.requireAuth();
    const list = normalizeSymbols(symbols);
    return (await requestGet(this.session, urls.quotes(), {
      dataType: "results",
      params: { symbols: list.join(",") },
    })) as Quote[];
  }

  async getLatestPrice(symbols: string[], opts?: { priceType?: string }): Promise<string[]> {
    this.requireAuth();
    const quotes = await this.getQuotes(symbols);
    const field = opts?.priceType ?? "last_trade_price";
    return quotes.map((q) => {
      const value = (q as unknown as Record<string, unknown>)[field];
      return String(value ?? q.last_trade_price ?? "0");
    });
  }

  async getFundamentals(symbols: string[]): Promise<Fundamental[]> {
    this.requireAuth();
    const list = symbols.map((s) => s.trim().toUpperCase());
    return (await requestGet(this.session, urls.fundamentals(), {
      dataType: "results",
      params: { symbols: list.join(",") },
    })) as Fundamental[];
  }

  async getStockHistoricals(
    symbols: string | string[],
    opts?: { interval?: string; span?: string; bounds?: string },
  ): Promise<StockHistorical[]> {
    this.requireAuth();
    const list = normalizeSymbols(symbols);
    return (await requestGet(this.session, urls.stockHistoricals(), {
      dataType: "results",
      params: {
        symbols: list.join(","),
        interval: opts?.interval ?? "day",
        span: opts?.span ?? "month",
        bounds: opts?.bounds ?? "regular",
      },
    })) as StockHistorical[];
  }

  // ---------------------------------------------------------------------------
  // News, Ratings, Earnings
  // ---------------------------------------------------------------------------

  async getNews(symbol: string): Promise<News[]> {
    this.requireAuth();
    return (await requestGet(this.session, urls.news(symbol), {
      dataType: "results",
    })) as News[];
  }

  async getRatings(symbol: string): Promise<Rating> {
    this.requireAuth();
    // Ratings endpoint uses the instrument ID
    const insts = await this.findInstruments(symbol);
    if (insts.length === 0) return {} as Rating;
    const inst = insts[0] as Instrument;
    return (await requestGet(this.session, urls.ratings(inst.id))) as Rating;
  }

  async getEarnings(symbol: string): Promise<Earnings[]> {
    this.requireAuth();
    // Use the instrument_id approach to get earnings
    const insts = await this.findInstruments(symbol);
    if (insts.length === 0) return [];
    return (await requestGet(this.session, urls.earnings(), {
      dataType: "results",
      params: { symbol: symbol.toUpperCase() },
    })) as Earnings[];
  }

  /**
   * Market-wide earnings calendar. `rangeDays` selects the window: positive =
   * upcoming (e.g. `7` → next 7 days), negative = recent look-back. Returns all
   * reporting companies in that window, not scoped to one symbol.
   */
  async getEarningsCalendar(rangeDays = 7): Promise<Earnings[]> {
    this.requireAuth();
    const n = Math.trunc(rangeDays);
    if (n === 0) throw new Error("rangeDays must be a non-zero integer (e.g. 7 or -7).");
    return (await requestGet(this.session, urls.earnings(), {
      dataType: "results",
      params: { range: `${n}day` },
    })) as Earnings[];
  }

  /**
   * Level-2 price book (aggregated bid/ask depth) for a stock. Depth is
   * populated during market hours; `asks`/`bids` are empty when closed.
   */
  async getPriceBook(symbol: string): Promise<PriceBook> {
    this.requireAuth();
    const sym = symbol.toUpperCase();
    const instruments = await this.findInstruments(sym);
    const inst = instruments.find((i) => i.symbol === sym) ?? instruments[0];
    if (!inst) throw new NotFoundError(`No instrument found for symbol: ${symbol}`);
    return (await requestGet(this.session, urls.priceBookSnapshot(inst.id))) as PriceBook;
  }

  /** Tradability flags for one or more symbols (sourced from `/instruments/`). */
  async getTradability(symbols: string | string[]): Promise<
    Array<{
      symbol: string;
      tradeable?: boolean;
      tradability?: string;
      rhs_tradability?: string | null;
      fractional_tradability?: string | null;
      short_selling_tradability?: string | null;
      all_day_tradability?: string | null;
      state?: string | null;
      account_type_tradabilities?: Instrument["account_type_tradabilities"];
    }>
  > {
    this.requireAuth();
    const list = (Array.isArray(symbols) ? symbols : [symbols]).map((s) => s.toUpperCase());
    const out: Array<{ symbol: string } & Partial<Instrument>> = [];
    for (const sym of list) {
      const instruments = await this.findInstruments(sym);
      const inst = instruments.find((i) => i.symbol === sym) ?? instruments[0];
      if (!inst) continue;
      out.push({
        symbol: inst.symbol,
        tradeable: inst.tradeable,
        tradability: inst.tradability,
        rhs_tradability: inst.rhs_tradability,
        fractional_tradability: inst.fractional_tradability,
        short_selling_tradability: inst.short_selling_tradability,
        all_day_tradability: inst.all_day_tradability,
        state: inst.state,
        account_type_tradabilities: inst.account_type_tradabilities,
      });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Short Interest
  // ---------------------------------------------------------------------------

  /**
   * Robinhood's daily short-interest series for a stock: modeled shares short
   * and short interest as a percent of free float, each with a confidence band
   * (see {@link ShortInterest}). This is a modeled DAILY estimate, not the
   * official biweekly FINRA settlement figure.
   *
   * The endpoint caps each request at a 92-day window, so this method walks
   * backward from `endDate` in ≤90-day chunks and merges them into one series —
   * callers never see the window limit. RH's series is present-anchored and
   * contiguous (it began ~mid-2025), so the walk stops at the first empty
   * window (the start of history); a `MAX_WINDOWS` cap bounds it to ~3 years as
   * a backstop. Pass `startDate`/`endDate` (YYYY-MM-DD) to bound the range; omit
   * `startDate` for full history. Returns `null` if the symbol resolves to no
   * instrument or the endpoint has no data for it. Throws on a malformed/invalid
   * date, a future `endDate`, or a `startDate` later than `endDate`.
   */
  async getShortInterest(
    symbol: string,
    opts?: { startDate?: string; endDate?: string },
  ): Promise<ShortInterest | null> {
    this.requireAuth();

    // Validate the window up front so a bad value fails fast with a clear error
    // rather than a raw RangeError from the date math or an opaque server 400.
    const nowMs = Date.now();
    const endMs = opts?.endDate ? parseIsoDateMs(opts.endDate, "endDate") : nowMs;
    // A future endDate would put the first (most recent) window past the data
    // frontier — it returns empty and the walk stops at null. Reject it rather
    // than surprise the caller with a null for a range that has real data.
    if (endMs > nowMs) {
      throw new Error(`Invalid short-interest range: endDate (${opts?.endDate}) is in the future.`);
    }
    let floor: string | null = null;
    if (opts?.startDate !== undefined) {
      const startMs = parseIsoDateMs(opts.startDate, "startDate");
      if (startMs > endMs) {
        throw new Error(
          `Invalid short-interest range: startDate (${opts.startDate}) is after endDate.`,
        );
      }
      floor = opts.startDate;
    }

    // The endpoint is keyed on instrument ID, not symbol. Prefer the exact
    // ticker match among search results (falling back to the first) so a fuzzy
    // query can't resolve to the wrong instrument.
    const sym = symbol.trim().toUpperCase();
    const insts = await this.findInstruments(sym);
    if (insts.length === 0) return null;
    const inst = (insts.find((i) => (i.symbol ?? "").toUpperCase() === sym) ??
      insts[0]) as Instrument;

    // Server enforces start_date..end_date <= 92 days; stay safely under it.
    const CHUNK_DAYS = 90;
    // Runaway guard: bounds the walk to ~3 years even if the empty-window stop
    // below never trips (a data shape RH has never served).
    const MAX_WINDOWS = 12;

    const byDate = new Map<string, ShortInterestDaily>();
    let meta: Pick<ShortInterest, "symbol" | "instrument_id" | "exchange_symbol"> | null = null;

    let windowEnd = new Date(endMs).toISOString().slice(0, 10);
    for (let i = 0; i < MAX_WINDOWS; i++) {
      const chunkStart = isoAddDays(windowEnd, -CHUNK_DAYS);
      const windowStart = floor && floor > chunkStart ? floor : chunkStart;

      const resp = (await requestGet(this.session, urls.shortInterest(), {
        params: { ids: inst.id, start_date: windowStart, end_date: windowEnd },
      })) as { status?: string; data?: Array<{ status?: string; data?: ShortInterest }> };

      const chunk = resp.data?.[0]?.data ?? null;
      const rows = chunk?.daily_data ?? [];
      if (!chunk || rows.length === 0) {
        // RH's series is present-anchored and contiguous, so the first empty
        // window (walking backward) marks the start of history — or, on the
        // very first window, a symbol with no short-interest data at all.
        break;
      }
      meta ??= {
        symbol: chunk.symbol,
        instrument_id: chunk.instrument_id,
        exchange_symbol: chunk.exchange_symbol,
      };
      for (const row of rows) byDate.set(row.date, row);

      if (floor && windowStart <= floor) break;
      windowEnd = isoAddDays(windowStart, -1); // step back a day; never re-fetch the boundary
    }

    if (byDate.size === 0) return null;
    return {
      symbol: meta?.symbol,
      instrument_id: meta?.instrument_id,
      exchange_symbol: meta?.exchange_symbol,
      daily_data: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  // ---------------------------------------------------------------------------
  // Indexes
  // ---------------------------------------------------------------------------

  private async getIndexes(): Promise<Map<string, IndexInstrument>> {
    if (this._indexCache) return this._indexCache;
    this.requireAuth();
    const indexes = (await requestGet(this.session, urls.indexes(), {
      dataType: "results",
    })) as IndexInstrument[];
    this._indexCache = new Map();
    for (const idx of indexes) {
      this._indexCache.set(idx.symbol.toUpperCase(), idx);
    }
    return this._indexCache;
  }

  async getIndexValue(symbol: string): Promise<IndexValue | null> {
    this.requireAuth();
    const indexMap = await this.getIndexes();
    const index = indexMap.get(symbol.toUpperCase());
    if (!index) return null;
    const resp = (await requestGet(this.session, urls.indexValues(), {
      params: { ids: index.id },
    })) as { status?: string; data?: Array<{ status?: string; data?: IndexValue }> };
    return resp.data?.[0]?.data ?? null;
  }

  /** All tradable index instruments (SPX, NDX, VIX, RUT, …). */
  async getIndexInstruments(): Promise<IndexInstrument[]> {
    this.requireAuth();
    return (await requestGet(this.session, urls.indexes(), {
      dataType: "results",
    })) as IndexInstrument[];
  }

  /** Current values for one or more index symbols. Unknown symbols are skipped. */
  async getIndexQuotes(symbols: string | string[]): Promise<IndexValue[]> {
    this.requireAuth();
    const list = Array.isArray(symbols) ? symbols : [symbols];
    const out: IndexValue[] = [];
    for (const sym of list) {
      const value = await this.getIndexValue(sym);
      if (value) out.push(value);
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Options
  // ---------------------------------------------------------------------------

  async getChains(symbol: string, opts?: { expirationDate?: string }): Promise<OptionChain> {
    this.requireAuth();
    const sym = symbol.toUpperCase();
    const emptyChain = { id: "", expiration_dates: [] } as unknown as OptionChain;

    // Check if this is an index symbol (SPX, NDX, VIX, RUT, XSP, etc.)
    const indexMap = await this.getIndexes();
    const index = indexMap.get(sym);
    if (index?.tradable_chain_ids?.length) {
      const chains = (await requestGet(this.session, urls.optionChains(), {
        dataType: "results",
        params: { ids: index.tradable_chain_ids.join(",") },
      })) as OptionChain[];

      if (chains.length === 0) return emptyChain;
      if (chains.length === 1) return chains[0] ?? emptyChain;

      // Multiple chains (e.g. SPXW weeklies + SPX monthlies).
      // Pick the chain that contains the requested expiration date.
      const expDate = opts?.expirationDate;
      if (expDate) {
        const matching = chains.filter((c) => c.expiration_dates.includes(expDate));
        if (matching.length > 0) return matching[0] ?? emptyChain;
      }

      // Default: return the chain with the most expiration dates (weeklies/dailies)
      chains.sort((a, b) => b.expiration_dates.length - a.expiration_dates.length);
      return chains[0] ?? emptyChain;
    }

    // Equity path — resolve instrument ID for correct chain lookup
    const instruments = await this.findInstruments(sym);
    const inst = instruments.find((i) => i.symbol === sym);
    if (!inst) return emptyChain;
    const chains = (await requestGet(this.session, urls.optionChains(), {
      dataType: "results",
      params: { equity_instrument_ids: inst.id, state: "active" },
    })) as OptionChain[];
    return chains[0] ?? emptyChain;
  }

  async findTradableOptions(
    symbol: string,
    opts?: { expirationDate?: string; strikePrice?: number; optionType?: string },
  ): Promise<OptionInstrument[]> {
    this.requireAuth();
    const chain = await this.getChains(symbol, {
      expirationDate: opts?.expirationDate,
    });
    const params: Record<string, string> = {
      chain_id: chain.id,
    };
    if (opts?.expirationDate) params.expiration_dates = opts.expirationDate;
    if (opts?.strikePrice != null) params.strike_price = String(opts.strikePrice);
    if (opts?.optionType) params.type = opts.optionType;

    let results = (await requestGet(this.session, urls.optionInstruments(), {
      dataType: "pagination",
      params,
    })) as OptionInstrument[];

    // Client-side filtering — the API doesn't always honor query params
    if (opts?.expirationDate) {
      results = results.filter((o) => o.expiration_date === opts.expirationDate);
    }
    if (opts?.strikePrice != null) {
      const target = String(opts.strikePrice);
      results = results.filter((o) => Number(o.strike_price) === Number(target));
    }
    if (opts?.optionType) {
      results = results.filter((o) => o.type === opts.optionType);
    }

    return results;
  }

  async getOptionMarketData(
    symbol: string,
    expirationDate: string,
    strikePrice: number,
    optionType: string,
  ): Promise<OptionMarketData[]> {
    this.requireAuth();
    const options = await this.findTradableOptions(symbol, {
      expirationDate,
      strikePrice,
      optionType,
    });
    if (options.length === 0) return [];

    const results: OptionMarketData[] = [];
    for (const opt of options) {
      const data = (await requestGet(
        this.session,
        urls.optionMarketData(opt.id),
      )) as OptionMarketData;
      results.push(data);
    }
    return results;
  }

  /** Open option positions (per-leg). Pass `nonzero` to drop closed legs. */
  async getOptionPositions(opts?: {
    accountNumber?: string;
    nonzero?: boolean;
  }): Promise<OptionPosition[]> {
    this.requireAuth();
    const params: Record<string, string> = {};
    if (opts?.nonzero) params.nonzero = "true";
    if (opts?.accountNumber) params.account_number = opts.accountNumber;
    return (await requestGet(this.session, urls.optionPositions(), {
      dataType: "pagination",
      params,
    })) as OptionPosition[];
  }

  /** Aggregate option positions (grouped by strategy: spreads, condors, …). */
  async getOptionAggregatePositions(opts?: {
    accountNumber?: string;
    nonzero?: boolean;
  }): Promise<OptionAggregatePosition[]> {
    this.requireAuth();
    const params: Record<string, string> = {};
    if (opts?.nonzero) params.nonzero = "true";
    if (opts?.accountNumber) params.account_number = opts.accountNumber;
    return (await requestGet(this.session, urls.optionAggregatePositions(), {
      dataType: "pagination",
      params,
    })) as OptionAggregatePosition[];
  }

  /**
   * Historical OHLC series for a specific option contract, identified by
   * underlying symbol + expiration + strike + type. Returns one series per
   * matching contract (normally one).
   */
  async getOptionHistoricals(
    symbol: string,
    expirationDate: string,
    strikePrice: number,
    optionType: string,
    opts?: { span?: string; interval?: string; bounds?: string },
  ): Promise<OptionHistorical[]> {
    this.requireAuth();
    const options = await this.findTradableOptions(symbol, {
      expirationDate,
      strikePrice,
      optionType,
    });
    if (options.length === 0) return [];
    const params: Record<string, string> = {
      span: opts?.span ?? "day",
      interval: opts?.interval ?? "hour",
    };
    if (opts?.bounds) params.bounds = opts.bounds;

    const results: OptionHistorical[] = [];
    for (const opt of options) {
      const data = (await requestGet(this.session, urls.optionHistoricals(opt.id), {
        params,
      })) as OptionHistorical;
      results.push(data);
    }
    return results;
  }

  // ---------------------------------------------------------------------------
  // Crypto
  // ---------------------------------------------------------------------------

  async getCryptoQuote(symbol: string): Promise<CryptoQuote> {
    this.requireAuth();
    const pairs = (await requestGet(this.session, urls.cryptoCurrencyPairs(), {
      dataType: "results",
    })) as Array<{ id: string; asset_currency: { code: string } }>;
    const pair = pairs.find((p) => p.asset_currency.code.toUpperCase() === symbol.toUpperCase());
    if (!pair) {
      return { mark_price: "0" } as CryptoQuote;
    }
    return (await requestGet(this.session, urls.cryptoQuote(pair.id))) as CryptoQuote;
  }

  async getCryptoHistoricals(
    symbol: string,
    opts?: { interval?: string; span?: string; bounds?: string },
  ): Promise<HistoricalDataPoint[]> {
    this.requireAuth();
    const pairs = (await requestGet(this.session, urls.cryptoCurrencyPairs(), {
      dataType: "results",
    })) as Array<{ id: string; asset_currency: { code: string } }>;
    const pair = pairs.find((p) => p.asset_currency.code.toUpperCase() === symbol.toUpperCase());
    if (!pair) return [];
    return (await requestGet(this.session, urls.cryptoHistoricals(pair.id), {
      dataType: "results",
      params: {
        interval: opts?.interval ?? "day",
        span: opts?.span ?? "month",
        bounds: opts?.bounds ?? "24_7",
      },
    })) as HistoricalDataPoint[];
  }

  async getCryptoPositions(): Promise<CryptoPosition[]> {
    this.requireAuth();
    return (await requestGet(this.session, urls.cryptoHoldings(), {
      dataType: "results",
    })) as CryptoPosition[];
  }

  // ---------------------------------------------------------------------------
  // Stock Orders
  // ---------------------------------------------------------------------------

  async getAllStockOrders(opts?: { accountNumber?: string }): Promise<StockOrder[]> {
    this.requireAuth();
    const params: Record<string, string> = {};
    if (opts?.accountNumber) params.account_number = opts.accountNumber;
    return (await requestGet(this.session, urls.stockOrders(), {
      dataType: "pagination",
      params,
    })) as StockOrder[];
  }

  async getOpenStockOrders(opts?: { accountNumber?: string }): Promise<StockOrder[]> {
    const all = await this.getAllStockOrders(opts);
    return all.filter((o) => o.cancel != null);
  }

  async getStockOrder(orderId: string): Promise<StockOrder> {
    this.requireAuth();
    return (await requestGet(this.session, urls.stockOrder(orderId))) as StockOrder;
  }

  async orderStock(
    symbol: string,
    side: "buy" | "sell",
    quantity: number,
    opts?: {
      limitPrice?: number;
      stopPrice?: number;
      trailAmount?: number;
      trailType?: "percentage" | "amount";
      timeInForce?: string;
      extendedHours?: boolean;
      accountNumber?: string;
    },
  ): Promise<StockOrder> {
    this.requireAuth();
    const sym = symbol.trim().toUpperCase();

    // Validate numeric bounds
    if (quantity <= 0 || !Number.isFinite(quantity)) {
      throw new Error("quantity must be a positive finite number");
    }
    if (opts?.limitPrice != null && (opts.limitPrice <= 0 || !Number.isFinite(opts.limitPrice))) {
      throw new Error("limitPrice must be a positive finite number");
    }
    if (opts?.stopPrice != null && (opts.stopPrice <= 0 || !Number.isFinite(opts.stopPrice))) {
      throw new Error("stopPrice must be a positive finite number");
    }
    if (
      opts?.trailAmount != null &&
      (opts.trailAmount <= 0 || !Number.isFinite(opts.trailAmount))
    ) {
      throw new Error("trailAmount must be a positive finite number");
    }

    // Validate mutually exclusive order params
    if (opts?.trailAmount != null && (opts?.limitPrice != null || opts?.stopPrice != null)) {
      throw new Error("Cannot combine trailAmount with limitPrice or stopPrice");
    }

    // Fractional orders must be market orders with gfd
    const isFractional = !Number.isInteger(quantity);
    if (isFractional) {
      if (opts?.limitPrice != null || opts?.stopPrice != null || opts?.trailAmount != null) {
        throw new Error(
          "Fractional orders must be market orders (no limit, stop, or trailing stop)",
        );
      }
    }

    // Find the instrument URL
    const insts = await this.findInstruments(sym);
    if (insts.length === 0) throw new NotFoundError(`Instrument not found: ${sym}`);
    const inst = insts[0] as Instrument;

    // Determine order type and trigger from price params
    let orderType: string;
    let trigger: string;

    if (opts?.trailAmount != null) {
      orderType = "market";
      trigger = "stop";
    } else if (opts?.stopPrice != null && opts?.limitPrice != null) {
      orderType = "limit";
      trigger = "stop";
    } else if (opts?.stopPrice != null) {
      orderType = "market";
      trigger = "stop";
    } else if (opts?.limitPrice != null) {
      orderType = "limit";
      trigger = "immediate";
    } else {
      orderType = "market";
      trigger = "immediate";
    }

    const accountUrl = await this.resolveAccountUrl(opts?.accountNumber);

    const payload: Record<string, unknown> = {
      account: accountUrl,
      instrument: inst.url,
      symbol: sym,
      side,
      quantity: String(quantity),
      type: orderType,
      trigger,
      time_in_force: isFractional
        ? "gfd"
        : (() => {
            if (!opts?.timeInForce)
              throw new Error("timeInForce is required for non-fractional stock orders");
            return opts.timeInForce;
          })(),
      extended_hours: opts?.extendedHours ?? false,
      ref_id: crypto.randomUUID(),
    };

    if (opts?.limitPrice != null) payload.price = String(opts.limitPrice);
    if (opts?.stopPrice != null) payload.stop_price = String(opts.stopPrice);
    if (opts?.trailAmount != null) {
      const pegType = opts.trailType ?? "percentage";
      const peg: Record<string, unknown> = { type: pegType };
      if (pegType === "amount") {
        peg.price = { amount: String(opts.trailAmount) };
      } else {
        peg.percentage = String(opts.trailAmount);
      }
      payload.trailing_peg = peg;
    }

    payload.order_form_version = 7;

    return (await requestPost(this.session, urls.stockOrders(), {
      payload,
      asJson: true,
    })) as StockOrder;
  }

  async cancelStockOrder(orderId: string): Promise<void> {
    this.requireAuth();
    await requestPost(this.session, urls.cancelStockOrder(orderId));
  }

  // ---------------------------------------------------------------------------
  // Option Orders
  // ---------------------------------------------------------------------------

  async getAllOptionOrders(opts?: { accountNumber?: string }): Promise<OptionOrder[]> {
    this.requireAuth();
    const params: Record<string, string> = {};
    if (opts?.accountNumber) params.account_number = opts.accountNumber;
    return (await requestGet(this.session, urls.optionOrders(), {
      dataType: "pagination",
      params,
    })) as OptionOrder[];
  }

  async getOpenOptionOrders(opts?: { accountNumber?: string }): Promise<OptionOrder[]> {
    const all = await this.getAllOptionOrders(opts);
    return all.filter((o) => o.cancel_url != null);
  }

  async getOptionOrder(orderId: string): Promise<OptionOrder> {
    this.requireAuth();
    return (await requestGet(this.session, urls.optionOrder(orderId))) as OptionOrder;
  }

  async orderOption(
    symbol: string,
    legs: Array<{
      expirationDate: string;
      strike: number;
      optionType: "call" | "put";
      side: "buy" | "sell";
      positionEffect: "open" | "close";
      ratioQuantity?: number;
    }>,
    price: number,
    quantity: number,
    direction: "debit" | "credit",
    opts?: {
      stopPrice?: number;
      timeInForce?: string;
      accountNumber?: string;
    },
  ): Promise<OptionOrder> {
    this.requireAuth();
    if (legs.length === 0) {
      throw new Error("At least one leg is required");
    }
    if (price <= 0 || !Number.isFinite(price)) {
      throw new Error("price must be a positive finite number");
    }
    if (quantity <= 0 || !Number.isFinite(quantity)) {
      throw new Error("quantity must be a positive finite number");
    }
    if (opts?.stopPrice != null && (opts.stopPrice <= 0 || !Number.isFinite(opts.stopPrice))) {
      throw new Error("stopPrice must be a positive finite number");
    }

    // Resolve each leg's option instrument
    const resolvedLegs = [];
    for (const leg of legs) {
      const options = await this.findTradableOptions(symbol, {
        expirationDate: leg.expirationDate,
        strikePrice: leg.strike,
        optionType: leg.optionType,
      });
      if (options.length === 0) {
        throw new NotFoundError(
          `No tradable option found: ${symbol} ${leg.expirationDate} ${leg.strike} ${leg.optionType}`,
        );
      }
      const opt = options[0] as OptionInstrument;
      resolvedLegs.push({
        option_id: opt.id,
        side: leg.side,
        position_effect: leg.positionEffect,
        ratio_quantity: leg.ratioQuantity ?? 1,
      });
    }

    const accountUrl = await this.resolveAccountUrl(opts?.accountNumber);

    const payload: Record<string, unknown> = {
      account: accountUrl,
      direction,
      legs: resolvedLegs,
      price: String(price),
      quantity: String(quantity),
      type: "limit",
      time_in_force: opts?.timeInForce ?? "gfd",
      trigger: opts?.stopPrice != null ? "stop" : "immediate",
      market_hours: "regular_hours",
      override_day_trade_checks: true,
      override_dtbp_checks: true,
      ref_id: crypto.randomUUID(),
    };

    if (opts?.stopPrice != null) {
      payload.stop_price = String(opts.stopPrice);
    }

    return (await requestPost(this.session, urls.optionOrders(), {
      payload,
      asJson: true,
    })) as OptionOrder;
  }

  async cancelOptionOrder(orderId: string): Promise<void> {
    this.requireAuth();
    await requestPost(this.session, urls.cancelOptionOrder(orderId));
  }

  // ---------------------------------------------------------------------------
  // Crypto Orders
  // ---------------------------------------------------------------------------

  async getAllCryptoOrders(opts?: { accountNumber?: string }): Promise<CryptoOrder[]> {
    this.requireAuth();
    const params: Record<string, string> = {};
    if (opts?.accountNumber) params.account_number = opts.accountNumber;
    return (await requestGet(this.session, urls.cryptoOrders(), {
      dataType: "pagination",
      params,
    })) as CryptoOrder[];
  }

  async getOpenCryptoOrders(opts?: { accountNumber?: string }): Promise<CryptoOrder[]> {
    const all = await this.getAllCryptoOrders(opts);
    return all.filter((o) => o.state === "unconfirmed" || o.state === "confirmed");
  }

  async getCryptoOrder(orderId: string): Promise<CryptoOrder> {
    this.requireAuth();
    return (await requestGet(this.session, urls.cryptoOrder(orderId))) as CryptoOrder;
  }

  async orderCrypto(
    symbol: string,
    side: "buy" | "sell",
    amountOrQuantity: number,
    opts?: {
      amountIn?: "quantity" | "price";
      orderType?: "market" | "limit";
      limitPrice?: number;
    },
  ): Promise<CryptoOrder> {
    this.requireAuth();

    // Validate numeric bounds
    if (amountOrQuantity <= 0 || !Number.isFinite(amountOrQuantity)) {
      throw new Error("amountOrQuantity must be a positive finite number");
    }
    if (opts?.limitPrice != null && (opts.limitPrice <= 0 || !Number.isFinite(opts.limitPrice))) {
      throw new Error("limitPrice must be a positive finite number");
    }

    const s = symbol.trim().toUpperCase();

    // Look up the currency pair
    const pairs = (await requestGet(this.session, urls.cryptoCurrencyPairs(), {
      dataType: "results",
    })) as Array<{ id: string; asset_currency: { code: string } }>;
    const pair = pairs.find((p) => p.asset_currency.code.toUpperCase() === s);
    if (!pair) throw new NotFoundError(`Crypto pair not found: ${s}`);

    // Determine if specifying quantity or dollar amount
    const amountIn = opts?.amountIn ?? "quantity";
    const payload: Record<string, unknown> = {
      currency_pair_id: pair.id,
      side,
      type: opts?.orderType ?? "market",
      time_in_force: "gtc",
      ref_id: crypto.randomUUID(),
    };

    if (amountIn === "quantity") {
      payload.quantity = String(amountOrQuantity);
    } else {
      // Dollar amount — Robinhood expects quantity, so we calculate it from the dollar amount
      if (opts?.limitPrice != null) {
        // Use limitPrice to derive quantity from dollar amount
        payload.quantity = String(amountOrQuantity / opts.limitPrice);
      } else {
        // For dollar-amount market orders, Robinhood's crypto API accepts `price`
        // as the dollar amount to spend. The API converts it to quantity at execution.
        payload.price = String(amountOrQuantity);
      }
    }

    if (opts?.limitPrice != null) {
      payload.price = String(opts.limitPrice);
      payload.type = "limit";
    }

    return (await requestPost(this.session, urls.cryptoOrders(), {
      payload,
      asJson: true,
    })) as CryptoOrder;
  }

  async cancelCryptoOrder(orderId: string): Promise<void> {
    this.requireAuth();
    await requestPost(this.session, urls.cancelCryptoOrder(orderId));
  }

  // ---------------------------------------------------------------------------
  // Markets & Search
  // ---------------------------------------------------------------------------

  async getTopMovers(): Promise<Instrument[]> {
    this.requireAuth();
    const data = (await requestGet(this.session, urls.topMovers())) as {
      instruments: string[];
    };
    const results: Instrument[] = [];
    for (const url of data.instruments ?? []) {
      results.push(await this.getInstrumentByUrl(url));
    }
    return results;
  }

  async getTopMoversSp500(direction: "up" | "down"): Promise<Instrument[]> {
    this.requireAuth();
    return (await requestGet(this.session, urls.topMoversSp500(), {
      dataType: "results",
      params: { direction },
    })) as Instrument[];
  }

  async getTop100(): Promise<Instrument[]> {
    this.requireAuth();
    const data = (await requestGet(this.session, urls.top100())) as {
      instruments: string[];
    };
    const results: Instrument[] = [];
    for (const url of data.instruments ?? []) {
      results.push(await this.getInstrumentByUrl(url));
    }
    return results;
  }

  async findInstruments(query: string): Promise<Instrument[]> {
    this.requireAuth();
    return (await requestGet(this.session, urls.instruments(), {
      dataType: "results",
      params: { query: query.trim() },
    })) as Instrument[];
  }

  async getAllStocksFromMarketTag(tag: string): Promise<Instrument[]> {
    this.requireAuth();
    const data = (await requestGet(this.session, urls.tags(tag))) as {
      instruments: string[];
    };
    const results: Instrument[] = [];
    for (const url of data.instruments ?? []) {
      results.push(await this.getInstrumentByUrl(url));
    }
    return results;
  }

  /**
   * Resolve a ticker to its one exact instrument. Unlike `findInstruments` (a
   * fuzzy search whose first hit may be a prefix or OTC/relisted duplicate of
   * the same symbol), this filters to an exact symbol match and, on ambiguity,
   * prefers the single active+tradable listing — so a watchlist or order write
   * can never silently target the wrong security. Throws on no match or when
   * the symbol remains ambiguous (never guesses).
   */
  async resolveInstrumentBySymbol(symbol: string): Promise<Instrument> {
    this.requireAuth();
    const sym = symbol.trim().toUpperCase();
    if (!sym) throw new Error("symbol must be a non-empty string");
    const hits = await this.findInstruments(sym);
    const exact = hits.filter((i) => i.symbol?.toUpperCase() === sym);
    if (exact.length === 0) {
      throw new NotFoundError(`No instrument matches symbol "${sym}"`);
    }
    if (exact.length === 1) return exact[0] as Instrument;
    const active = exact.filter(
      (i) => i.state === "active" && (i.tradeable === true || i.tradability === "tradable"),
    );
    if (active.length === 1) return active[0] as Instrument;
    throw new Error(
      `Ambiguous symbol "${sym}": ${exact.length} instruments share this ticker` +
        (active.length > 1 ? ` (${active.length} active)` : "") +
        " — refusing to guess.",
    );
  }

  /** All crypto currency pairs (id + asset code). Used to validate pair ids. */
  async getCurrencyPairs(): Promise<Array<{ id: string; asset_currency?: { code?: string } }>> {
    this.requireAuth();
    return (await requestGet(this.session, urls.cryptoCurrencyPairs(), {
      dataType: "results",
    })) as Array<{ id: string; asset_currency?: { code?: string } }>;
  }

  // ---------------------------------------------------------------------------
  // Watchlists (discovery/lists reads · midlands/lists writes)
  // ---------------------------------------------------------------------------

  /** The user's own watchlists (metadata only; items via getWatchlistItems). */
  async getWatchlists(): Promise<Watchlist[]> {
    this.requireAuth();
    return (await requestGet(this.session, urls.watchlistsDefault(), {
      dataType: "results",
    })) as Watchlist[];
  }

  /** Robinhood-curated lists the user can follow (paginated). */
  async getPopularWatchlists(): Promise<Watchlist[]> {
    this.requireAuth();
    return (await requestGet(this.session, urls.watchlistsPopular(), {
      dataType: "pagination",
    })) as Watchlist[];
  }

  /**
   * Items of a single watchlist, enriched by the API with symbol/name. Works
   * for both user-owned and curated lists. A non-existent list id surfaces as
   * a NotFoundError (the endpoint 404s); an empty list returns `[]`.
   */
  async getWatchlistItems(listId: string): Promise<WatchlistItem[]> {
    this.requireAuth();
    return (await requestGet(this.session, urls.watchlistItems(), {
      dataType: "results",
      params: { list_id: listId },
    })) as WatchlistItem[];
  }

  /** The user's options watchlist (the list allowing `option_strategy`), or null. */
  async getOptionWatchlist(): Promise<Watchlist | null> {
    const lists = await this.getWatchlists();
    return lists.find((l) => (l.allowed_object_types ?? []).includes("option_strategy")) ?? null;
  }

  /**
   * Add or remove items on a single watchlist (write). Deliberately
   * single-list, single-operation: the underlying `POST /midlands/lists/items/`
   * body is a per-list-id map whose entries each carry their own operation — a
   * bulk, mixed-mutation surface. This primitive builds that map internally
   * from exactly one list id and one operation, so multi-list or mixed
   * create/delete writes are never expressible from the client or MCP layer.
   * Returns the API echo (a confirmation of the request, not the new state).
   */
  async updateWatchlistItems(
    listId: string,
    operation: "create" | "delete",
    items: WatchlistItemRef[],
  ): Promise<Record<string, unknown>> {
    this.requireAuth();
    if (items.length === 0) throw new Error("items must be a non-empty array");
    const payload: Record<string, unknown> = {
      [listId]: items.map((it) => ({
        object_type: it.object_type,
        object_id: it.object_id,
        operation,
      })),
    };
    return (await requestPost(this.session, urls.watchlistItemsWrite(), {
      payload,
      asJson: true,
    })) as Record<string, unknown>;
  }

  /**
   * Create a new (empty) watchlist (write). `POST /midlands/lists/` with the
   * list object; the server fills the defaults (sort, colors, followed=false).
   * We send only the user-set fields (name, optional description/emoji). Returns
   * the created list (including its new `id`). Tier-2 write — the MCP layer
   * carries the confirm-before-calling directive + honest annotations.
   */
  async createWatchlist(
    displayName: string,
    opts?: { displayDescription?: string; iconEmoji?: string },
  ): Promise<Watchlist> {
    this.requireAuth();
    const name = displayName.trim();
    if (!name) throw new Error("displayName must be a non-empty string");
    const payload: Record<string, unknown> = {
      display_name: name,
      display_description: opts?.displayDescription ?? "",
    };
    if (opts?.iconEmoji != null) payload.icon_emoji = opts.iconEmoji;
    return (await requestPost(this.session, urls.watchlistsWrite(), {
      payload,
      asJson: true,
    })) as Watchlist;
  }

  /**
   * Update a watchlist's own metadata (write) — name / description / emoji.
   * `PATCH /midlands/lists/{id}/` with only the provided fields (a partial
   * update; omitted fields are left unchanged). Does NOT touch items (use
   * updateWatchlistItems for those). Returns the updated list. Tier-2 write.
   */
  async updateWatchlist(
    listId: string,
    updates: { displayName?: string; displayDescription?: string; iconEmoji?: string },
  ): Promise<Watchlist> {
    this.requireAuth();
    const payload: Record<string, unknown> = {};
    if (updates.displayName != null) {
      const name = updates.displayName.trim();
      if (!name) throw new Error("displayName, when provided, must be non-empty");
      payload.display_name = name;
    }
    if (updates.displayDescription != null)
      payload.display_description = updates.displayDescription;
    if (updates.iconEmoji != null) payload.icon_emoji = updates.iconEmoji;
    if (Object.keys(payload).length === 0) {
      throw new Error("provide at least one of: displayName, displayDescription, iconEmoji");
    }
    return (await requestPatch(this.session, urls.watchlistWrite(listId), {
      payload,
    })) as Watchlist;
  }

  /**
   * Delete one of the user's own watchlists (write). `DELETE /midlands/lists/{id}/`.
   * Deliberately NOT exposed as an MCP tool — the official Trading MCP has no
   * `delete_watchlist` (absence is the tier-3 gate, as with `delete_scan`). Kept
   * on the client for API completeness and to make the create-watchlist
   * integration test reversible.
   */
  async deleteWatchlist(listId: string): Promise<void> {
    this.requireAuth();
    await requestDelete(this.session, urls.watchlistWrite(listId));
  }

  /**
   * The caller's own profile uuid (`GET /user/`.id), cached per session. Used to
   * build the follow/unfollow URL — it is NOT a tool param and never surfaces in
   * a result (follow/unfollow report declaratively). Fetched at most once.
   */
  private async getUserId(): Promise<string> {
    if (this._userId) return this._userId;
    const profile = await this.getUserProfile();
    if (!profile.id) throw new Error("Could not resolve the current user's id from /user/.");
    this._userId = profile.id;
    return this._userId;
  }

  /**
   * Wrap a follow/unfollow write so any thrown error can never carry the profile
   * uuid: the request URL (which embeds `/followers/{uuid}/`) may appear in an
   * APIError message. We redact it at the source in addition to the tool-layer
   * output sanitizer (defense in depth).
   */
  private async runFollowWrite(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      throw new Error(redactTokens(e instanceof Error ? e.message : String(e)));
    }
  }

  /**
   * Follow a Robinhood-curated list (write). `POST /discovery/lists/{list_id}/
   * followers/{user_id}/` with an EMPTY `{}` JSON body → 201 (a no-body POST 500s).
   * The 201 echo is discarded; callers report declaratively. Tier-2 write.
   */
  async followWatchlist(listId: string): Promise<void> {
    this.requireAuth();
    const userId = await this.getUserId();
    await this.runFollowWrite(() =>
      requestPost(this.session, urls.watchlistFollower(listId, userId), {
        payload: {},
        asJson: true,
      }),
    );
  }

  /**
   * Stop following a curated list (write). `DELETE /discovery/lists/{list_id}/
   * followers/{user_id}/` → 204. The list itself is unchanged. Tier-2 write.
   */
  async unfollowWatchlist(listId: string): Promise<void> {
    this.requireAuth();
    const userId = await this.getUserId();
    await this.runFollowWrite(() =>
      requestDelete(this.session, urls.watchlistFollower(listId, userId)),
    );
  }

  /**
   * The single-leg option contracts on the user's options watchlist. Reads
   * `discovery/lists/items/` with `load_all_attributes=false` — the options
   * watchlist rejects the server's default (`true`) with HTTP 400, which is why
   * the generic `getWatchlistItems` can't be used for it. Returns [] when there
   * is no options watchlist. Each contract carries the minted `object_id`
   * (strategy id) and `strategy_code` (`"{option_id}_L1"` for a long single leg).
   */
  async getOptionWatchlistContracts(): Promise<OptionWatchlistContract[]> {
    this.requireAuth();
    const list = await this.getOptionWatchlist();
    if (!list?.id) return [];
    return (await requestGet(this.session, urls.watchlistItems(), {
      dataType: "results",
      params: { list_id: list.id, load_all_attributes: "false" },
    })) as OptionWatchlistContract[];
  }

  /**
   * Fetch one option instrument by id — used to VALIDATE a raw option_id before a
   * watchlist write (strict-on-writes: a bogus id must fail before it reaches the
   * list). Throws if the id is not a real option instrument.
   */
  async getOptionInstrumentById(optionId: string): Promise<OptionInstrument> {
    this.requireAuth();
    return (await requestGet(this.session, urls.optionInstrument(optionId))) as OptionInstrument;
  }

  /**
   * Add a single option contract to the options watchlist (write). `POST
   * /discovery/lists/items/quick_add/` MINTS a single-leg `option_strategy` from
   * the leg and auto-routes it to the options watchlist. NOT idempotent (a repeat
   * mints a duplicate row) — callers must dedupe against
   * `getOptionWatchlistContracts` first. `positionType` is "long" (only "long" is
   * supported over this path today). Returns the minted item echo. Tier-2 write.
   */
  async quickAddOption(optionId: string, positionType: "long" = "long"): Promise<unknown> {
    this.requireAuth();
    return await requestPost(this.session, urls.watchlistItemQuickAdd(), {
      payload: {
        legs: [{ option_id: optionId, position_type: positionType, ratio_quantity: 1 }],
        object_type: "option_strategy",
      },
      asJson: true,
    });
  }

  // ---------------------------------------------------------------------------
  // Tax lots (read)
  // ---------------------------------------------------------------------------

  /**
   * Open tax lots for one equity holding — `GET /tax_lots/open/{account}/{instrument}/`.
   * Each lot is a separate acquisition still held (quantity, cost basis, open date,
   * long/short-term). The symbol is resolved by EXACT match (a fuzzy hit would
   * return the wrong security's lots). All pages are collected internally; no
   * pagination cursor is surfaced (a tax-lots `next` URL embeds the account number).
   */
  async getEquityTaxLots(symbol: string, opts: { accountNumber: string }): Promise<TaxLot[]> {
    this.requireAuth();
    const instrument = await this.resolveInstrumentBySymbol(symbol);
    return (await requestGet(
      this.session,
      urls.equityTaxLotsOpen(opts.accountNumber, instrument.id),
      {
        dataType: "pagination",
        params: { sort_type: "date", sort_direction: "DESC", fetch_max_abs_values: "true" },
      },
    )) as TaxLot[];
  }

  // ---------------------------------------------------------------------------
  // Scanners / screeners (Beacon service)
  // ---------------------------------------------------------------------------

  /**
   * Catalog of scanner filter specs — the filters usable to build a scan
   * (RSI/MACD/EMA/… + fundamentals + IV/OI) with their predicates, units, and
   * supported lengths/intervals/plots. Account-agnostic.
   *
   * Served from an embedded static capture of the official Trading MCP's
   * `get_scanner_filter_specs` output, NOT a live REST read: the Beacon
   * filter-spec route isn't reachable with a standard token and its raw wire
   * shape differs from this DTO (see `scanner-filter-specs.ts` for the full
   * rationale and provenance). Async + auth-gated to match the rest of the
   * (authenticated) scanner surface and the client's uniform method contract.
   */
  async getScannerFilterSpecs(): Promise<ScannerFilterSpec[]> {
    this.requireAuth();
    return [...SCANNER_FILTER_SPECS];
  }

  /**
   * The user's saved scanners (screeners), as raw Beacon objects (camelCase
   * wire fields). `GET api.robinhood.com/beacon/scans/` → `{scans: [...]}`;
   * returns `[]` when the user has none. No params. The MCP layer derives the
   * faithful official fields and is explicit about the ones it cannot reproduce
   * — see `src/server/tools/scanners.ts`.
   */
  async getScans(): Promise<Scan[]> {
    this.requireAuth();
    const data = (await requestGet(this.session, urls.beaconScans())) as { scans?: unknown[] };
    return (data.scans ?? []) as Scan[];
  }

  // ---------------------------------------------------------------------------
  // Realized P&L (computed — no native equity/option REST endpoint)
  // ---------------------------------------------------------------------------

  /** Batch-resolve instrument ids → ticker symbols (chunked; account-agnostic). */
  private async resolveSymbolsByInstrumentIds(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const unique = [...new Set(ids.filter(Boolean))];
    const CHUNK = 50;
    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK);
      // `/instruments/?ids=` returns positional `null` entries for ids it can't resolve.
      const results = (await requestGet(this.session, urls.instruments(), {
        dataType: "pagination",
        params: { ids: chunk.join(",") },
      })) as Array<Instrument | null>;
      for (const inst of results) {
        if (inst?.id && inst.symbol) map.set(inst.id, inst.symbol);
      }
    }
    return map;
  }

  /** Native crypto realized trades from nummus `gain_loss` (reshape, not recomputed). */
  private async buildCryptoRealizedTrades(accountNumber?: string): Promise<RealizedPnlTrade[]> {
    const orders = await this.getAllCryptoOrders({ accountNumber });
    const realizing = orders.filter(
      (o) => o.state === "filled" && o.gain_loss != null && o.gain_loss !== "",
    );
    if (realizing.length === 0) return [];
    const pairs = await this.getCurrencyPairs();
    const codeById = new Map<string, string>();
    for (const p of pairs) {
      if (p.id && p.asset_currency?.code) codeById.set(p.id, p.asset_currency.code);
    }
    const out: RealizedPnlTrade[] = [];
    for (const o of realizing) {
      const symbol = o.currency_pair_id ? codeById.get(o.currency_pair_id) : undefined;
      const ts = o.last_transaction_at ?? o.updated_at ?? o.created_at;
      if (!symbol || !ts) continue;
      out.push({
        symbol,
        side: o.side ?? "sell",
        quantity: Number(o.cumulative_quantity ?? o.quantity ?? 0),
        price: Number(o.average_price ?? o.price ?? 0),
        realizedGain: Number(o.gain_loss),
        openedAt: null,
        closedAt: ts,
        assetClass: "crypto",
      });
    }
    return out;
  }

  /**
   * Realized profit & loss, COMPUTED from order history. There is no standard-token REST
   * endpoint for equity/option realized P&L (the app's PnL hub and the official MCP's
   * "Wormhole" both compute it; `/wormhole/*` returns 404).
   *
   * - **Equity**: matched FIFO from filled `/orders/` — independent *economic* FIFO including
   *   fees. This is NOT Robinhood's booked/tax-adjusted number: wash sales and non-FIFO lot
   *   selection are not modeled, and only long round-trips are matched (a sell exceeding
   *   accumulated buys — a short, a transfer-in, or an unadjusted split — is reported via
   *   `overrunSymbols` rather than emitting a wrong figure). Splits are not basis-adjusted.
   * - **Crypto**: native `gain_loss` on filled nummus orders (reshaped, not recomputed).
   * - **Options**: not computed (expirations/assignments live in the options events stream,
   *   not `/orders/`); pass `assetClasses` without `option`. The MCP layer notes the exclusion.
   *
   * Fetches the FULL order history regardless of any downstream time window, because a sell's
   * cost basis can depend on buys arbitrarily far back. May be slow for large accounts.
   */
  async getRealizedPnl(opts?: {
    accountNumber?: string;
    assetClasses?: Array<"equity" | "crypto">;
  }): Promise<RealizedPnlData> {
    this.requireAuth();
    const classes = new Set(opts?.assetClasses ?? ["equity", "crypto"]);
    const trades: RealizedPnlTrade[] = [];
    const overrunSymbols: string[] = [];

    if (classes.has("equity")) {
      const orders = await this.getAllStockOrders({ accountNumber: opts?.accountNumber });
      const filled = orders.filter(
        (o) => o.state === "filled" && Number(o.cumulative_quantity ?? 0) > 0 && o.instrument_id,
      );
      const symbolById = await this.resolveSymbolsByInstrumentIds(
        filled.map((o) => o.instrument_id as string),
      );
      const fills: Fill[] = [];
      for (const o of filled) {
        const symbol = symbolById.get(o.instrument_id as string);
        const side = o.side;
        const qty = Number(o.cumulative_quantity ?? 0);
        const price = Number(o.average_price ?? 0);
        const ts = o.last_transaction_at ?? o.updated_at ?? o.created_at;
        if (!symbol || (side !== "buy" && side !== "sell") || qty <= 0 || price <= 0 || !ts) {
          continue;
        }
        const fees =
          Number(o.fees ?? 0) +
          Number(o.sec_fees ?? 0) +
          Number(o.taf_fees ?? 0) +
          Number(o.cat_fees ?? 0);
        fills.push({ symbol, side, quantity: qty, price, fees, timestamp: ts });
      }
      const result = computeFifoRealized(fills);
      overrunSymbols.push(...result.overrunSymbols);
      for (const t of result.trades) {
        // Map only the declared RealizedPnlTrade fields (drop compute-internal
        // proceeds/costBasis) so the object matches its type exactly.
        trades.push({
          symbol: t.symbol,
          side: t.side,
          quantity: t.quantity,
          price: t.price,
          realizedGain: t.realizedGain,
          openedAt: t.openedAt,
          closedAt: t.closedAt,
          assetClass: "equity",
        });
      }
    }

    if (classes.has("crypto")) {
      trades.push(...(await this.buildCryptoRealizedTrades(opts?.accountNumber)));
    }

    trades.sort((a, b) => (a.closedAt < b.closedAt ? -1 : a.closedAt > b.closedAt ? 1 : 0));
    const totalRealizedGain = trades.reduce((s, t) => s + t.realizedGain, 0);
    return { trades, overrunSymbols: [...new Set(overrunSymbols)].sort(), totalRealizedGain };
  }

  // ---------------------------------------------------------------------------
  // Order review (Phase 3) — pre-trade simulation. Read-only: NOTHING is placed.
  // Composed from the app's own preflight GETs (order_checks/presubmit_data,
  // options collateral) plus a live quote; the price collar is reproduced from
  // the account's live `threshold_servars`. Account identifiers read from any
  // response body are scrubbed — only a caller-supplied account_number is ever
  // echoed (by the MCP layer).
  // ---------------------------------------------------------------------------

  /**
   * Simulate an equity order without placing it: echoes the order, attaches the
   * live quote (for cost visibility), and reproduces Robinhood's
   * "extremely marketable / unmarketable" price collar from the account's live
   * presubmit thresholds. `order_checks` is `{}` only when the collar ran and
   * found no problem — `evaluated_checks`/`not_evaluated_checks` say which
   * criteria actually ran, so an empty `order_checks` is never read as a blanket
   * "all clear". The servars are runtime-parsed; on a shape change the affected
   * criteria degrade to `not_evaluated` (never a false pass).
   */
  async reviewEquityOrder(opts: {
    symbol: string;
    side: "buy" | "sell";
    quantity: number;
    limitPrice?: number;
    stopPrice?: number;
    accountNumber?: string;
  }): Promise<EquityOrderReview> {
    this.requireAuth();
    const sym = opts.symbol.trim().toUpperCase();
    if (!sym) throw new Error("symbol must be a non-empty string");
    if (!(opts.quantity > 0) || !Number.isFinite(opts.quantity)) {
      throw new Error("quantity must be a positive finite number");
    }
    const inst = await this.resolveInstrumentBySymbol(sym);
    const accountNumber = await this.resolveAccountNumber(opts.accountNumber);

    const [presubmit, quotes] = await Promise.all([
      requestGet(this.session, urls.equityOrderCheckPresubmit(), {
        params: { account_number: accountNumber, instrument: inst.id },
      }) as Promise<Record<string, unknown>>,
      this.getQuotes([sym]),
    ]);

    const quote = quotes[0] ?? null;
    // Runtime-parse the collar servars: a silent shape change must not become a
    // false "no alert". On failure the collar sees no thresholds → not_evaluated.
    const parsed = ThresholdServarsSchema.safeParse(presubmit.threshold_servars ?? {});
    const thresholds = parsed.success ? parsed.data : {};

    const orderType: ReviewOrderType = deriveOrderType(opts.limitPrice, opts.stopPrice);
    const collar = evaluateEquityCollar({
      side: opts.side,
      orderType,
      limitPrice: opts.limitPrice ?? null,
      stopPrice: opts.stopPrice ?? null,
      refs: {
        lastTradePrice: quote?.last_trade_price != null ? Number(quote.last_trade_price) : null,
        bidPrice: quote?.bid_price != null ? Number(quote.bid_price) : null,
        askPrice: quote?.ask_price != null ? Number(quote.ask_price) : null,
      },
      thresholds,
    });

    const notEvaluated = [...collar.notEvaluated];
    if (!parsed.success) {
      notEvaluated.push("price_collar (presubmit threshold_servars failed validation)");
    }

    return {
      symbol: sym,
      side: opts.side,
      type: orderType,
      quantity: opts.quantity,
      limit_price: opts.limitPrice ?? null,
      stop_price: opts.stopPrice ?? null,
      order_checks: collar.orderChecks,
      evaluated_checks: collar.evaluated,
      not_evaluated_checks: notEvaluated,
      quote,
      quote_timestamp: quote?.updated_at ?? null,
    };
  }

  /**
   * Simulate a single- or multi-leg option order without placing it: echoes the
   * order with per-leg market data (mark/bid/ask/greeks) and the collateral the
   * order would require. The reproduced check set is deliberately thin (options
   * have no simple last-trade collar) — `not_evaluated_checks` names what was
   * NOT run so nothing is read as a blanket clearance. Collateral has its
   * account identifiers scrubbed.
   */
  async reviewOptionOrder(opts: {
    symbol: string;
    legs: Array<{
      expirationDate: string;
      strike: number;
      optionType: "call" | "put";
      side: "buy" | "sell";
      positionEffect: "open" | "close";
      ratioQuantity?: number;
    }>;
    price: number;
    quantity: number;
    direction: "debit" | "credit";
    accountNumber?: string;
  }): Promise<OptionOrderReview> {
    this.requireAuth();
    const sym = opts.symbol.trim().toUpperCase();
    if (!sym) throw new Error("symbol must be a non-empty string");
    if (opts.legs.length === 0) throw new Error("at least one leg is required");
    if (!(opts.quantity > 0) || !Number.isFinite(opts.quantity)) {
      throw new Error("quantity must be a positive finite number");
    }
    const accountNumber = await this.resolveAccountNumber(opts.accountNumber);
    const chain = await this.getChains(sym);

    // Per-leg market data (best-effort; a leg that won't resolve stays null).
    const legs: OptionOrderReviewLeg[] = [];
    for (const leg of opts.legs) {
      let market: OptionMarketData | null = null;
      try {
        const md = await this.getOptionMarketData(
          sym,
          leg.expirationDate,
          leg.strike,
          leg.optionType,
        );
        market = md[0] ?? null;
      } catch {
        market = null;
      }
      legs.push({
        expiration_date: leg.expirationDate,
        strike: leg.strike,
        option_type: leg.optionType,
        side: leg.side,
        position_effect: leg.positionEffect,
        ratio_quantity: leg.ratioQuantity ?? 1,
        market_data: market,
      });
    }

    // Collateral for the chain (scrub account identifiers before surfacing).
    let collateral: Record<string, unknown> | null = null;
    if (chain.id) {
      try {
        const raw = (await requestGet(this.session, urls.optionChainCollateral(chain.id), {
          params: { account_number: accountNumber },
        })) as Record<string, unknown>;
        collateral = scrubAccountIdentifiers(raw);
      } catch {
        collateral = null;
      }
    }

    return {
      symbol: sym,
      direction: opts.direction,
      price: opts.price,
      quantity: opts.quantity,
      legs,
      collateral,
      order_checks: {},
      evaluated_checks: [],
      not_evaluated_checks: [
        "price_collar (option limit-price collar is not reproduced — options have no simple last-trade collar)",
        "max_contracts / wide_bid_ask_spread (option presubmit thresholds not applied in this build)",
      ],
      quote_timestamp: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeSymbols(symbols: string | string[]): string[] {
  if (typeof symbols === "string") {
    return symbols
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  }
  return symbols.map((s) => s.trim().toUpperCase());
}

/** Shift a YYYY-MM-DD date by `days` (negative = earlier), returning YYYY-MM-DD (UTC). */
function isoAddDays(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`) + days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Parse a strict YYYY-MM-DD date to epoch ms (UTC); throws on a malformed or non-calendar date. */
function parseIsoDateMs(iso: string, label: string): number {
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? Date.parse(`${iso}T00:00:00Z`) : Number.NaN;
  // `Date.parse` rolls impossible days forward (e.g. 2026-02-30 → 2026-03-02), so
  // require the parsed instant to render back to the same string — a real date.
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== iso) {
    throw new Error(`Invalid ${label}: expected a YYYY-MM-DD calendar date, got "${iso}"`);
  }
  return ms;
}
