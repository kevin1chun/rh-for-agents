/**
 * Zod schemas and TypeScript types for Robinhood API responses.
 *
 * Prices and quantities are strings (not numbers) because
 * Robinhood returns them as fixed-precision strings for accuracy.
 */

import { z } from "zod";

export type { LoginResult } from "./auth.js";
// Re-export types defined in other modules for single-barrel access via index.ts
export type { DataType } from "./http.js";
export type { TokenData } from "./token-store.js";

// ---------------------------------------------------------------------------
// Accounts & Profiles
// ---------------------------------------------------------------------------

export const AccountSchema = z.object({
  url: z.string(),
  account_number: z.string(),
  type: z.string(),
  cash: z.string().optional(),
  buying_power: z.string().optional(),
  crypto_buying_power: z.string().optional(),
  cash_available_for_withdrawal: z.string().optional(),
  portfolio_cash: z.string().optional(),
  can_downgrade_to_cash: z.string().optional(),
});
export type Account = z.infer<typeof AccountSchema>;

export const PortfolioSchema = z.object({
  equity: z.string().nullable(),
  market_value: z.string().nullable(),
  excess_margin: z.string().nullable().optional(),
  extended_hours_equity: z.string().nullable().optional(),
  extended_hours_market_value: z.string().nullable().optional(),
  last_core_equity: z.string().nullable().optional(),
  last_core_market_value: z.string().nullable().optional(),
});
export type Portfolio = z.infer<typeof PortfolioSchema>;

