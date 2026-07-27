/**
 * robinhood-for-agents client — TypeScript Robinhood API client.
 *
 * Usage:
 *   import { RobinhoodClient } from "robinhood-for-agents";
 *
 *   const client = new RobinhoodClient();
 *   await client.restoreSession();
 *   console.log(await client.getQuotes(["AAPL"]));
 *
 * Or use the module-level singleton:
 *
 *   import { getClient } from "robinhood-for-agents";
 *
 *   const rh = getClient();
 *   await rh.restoreSession();
 *   console.log(await rh.getQuotes(["AAPL"]));
 */

export { RobinhoodClient } from "./client.js";
export {
  APIError,
  AuthenticationError,
  NotFoundError,
  NotLoggedInError,
  RateLimitError,
  RobinhoodError,
  TokenExpiredError,
} from "./errors.js";
export { parseArray, parseOne } from "./http.js";
export {
  SCANNER_FILTER_SPECS,
  SCANNER_FILTER_SPECS_CAPTURED_AT,
} from "./scanner-filter-specs.js";
export {
  createTokenStore,
  EncryptedFileTokenStore,
  KeychainTokenStore,
  type TokenData,
  type TokenStore,
} from "./token-store.js";

export type {
  Account,
  CryptoOrder,
  CryptoPair,
  CryptoPosition,
  CryptoQuote,
  DataType,
  Dividend,
  Earnings,
  EquityOrderReview,
  Fundamental,
  HistoricalDataPoint,
  Holding,
  IndexInstrument,
  IndexValue,
  Instrument,
  InvestmentProfile,
  LoginResult,
  MarketHours,
  Money,
  News,
  OptionAggregatePosition,
  OptionChain,
  OptionHistorical,
  OptionHistoricalPoint,
  OptionInstrument,
  OptionMarketData,
  OptionOrder,
  OptionOrderReview,
  OptionOrderReviewLeg,
  OptionPosition,
  OptionWatchlistContract,
  OrderMarketHours,
  Portfolio,
  PortfolioLive,
  Position,
  PriceBook,
  PriceBookEntry,
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
  WatchlistObjectType,
} from "./types.js";

export {
  AccountSchema,
  CryptoOrderSchema,
  CryptoPairSchema,
  CryptoPositionSchema,
  CryptoQuoteSchema,
  DividendSchema,
  EarningsSchema,
  FundamentalSchema,
  HistoricalDataPointSchema,
  HoldingSchema,
  IndexInstrumentSchema,
  IndexValueSchema,
  InstrumentSchema,
  InvestmentProfileSchema,
  MarketHoursSchema,
  MoneySchema,
  NewsSchema,
  OptionAggregatePositionSchema,
  OptionChainSchema,
  OptionHistoricalPointSchema,
  OptionHistoricalSchema,
  OptionInstrumentSchema,
  OptionMarketDataSchema,
  OptionOrderSchema,
  OptionPositionSchema,
  OptionWatchlistContractSchema,
  PortfolioLiveSchema,
  PortfolioSchema,
  PositionSchema,
  PriceBookEntrySchema,
  PriceBookSchema,
  QuoteSchema,
  RatingSchema,
  ScanConfigurationSchema,
  ScannerFilterSpecSchema,
  ScanSchema,
  ShortInterestDailySchema,
  ShortInterestSchema,
  StockHistoricalSchema,
  StockOrderSchema,
  TaxLotSchema,
  UnifiedPortfolioSchema,
  UserProfileSchema,
  WatchlistItemSchema,
  WatchlistSchema,
} from "./types.js";

import type { LoginResult } from "./auth.js";
import { RobinhoodClient } from "./client.js";

let _defaultClient: RobinhoodClient | null = null;

export function getClient(): RobinhoodClient {
  if (!_defaultClient) {
    _defaultClient = new RobinhoodClient();
  }
  return _defaultClient;
}

export async function restoreSession(): Promise<LoginResult> {
  return getClient().restoreSession();
}
