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
  Fundamental,
  HistoricalDataPoint,
  Holding,
  IndexInstrument,
  IndexValue,
  Instrument,
  InvestmentProfile,
  LoginResult,
  MarketHours,
  News,
  OptionChain,
  OptionInstrument,
  OptionMarketData,
  OptionOrder,
  OptionPosition,
  Portfolio,
  Position,
  Quote,
  Rating,
  ShortInterest,
  ShortInterestDaily,
  StockHistorical,
  StockOrder,
  UserProfile,
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
  NewsSchema,
  OptionChainSchema,
  OptionInstrumentSchema,
  OptionMarketDataSchema,
  OptionOrderSchema,
  OptionPositionSchema,
  PortfolioSchema,
  PositionSchema,
  QuoteSchema,
  RatingSchema,
  ShortInterestDailySchema,
  ShortInterestSchema,
  StockHistoricalSchema,
  StockOrderSchema,
  UserProfileSchema,
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