export const UserProfileSchema = z.object({
  username: z.string(),
  email: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  id_info: z.string().optional(),
  url: z.string().optional(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const InvestmentProfileSchema = z.object({
  risk_tolerance: z.string().optional(),
  total_net_worth: z.string().optional(),
  annual_income: z.string().optional(),
  liquid_net_worth: z.string().optional(),
  investment_experience: z.string().optional(),
  investment_objective: z.string().optional(),
  source_of_funds: z.string().optional(),
  time_horizon: z.string().optional(),
  liquidity_needs: z.string().optional(),
  tax_bracket: z.string().optional(),
});
export type InvestmentProfile = z.infer<typeof InvestmentProfileSchema>;

// ---------------------------------------------------------------------------
// Positions & Holdings
// ---------------------------------------------------------------------------

export const PositionSchema = z.object({
  instrument: z.string(),
  quantity: z.string(),
  average_buy_price: z.string(),
  account_number: z.string().optional(),
  intraday_quantity: z.string().optional(),
  intraday_average_buy_price: z.string().optional(),
  shares_held_for_buys: z.string().optional(),
  shares_held_for_sells: z.string().optional(),
  shares_available_for_exercise: z.string().optional(),
  url: z.string().optional(),
});
export type Position = z.infer<typeof PositionSchema>;

export const HoldingSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  quantity: z.string(),
  average_buy_price: z.string(),
  price: z.string(),
  equity: z.string(),
  percent_change: z.string().optional(),
  equity_change: z.string().optional(),
  pe_ratio: z.string().nullable().optional(),
  dividend_rate: z.string().nullable().optional(),
});
export type Holding = z.infer<typeof HoldingSchema>;

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------

export const InstrumentSchema = z.object({
  url: z.string(),
  id: z.string(),
  symbol: z.string(),
  simple_name: z.string().nullable().optional(),
  name: z.string(),
  type: z.string(),
  tradability: z.string().optional(),
  tradeable: z.boolean().optional(),
  country: z.string().optional(),
  market: z.string().optional(),
});
export type Instrument = z.infer<typeof InstrumentSchema>;

// ---------------------------------------------------------------------------
// Quotes & Fundamentals
// ---------------------------------------------------------------------------

export const QuoteSchema = z.object({
  symbol: z.string(),
  last_trade_price: z.string().nullable(),
  ask_price: z.string().nullable(),
  bid_price: z.string().nullable(),
  adjusted_previous_close: z.string().nullable().optional(),
  previous_close: z.string().nullable().optional(),
  pe_ratio: z.string().nullable().optional(),
  last_extended_hours_trade_price: z.string().nullable().optional(),
  trading_halted: z.boolean().optional(),
  has_traded: z.boolean().optional(),
  updated_at: z.string().optional(),
});
export type Quote = z.infer<typeof QuoteSchema>;

export const FundamentalSchema = z.object({
  symbol: z.string().optional(),
  instrument: z.string().nullable().optional(),
  // Today's session OHLCV (which session is selected by the `bounds` field)
  open: z.string().nullable().optional(),
  high: z.string().nullable().optional(),
  low: z.string().nullable().optional(),
  volume: z.string().nullable().optional(),
  overnight_volume: z.string().nullable().optional(),
  market_date: z.string().nullable().optional(),
  bounds: z.string().nullable().optional(),
  // Trailing volume averages
  average_volume: z.string().nullable().optional(),
  average_volume_2_weeks: z.string().nullable().optional(),
  average_volume_30_days: z.string().nullable().optional(),
  // 52-week range (with the date each extreme was set)
  high_52_weeks: z.string().nullable().optional(),
  high_52_weeks_date: z.string().nullable().optional(),
  low_52_weeks: z.string().nullable().optional(),
  low_52_weeks_date: z.string().nullable().optional(),
  // Valuation & capitalization
  market_cap: z.string().nullable().optional(),
  pe_ratio: z.string().nullable().optional(),
  pb_ratio: z.string().nullable().optional(),
  shares_outstanding: z.string().nullable().optional(),
  float: z.string().nullable().optional(),
  // Dividend schedule
  dividend_yield: z.string().nullable().optional(),
  dividend_per_share: z.string().nullable().optional(),
  distribution_frequency: z.string().nullable().optional(),
  payable_date: z.string().nullable().optional(),
  ex_dividend_date: z.string().nullable().optional(),
  record_date: z.string().nullable().optional(),
  // Financial-status indicator (pair the code with its description; never surface the code alone)
  financial_status_indicator: z.string().nullable().optional(),
  financial_status_description: z.string().nullable().optional(),
  // Company profile
  description: z.string().nullable().optional(),
  ceo: z.string().nullable().optional(),
  headquarters_city: z.string().nullable().optional(),
  headquarters_state: z.string().nullable().optional(),
  sector: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  num_employees: z.number().nullable().optional(),
  year_founded: z.number().nullable().optional(),
});
export type Fundamental = z.infer<typeof FundamentalSchema>;

// ---------------------------------------------------------------------------
// Historicals
// ---------------------------------------------------------------------------

export const HistoricalDataPointSchema = z.object({
  begins_at: z.string(),
  open_price: z.string().nullable().optional(),
  close_price: z.string().nullable().optional(),
  high_price: z.string().nullable().optional(),
  low_price: z.string().nullable().optional(),
  volume: z.number().optional(),
  interpolated: z.boolean().optional(),
  session: z.string().optional(),
});
export type HistoricalDataPoint = z.infer<typeof HistoricalDataPointSchema>;

export const StockHistoricalSchema = z.object({
  symbol: z.string(),
  historicals: z.array(HistoricalDataPointSchema),
  bounds: z.string().optional(),
  span: z.string().optional(),
  interval: z.string().optional(),
});
export type StockHistorical = z.infer<typeof StockHistoricalSchema>;

// ---------------------------------------------------------------------------
// News, Ratings, Earnings
// ---------------------------------------------------------------------------

export const NewsSchema = z.object({
  title: z.string(),
  source: z.string().optional(),
  published_at: z.string().optional(),
  url: z.string().optional(),
  summary: z.string().optional(),
  preview_image_url: z.string().nullable().optional(),
  relay_url: z.string().optional(),
  api_source: z.string().optional(),
});
export type News = z.infer<typeof NewsSchema>;

export const RatingSchema = z.object({
  summary: z
    .object({
      num_buy_ratings: z.number().optional(),
      num_hold_ratings: z.number().optional(),
      num_sell_ratings: z.number().optional(),
    })
    .optional(),
  ratings: z
    .array(
      z.object({
        published_at: z.string().optional(),
        type: z.string().optional(),
        text: z.string().optional(),
      }),
    )
    .optional(),
  instrument_id: z.string().optional(),
});
export type Rating = z.infer<typeof RatingSchema>;

export const EarningsSchema = z.object({
  symbol: z.string().optional(),
  report: z
    .object({
      date: z.string().optional(),
      timing: z.string().optional(),
      verified: z.boolean().optional(),
    })
    .optional(),
  estimate: z.string().nullable().optional(),
  actual: z.string().nullable().optional(),
  year: z.number().optional(),
  quarter: z.number().optional(),
});
export type Earnings = z.infer<typeof EarningsSchema>;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export const OptionChainSchema = z.object({
  id: z.string(),
  expiration_dates: z.array(z.string()),
  symbol: z.string().optional(),
  can_open_position: z.boolean().optional(),
  underlying_instruments: z
    .array(
      z.object({
        id: z.string().optional(),
        instrument: z.string().optional(),
        quantity: z.number().optional(),
      }),
    )
    .optional(),
  min_ticks: z
    .object({
      above_tick: z.string().optional(),
      below_tick: z.string().optional(),
      cutoff_price: z.string().optional(),
    })
    .optional(),
});
export type OptionChain = z.infer<typeof OptionChainSchema>;

export const OptionInstrumentSchema = z.object({
  url: z.string(),
  id: z.string(),
  type: z.string(),
  strike_price: z.string(),
  expiration_date: z.string(),
  state: z.string().optional(),
  tradability: z.string().optional(),
  chain_id: z.string().optional(),
  chain_symbol: z.string().optional(),
  issue_date: z.string().optional(),
});
export type OptionInstrument = z.infer<typeof OptionInstrumentSchema>;

export const OptionMarketDataSchema = z.object({
  implied_volatility: z.string().nullable().optional(),
  delta: z.string().nullable().optional(),
  gamma: z.string().nullable().optional(),
  theta: z.string().nullable().optional(),
  vega: z.string().nullable().optional(),
  rho: z.string().nullable().optional(),
  mark_price: z.string().nullable().optional(),
  ask_price: z.string().nullable().optional(),
  bid_price: z.string().nullable().optional(),
  high_price: z.string().nullable().optional(),
  low_price: z.string().nullable().optional(),
  last_trade_price: z.string().nullable().optional(),
  open_interest: z.number().optional(),
  volume: z.number().optional(),
  chance_of_profit_short: z.string().nullable().optional(),
  chance_of_profit_long: z.string().nullable().optional(),
  break_even_price: z.string().nullable().optional(),
});
export type OptionMarketData = z.infer<typeof OptionMarketDataSchema>;

export const OptionPositionSchema = z.object({
  url: z.string().optional(),
  option: z.string().optional(),
  quantity: z.string().optional(),
  average_price: z.string().optional(),
  type: z.string().optional(),
  chain_id: z.string().optional(),
  chain_symbol: z.string().optional(),
});
export type OptionPosition = z.infer<typeof OptionPositionSchema>;

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

export const IndexInstrumentSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  simple_name: z.string().nullable().optional(),
  state: z.string().optional(),
  tradable_chain_ids: z.array(z.string()).optional(),
});
export type IndexInstrument = z.infer<typeof IndexInstrumentSchema>;

export const IndexValueSchema = z.object({
  value: z.string().nullable().optional(),
  symbol: z.string().optional(),
  instrument_id: z.string().optional(),
  updated_at: z.string().optional(),
});
export type IndexValue = z.infer<typeof IndexValueSchema>;

// ---------------------------------------------------------------------------
// Stock Orders
// ---------------------------------------------------------------------------

const NotionalSchema = z
  .object({
    amount: z.string().optional(),
    currency_code: z.string().optional(),
    currency_id: z.string().optional(),
  })
  .nullable()
  .optional();

export const StockOrderSchema = z.object({
  id: z.string(),
  ref_id: z.string().optional(),
  url: z.string().optional(),
  cancel: z.string().nullable().optional(),
  account: z.string().optional(),
  user_uuid: z.string().optional(),
  position: z.string().optional(),
  instrument: z.string().optional(),
  instrument_id: z.string().optional(),
  symbol: z.string().optional(),
  state: z.string(),
  derived_state: z.string().optional(),
  side: z.string().optional(),
  type: z.string().optional(),
  trigger: z.string().optional(),
  quantity: z.string().optional(),
  price: z.string().nullable().optional(),
  stop_price: z.string().nullable().optional(),
  average_price: z.string().nullable().optional(),
  cumulative_quantity: z.string().optional(),
  time_in_force: z.string().optional(),
  extended_hours: z.boolean().optional(),
  market_hours: z.string().optional(),
  fees: z.string().optional(),
  sec_fees: z.string().optional(),
  taf_fees: z.string().optional(),
  cat_fees: z.string().optional(),
  sales_taxes: z.array(z.record(z.string(), z.unknown())).optional(),
  executions: z.array(z.record(z.string(), z.unknown())).optional(),
  total_notional: NotionalSchema,
  executed_notional: NotionalSchema,
  dollar_based_amount: z.string().nullable().optional(),
  requested_notional_amount: z.string().nullable().optional(),
  trailing_peg: z
    .object({
      type: z.string().optional(),
      percentage: z.string().optional(),
      price: z.object({ amount: z.string().optional() }).optional(),
    })
    .nullable()
    .optional(),
  last_trail_price: z.string().nullable().optional(),
  last_trail_price_source: z.string().nullable().optional(),
  last_trail_price_updated_at: z.string().nullable().optional(),
  preset_percent_limit: z.string().nullable().optional(),
  order_form_version: z.number().nullable().optional(),
  order_form_type: z.string().nullable().optional(),
  last_transaction_at: z.string().nullable().optional(),
  last_update_version: z.number().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  stop_triggered_at: z.string().nullable().optional(),
  reject_reason: z.string().nullable().optional(),
  response_category: z.string().nullable().optional(),
  placed_agent: z.string().nullable().optional(),
  position_effect: z.string().nullable().optional(),
  replaces: z.string().nullable().optional(),
  pending_cancel_open_agent: z.string().nullable().optional(),
  user_cancel_request_state: z.string().nullable().optional(),
  tax_lot_selection_type: z.string().nullable().optional(),
  override_dtbp_checks: z.boolean().optional(),
  override_day_trade_checks: z.boolean().optional(),
  investment_schedule_id: z.string().nullable().optional(),
  is_ipo_access_order: z.boolean().optional(),
  is_ipo_access_price_finalized: z.boolean().optional(),
  has_ipo_access_custom_price_limit: z.boolean().optional(),
  ipo_access_cancellation_reason: z.string().nullable().optional(),
  ipo_access_lower_collared_price: z.string().nullable().optional(),
  ipo_access_upper_collared_price: z.string().nullable().optional(),
  ipo_access_upper_price: z.string().nullable().optional(),
  ipo_access_lower_price: z.string().nullable().optional(),
  is_visible_to_user: z.boolean().optional(),
  is_primary_account: z.boolean().optional(),
  is_editable: z.boolean().optional(),
});
export type StockOrder = z.infer<typeof StockOrderSchema>;

// ---------------------------------------------------------------------------
// Option Orders
// ---------------------------------------------------------------------------

export const OptionOrderSchema = z.object({
  id: z.string(),
  cancel_url: z.string().nullable().optional(),
  state: z.string(),
  direction: z.string().optional(),
  premium: z.string().nullable().optional(),
  price: z.string().nullable().optional(),
  quantity: z.string().optional(),
  type: z.string().optional(),
  trigger: z.string().optional(),
  stop_price: z.string().nullable().optional(),
  time_in_force: z.string().optional(),
  strategy: z.string().nullable().optional(),
  opening_strategy: z.string().nullable().optional(),
  closing_strategy: z.string().nullable().optional(),
  legs: z
    .array(
      z.object({
        option: z.string().optional(),
        side: z.string().optional(),
        position_effect: z.string().optional(),
        ratio_quantity: z.number().optional(),
        expiration_date: z.string().optional(),
        strike_price: z.string().optional(),
        option_type: z.string().optional(),
      }),
    )
    .optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  ref_id: z.string().optional(),
  chain_symbol: z.string().optional(),
});
export type OptionOrder = z.infer<typeof OptionOrderSchema>;

// ---------------------------------------------------------------------------
// Crypto
// ---------------------------------------------------------------------------

export const CryptoPairSchema = z.object({
  id: z.string(),
  asset_currency: z.object({ code: z.string(), name: z.string().optional() }).optional(),
  display_name: z.string().optional(),
  symbol: z.string().optional(),
  tradability: z.string().optional(),
});
export type CryptoPair = z.infer<typeof CryptoPairSchema>;

export const CryptoQuoteSchema = z.object({
  mark_price: z.string().nullable().optional(),
  ask_price: z.string().nullable().optional(),
  bid_price: z.string().nullable().optional(),
  high_price: z.string().nullable().optional(),
  low_price: z.string().nullable().optional(),
  open_price: z.string().nullable().optional(),
  volume: z.string().nullable().optional(),
  symbol: z.string().optional(),
  id: z.string().optional(),
});
export type CryptoQuote = z.infer<typeof CryptoQuoteSchema>;

export const CryptoPositionSchema = z.object({
  currency: z.object({ code: z.string(), name: z.string().optional() }),
  quantity_available: z.string().optional(),
  quantity: z.string().optional(),
  cost_bases: z.array(z.object({ direct_cost_basis: z.string().optional() })).optional(),
  id: z.string().optional(),
});
export type CryptoPosition = z.infer<typeof CryptoPositionSchema>;

export const CryptoOrderSchema = z.object({
  id: z.string(),
  state: z.string(),
  side: z.string().optional(),
  quantity: z.string().optional(),
  price: z.string().nullable().optional(),
  type: z.string().optional(),
  currency_pair_id: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  cumulative_quantity: z.string().optional(),
});
export type CryptoOrder = z.infer<typeof CryptoOrderSchema>;

// ---------------------------------------------------------------------------
// Markets & Dividends
// ---------------------------------------------------------------------------

export const MarketHoursSchema = z.object({
  is_open: z.boolean(),
  opens_at: z.string().nullable().optional(),
  closes_at: z.string().nullable().optional(),
  extended_opens_at: z.string().nullable().optional(),
  extended_closes_at: z.string().nullable().optional(),
  date: z.string().optional(),
});
export type MarketHours = z.infer<typeof MarketHoursSchema>;

export const DividendSchema = z.object({
  id: z.string().optional(),
  url: z.string().optional(),
  amount: z.string().optional(),
  rate: z.string().optional(),
  position: z.string().optional(),
  instrument: z.string().optional(),
  payable_date: z.string().nullable().optional(),
  record_date: z.string().nullable().optional(),
  state: z.string().optional(),
});
export type Dividend = z.infer<typeof DividendSchema>;
