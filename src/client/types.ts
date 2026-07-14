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
  // Identity / references
  user: z.string().nullable().optional(),
  user_id: z.string().nullable().optional(),
  brokerage_account_type: z.string().nullable().optional(),
  rhs_account_number: z.number().nullable().optional(),
  active_subscription_id: z.string().nullable().optional(),
  ref_id: z.string().nullable().optional(),
  nickname: z.string().nullable().optional(),
  affiliate: z.string().nullable().optional(),
  // Timestamps
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  car_valid_until: z.string().nullable().optional(),
  // Flags / lifecycle state
  state: z.string().nullable().optional(),
  deactivated: z.boolean().nullable().optional(),
  permanently_deactivated: z.boolean().nullable().optional(),
  deposit_halted: z.boolean().nullable().optional(),
  withdrawal_halted: z.boolean().nullable().optional(),
  only_position_closing_trades: z.boolean().nullable().optional(),
  locked: z.boolean().nullable().optional(),
  received_ach_debit_locked: z.boolean().nullable().optional(),
  ipo_access_restricted: z.boolean().nullable().optional(),
  ipo_access_restricted_reason: z.string().nullable().optional(),
  disable_adt: z.boolean().nullable().optional(),
  is_default: z.boolean().nullable().optional(),
  is_original: z.boolean().nullable().optional(),
  is_pinnacle_account: z.boolean().nullable().optional(),
  has_futures_account: z.boolean().nullable().optional(),
  second_trade_suitability_completed: z.boolean().nullable().optional(),
  // Trading locks / permissions
  equity_trading_lock: z.string().nullable().optional(),
  option_trading_lock: z.string().nullable().optional(),
  option_level: z.string().nullable().optional(),
  option_trading_on_expiration_enabled: z.boolean().nullable().optional(),
  management_type: z.string().nullable().optional(),
  // Fractionals / DRIP / cash management
  drip_enabled: z.boolean().nullable().optional(),
  eligible_for_fractionals: z.boolean().nullable().optional(),
  eligible_for_drip: z.boolean().nullable().optional(),
  eligible_for_cash_management: z.boolean().nullable().optional(),
  cash_management_enabled: z.boolean().nullable().optional(),
  fractional_position_closing_only: z.boolean().nullable().optional(),
  // Sweep
  sweep_enabled: z.boolean().nullable().optional(),
  sweep_enrolled: z.boolean().nullable().optional(),
  // Cash / balance fields
  onbp: z.string().nullable().optional(),
  cash_available_for_withdrawal_without_margin: z.string().nullable().optional(),
  amount_eligible_for_deposit_cancellation: z.string().nullable().optional(),
  cash_held_for_orders: z.string().nullable().optional(),
  uncleared_deposits: z.string().nullable().optional(),
  sma: z.string().nullable().optional(),
  sma_held_for_orders: z.string().nullable().optional(),
  unsettled_funds: z.string().nullable().optional(),
  unsettled_debit: z.string().nullable().optional(),
  max_ach_early_access_amount: z.string().nullable().optional(),
  cash_held_for_options_collateral: z.string().nullable().optional(),
  dynamic_instant_limit: z.string().nullable().optional(),
  user_real_instant_limit: z.string().nullable().optional(),
  user_dynamic_instant_limit: z.string().nullable().optional(),
  cash_available_trading_only: z.boolean().nullable().optional(),
  cash_available_trading_only_expiry_date: z.string().nullable().optional(),
  cash_balances: z.unknown().nullable().optional(),
  // Agentic
  agentic_allowed: z.boolean().nullable().optional(),
  agentic_audience: z.string().nullable().optional(),
  group_id: z.string().nullable().optional(),
  group_type: z.string().nullable().optional(),
  // Nested: margin balances
  margin_balances: z
    .object({
      sma: z.string().nullable().optional(),
      day_trade_buying_power_held_for_orders: z.string().nullable().optional(),
      start_of_day_dtbp: z.string().nullable().optional(),
      overnight_buying_power_held_for_orders: z.string().nullable().optional(),
      leverage_enabled: z.boolean().nullable().optional(),
      intraday_leverage_enabled: z.boolean().nullable().optional(),
      unsettled_funds: z.string().nullable().optional(),
      unsettled_debit: z.string().nullable().optional(),
      cash_held_for_crypto_orders: z.string().nullable().optional(),
      cash_held_for_dividends: z.string().nullable().optional(),
      cash_held_for_restrictions: z.string().nullable().optional(),
      cash_held_for_options_collateral: z.string().nullable().optional(),
      cash_held_for_orders: z.string().nullable().optional(),
      eligible_deposit_as_instant: z.string().nullable().optional(),
      instant_used: z.string().nullable().optional(),
      outstanding_interest: z.string().nullable().optional(),
      pending_debit_card_debits: z.string().nullable().optional(),
      settled_amount_borrowed: z.string().nullable().optional(),
      short_cash: z.string().nullable().optional(),
      short_cash_held: z.string().nullable().optional(),
      short_unsettled_debit: z.string().nullable().optional(),
      short_unsettled_credit: z.string().nullable().optional(),
      uncleared_deposits: z.string().nullable().optional(),
      cash: z.string().nullable().optional(),
      cash_held_for_nummus_restrictions: z.string().nullable().optional(),
      cash_available_for_withdrawal: z.string().nullable().optional(),
      unallocated_margin_cash: z.string().nullable().optional(),
      margin_limit: z.string().nullable().optional(),
      crypto_buying_power: z.string().nullable().optional(),
      day_trade_buying_power: z.string().nullable().optional(),
      day_trades_protection: z.boolean().nullable().optional(),
      start_of_day_overnight_buying_power: z.string().nullable().optional(),
      overnight_buying_power: z.string().nullable().optional(),
      overnight_ratio: z.string().nullable().optional(),
      day_trade_ratio: z.string().nullable().optional(),
      marked_pattern_day_trader_date: z.string().nullable().optional(),
      pattern_day_trader_expiry_date: z.string().nullable().optional(),
      created_at: z.string().nullable().optional(),
      updated_at: z.string().nullable().optional(),
      portfolio_cash: z.string().nullable().optional(),
      gold_equity_requirement: z.string().nullable().optional(),
      uncleared_nummus_deposits: z.string().nullable().optional(),
      cash_pending_from_options_events: z.string().nullable().optional(),
      pending_deposit: z.string().nullable().optional(),
      funding_hold_balance: z.string().nullable().optional(),
      net_moving_cash: z.string().nullable().optional(),
      margin_withdrawal_limit: z.string().nullable().optional(),
      instant_allocated: z.string().nullable().optional(),
      is_primary_account: z.boolean().nullable().optional(),
      is_pdt_forever: z.boolean().nullable().optional(),
    })
    .nullable()
    .optional(),
  // Nested: instant eligibility
  instant_eligibility: z
    .object({
      reason: z.string().nullable().optional(),
      reinstatement_date: z.string().nullable().optional(),
      reversal: z.string().nullable().optional(),
      state: z.string().nullable().optional(),
      updated_at: z.string().nullable().optional(),
      additional_deposit_needed: z.string().nullable().optional(),
      compliance_user_major_oak_email: z.string().nullable().optional(),
      created_at: z.string().nullable().optional(),
      created_by: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
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
  // Fields observed in live API response
  url: z.string().nullable().optional(),
  account: z.string().nullable().optional(),
  last_core_portfolio_equity: z.string().nullable().optional(),
  equity_previous_close: z.string().nullable().optional(),
  portfolio_equity_previous_close: z.string().nullable().optional(),
  adjusted_equity_previous_close: z.string().nullable().optional(),
  adjusted_portfolio_equity_previous_close: z.string().nullable().optional(),
  withdrawable_amount: z.string().nullable().optional(),
  unwithdrawable_deposits: z.string().nullable().optional(),
  unwithdrawable_grants: z.string().nullable().optional(),
  display_currency: z.string().nullable().optional(),
  last_core_market_value_absolute: z.string().nullable().optional(),
});
export type Portfolio = z.infer<typeof PortfolioSchema>;

export const UserProfileSchema = z.object({
  username: z.string(),
  email: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  id_info: z.string().optional(),
  url: z.string().optional(),
  // Fields observed in live API response
  id: z.string().nullable().optional(),
  email_verified: z.boolean().nullable().optional(),
  origin: z
    .object({
      locality: z.string().nullable().optional(),
    })
    .optional(),
  profile_name: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  has_mononym: z.string().nullable().optional(),
  moderation_removed: z.string().nullable().optional(),
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
  // Fields observed in live API response
  user: z.string().nullable().optional(),
  investment_experience_collected: z.boolean().nullable().optional(),
  suitability_verified: z.boolean().nullable().optional(),
  option_trading_experience: z.string().nullable().optional(),
  professional_trader: z.boolean().nullable().optional(),
  understand_option_spreads: z.boolean().nullable().optional(),
  interested_in_options: z.boolean().nullable().optional(),
  updated_at: z.string().nullable().optional(),
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
  // --- fields observed in a live response, previously undeclared ---
  instrument_id: z.string().nullable().optional(),
  symbol: z.string().nullable().optional(),
  account: z.string().nullable().optional(),
  brokerage_account_type: z.string().nullable().optional(),
  pending_average_buy_price: z.string().nullable().optional(),
  shares_available_for_sells: z.string().nullable().optional(),
  shares_held_for_stock_grants: z.string().nullable().optional(),
  shares_held_for_options_collateral: z.string().nullable().optional(),
  shares_held_for_options_events: z.string().nullable().optional(),
  shares_held_for_asset_transfer: z.string().nullable().optional(),
  shares_pending_from_options_events: z.string().nullable().optional(),
  shares_available_for_closing_short_position: z.string().nullable().optional(),
  ipo_allocated_quantity: z.string().nullable().optional(),
  ipo_dsp_allocated_quantity: z.string().nullable().optional(),
  avg_cost_affected: z.boolean().nullable().optional(),
  avg_cost_affected_reason: z.unknown().nullable().optional(),
  is_primary_account: z.boolean().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  instrument_is_halted: z.boolean().nullable().optional(),
  clearing_cost_basis: z.string().nullable().optional(),
  clearing_average_cost: z.string().nullable().optional(),
  clearing_running_quantity: z.string().nullable().optional(),
  clearing_intraday_cost_basis: z.string().nullable().optional(),
  clearing_intraday_realized_gain_loss: z.unknown().nullable().optional(),
  clearing_interday_net_proceeds: z.unknown().nullable().optional(),
  clearing_interday_close_quantity: z.unknown().nullable().optional(),
  clearing_intraday_running_quantity: z.string().nullable().optional(),
  clearing_direction: z.string().nullable().optional(),
  custom_tax_lot_selection_eligible: z.boolean().nullable().optional(),
  has_selectable_lots: z.boolean().nullable().optional(),
  fetch_tax_lot_related_info: z.boolean().nullable().optional(),
  is_pnl_accurate: z.boolean().nullable().optional(),
  validated_short_quantity: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  fracs_liquidation_placed_at: z.unknown().nullable().optional(),
  should_suppress_projections_for_ca: z.boolean().nullable().optional(),
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
  // --- added from live API response ---
  quote: z.string().nullable().optional(),
  fundamentals: z.string().nullable().optional(),
  splits: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  bloomberg_unique: z.string().nullable().optional(),
  margin_initial_ratio: z.string().nullable().optional(),
  maintenance_ratio: z.string().nullable().optional(),
  day_trade_ratio: z.string().nullable().optional(),
  list_date: z.string().nullable().optional(),
  min_tick_size: z.string().nullable().optional(),
  tradable_chain_id: z.string().nullable().optional(),
  rhs_tradability: z.string().nullable().optional(),
  affiliate_tradability: z.string().nullable().optional(),
  fractional_tradability: z.string().nullable().optional(),
  short_selling_tradability: z.string().nullable().optional(),
  default_collar_fraction: z.string().nullable().optional(),
  ipo_access_status: z.string().nullable().optional(),
  ipo_access_cob_deadline: z.string().nullable().optional(),
  ipo_s1_url: z.string().nullable().optional(),
  ipo_roadshow_url: z.string().nullable().optional(),
  is_high_investment_risk: z.boolean().nullable().optional(),
  is_high_risk_for_social: z.boolean().nullable().optional(),
  is_spac: z.boolean().nullable().optional(),
  is_test: z.boolean().nullable().optional(),
  ipo_access_supports_dsp: z.boolean().nullable().optional(),
  ipoa_start_date: z.string().nullable().optional(),
  extended_hours_fractional_tradability: z.boolean().nullable().optional(),
  internal_halt_reason: z.string().nullable().optional(),
  internal_halt_details: z.string().nullable().optional(),
  internal_halt_sessions: z.string().nullable().optional(),
  internal_halt_start_time: z.string().nullable().optional(),
  internal_halt_end_time: z.string().nullable().optional(),
  internal_halt_source: z.string().nullable().optional(),
  all_day_tradability: z.string().nullable().optional(),
  notional_estimated_quantity_decimals: z.number().nullable().optional(),
  tax_security_type: z.string().nullable().optional(),
  reserved_buying_power_percent_queued: z.string().nullable().optional(),
  reserved_buying_power_percent_immediate: z.string().nullable().optional(),
  otc_market_tier: z.string().nullable().optional(),
  car_required: z.boolean().nullable().optional(),
  high_risk_maintenance_ratio: z.string().nullable().optional(),
  low_risk_maintenance_ratio: z.string().nullable().optional(),
  default_preset_percent_limit: z.string().nullable().optional(),
  affiliate: z.string().nullable().optional(),
  account_type_tradabilities: z
    .array(
      z.object({
        account_type: z.string().nullable().optional(),
        account_type_tradability: z.string().nullable().optional(),
      }),
    )
    .optional(),
  issuer_type: z.string().nullable().optional(),
});
export type Instrument = z.infer<typeof InstrumentSchema>;

// ---------------------------------------------------------------------------
// Quotes & Fundamentals
// ---------------------------------------------------------------------------

export const QuoteSchema = z.object({
  // Retained: not present on every /quotes/ response, but buildHoldings reads it. Optional.
  pe_ratio: z.string().nullable().optional(),
  symbol: z.string(),
  last_trade_price: z.string().nullable(),
  ask_price: z.string().nullable(),
  bid_price: z.string().nullable(),
  adjusted_previous_close: z.string().nullable().optional(),
  previous_close: z.string().nullable().optional(),
  last_extended_hours_trade_price: z.string().nullable().optional(),
  trading_halted: z.boolean().optional(),
  has_traded: z.boolean().optional(),
  updated_at: z.string().optional(),
  // Fields observed in live equity quote responses
  ask_size: z.number().nullable().optional(),
  venue_ask_time: z.string().nullable().optional(),
  bid_size: z.number().nullable().optional(),
  venue_bid_time: z.string().nullable().optional(),
  venue_last_trade_time: z.string().nullable().optional(),
  last_non_reg_trade_price: z.string().nullable().optional(),
  venue_last_non_reg_trade_time: z.string().nullable().optional(),
  previous_close_date: z.string().nullable().optional(),
  last_trade_price_source: z.string().nullable().optional(),
  last_non_reg_trade_price_source: z.string().nullable().optional(),
  instrument: z.string().nullable().optional(),
  instrument_id: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
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
  // Additional fields observed in live responses
  quote: z.string().nullable().optional(),
  instrument: z.string().nullable().optional(),
  InstrumentID: z.string().nullable().optional(),
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
  // Additional fields observed in live responses
  author: z.string().nullable().optional(),
  num_clicks: z.number().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  uuid: z.string().nullable().optional(),
  related_instruments: z.array(z.string()).optional(),
  preview_text: z.string().nullable().optional(),
  currency_id: z.string().nullable().optional(),
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
  ratings_published_at: z.string().nullable().optional(),
});
export type Rating = z.infer<typeof RatingSchema>;

export const EarningsSchema = z.object({
  symbol: z.string().optional(),
  report: z
    .object({
      date: z.string().optional(),
      time: z.string().nullable().optional(),
      timing: z.string().optional(),
      verified: z.boolean().optional(),
    })
    .optional(),
  year: z.number().optional(),
  quarter: z.number().optional(),
  // Added from live shape
  instrument: z.string().nullable().optional(),
  // EPS values are nested under `eps` (previously flat `estimate`/`actual`)
  eps: z
    .object({
      estimate: z.string().nullable().optional(),
      actual: z.string().nullable().optional(),
    })
    .optional(),
  // Earnings call details
  call: z
    .object({
      datetime: z.string().nullable().optional(),
      broadcast_url: z.string().nullable().optional(),
      replay_url: z.string().nullable().optional(),
    })
    .optional(),
});
export type Earnings = z.infer<typeof EarningsSchema>;

// ---------------------------------------------------------------------------
// Short Interest
// ---------------------------------------------------------------------------

/**
 * One day of Robinhood's modeled short-interest series.
 *
 * `shares_short` is a modeled estimate (not the official biweekly FINRA
 * settlement figure), which is why each day carries an upper/lower confidence
 * band. `pc_freefloat` is short interest as a **percent** of free float — the
 * value `8.2275` means 8.2275%, i.e. divide by 100 for a fraction. All numeric
 * fields arrive as strings, consistent with the rest of the Robinhood API.
 */
export const ShortInterestDailySchema = z.object({
  date: z.string(),
  shares_short: z.string().nullable().optional(),
  shares_upper_bound: z.string().nullable().optional(),
  shares_lower_bound: z.string().nullable().optional(),
  pc_freefloat: z.string().nullable().optional(),
  pc_freefloat_upper_bound: z.string().nullable().optional(),
  pc_freefloat_lower_bound: z.string().nullable().optional(),
});
export type ShortInterestDaily = z.infer<typeof ShortInterestDailySchema>;

/**
 * Robinhood's per-instrument short-interest response (already unwrapped from
 * the `{ status, data: [{ status, data }] }` envelope by the client).
 */
export const ShortInterestSchema = z.object({
  symbol: z.string().optional(),
  instrument_id: z.string().optional(),
  exchange_symbol: z.string().nullable().optional(),
  daily_data: z.array(ShortInterestDailySchema),
});
export type ShortInterest = z.infer<typeof ShortInterestSchema>;

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
  // Fields observed in live API response
  cash_component: z.string().nullable().optional(),
  trade_value_multiplier: z.string().nullable().optional(),
  min_ticks_multileg: z
    .object({
      above_tick: z.string().optional(),
      below_tick: z.string().optional(),
      cutoff_price: z.string().optional(),
    })
    .optional(),
  late_close_state: z.string().nullable().optional(),
  extended_hours_state: z.string().nullable().optional(),
  underlyings: z
    .array(
      z.object({
        type: z.string().optional(),
        id: z.string().optional(),
        quantity: z.number().optional(),
        symbol: z.string().optional(),
      }),
    )
    .optional(),
  settle_on_open: z.boolean().nullable().optional(),
  sellout_time_to_expiration: z.number().nullable().optional(),
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
  // Fields observed in live API responses but not previously declared
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  min_ticks: z
    .object({
      above_tick: z.string().nullable().optional(),
      below_tick: z.string().nullable().optional(),
      cutoff_price: z.string().nullable().optional(),
    })
    .optional(),
  rhs_tradability: z.string().nullable().optional(),
  sellout_datetime: z.string().nullable().optional(),
  long_strategy_code: z.string().nullable().optional(),
  short_strategy_code: z.string().nullable().optional(),
  underlying_type: z.string().nullable().optional(),
  expiration_datetime: z.string().nullable().optional(),
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
  // --- fields observed in a live response, previously undeclared ---
  adjusted_mark_price: z.string().nullable().optional(),
  adjusted_mark_price_round_down: z.string().nullable().optional(),
  ask_size: z.number().nullable().optional(),
  bid_size: z.number().nullable().optional(),
  instrument: z.string().nullable().optional(),
  instrument_id: z.string().nullable().optional(),
  last_trade_size: z.number().nullable().optional(),
  previous_close_date: z.string().nullable().optional(),
  previous_close_price: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  symbol: z.string().nullable().optional(),
  occ_symbol: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  pricing_model: z.string().nullable().optional(),
  high_fill_rate_buy_price: z.string().nullable().optional(),
  high_fill_rate_sell_price: z.string().nullable().optional(),
  low_fill_rate_buy_price: z.string().nullable().optional(),
  low_fill_rate_sell_price: z.string().nullable().optional(),
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
  // Added from live response shape
  venue_timestamp: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
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
  // --- fields observed in a live response, previously undeclared ---
  drip_dividend_id: z.unknown().nullable().optional(),
  root_advanced_order_id: z.unknown().nullable().optional(),
  agent_display_name: z.unknown().nullable().optional(),
  agent_id: z.unknown().nullable().optional(),
  canceled_agent_name: z.unknown().nullable().optional(),
  canceled_agent_id: z.unknown().nullable().optional(),
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
  // --- fields observed in a live response, previously undeclared ---
  account_number: z.string().nullable().optional(),
  account_number_rhs: z.string().nullable().optional(),
  canceled_quantity: z.string().nullable().optional(),
  pending_quantity: z.string().nullable().optional(),
  processed_premium: z.string().nullable().optional(),
  processed_premium_direction: z.string().nullable().optional(),
  market_hours: z.string().nullable().optional(),
  net_amount: z.string().nullable().optional(),
  net_amount_direction: z.string().nullable().optional(),
  processed_quantity: z.string().nullable().optional(),
  regulatory_fees: z.string().nullable().optional(),
  contract_fees: z.string().nullable().optional(),
  gold_savings: z.string().nullable().optional(),
  chain_id: z.string().nullable().optional(),
  trade_value_multiplier: z.string().nullable().optional(),
  response_category: z.unknown().nullable().optional(),
  form_source: z.string().nullable().optional(),
  client_bid_at_submission: z.string().nullable().optional(),
  client_ask_at_submission: z.string().nullable().optional(),
  client_time_at_submission: z.unknown().nullable().optional(),
  average_net_premium_paid: z.string().nullable().optional(),
  estimated_total_net_amount: z.string().nullable().optional(),
  estimated_total_net_amount_direction: z.string().nullable().optional(),
  estimated_total_net_amount_v2: z.string().nullable().optional(),
  estimated_total_net_amount_direction_v2: z.string().nullable().optional(),
  is_replaceable: z.boolean().nullable().optional(),
  derived_state: z.string().nullable().optional(),
  sales_taxes: z.array(z.unknown()).nullable().optional(),
  placed_agent: z.string().nullable().optional(),
  agent_display_name: z.unknown().nullable().optional(),
  agent_id: z.unknown().nullable().optional(),
  canceled_agent_name: z.unknown().nullable().optional(),
  canceled_agent_id: z.unknown().nullable().optional(),
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
  // fields observed in live API response
  ask_source: z.string().nullable().optional(),
  bid_source: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  routing_group: z.string().nullable().optional(),
});
export type CryptoQuote = z.infer<typeof CryptoQuoteSchema>;

export const CryptoPositionSchema = z.object({
  currency: z.object({
    code: z.string(),
    name: z.string().optional(),
    // additional fields observed in live shape
    brand_color: z.string().nullable().optional(),
    crypto_type: z.string().nullable().optional(),
    display_code: z.string().nullable().optional(),
    display_only: z.boolean().nullable().optional(),
    id: z.string().nullable().optional(),
    increment: z.string().nullable().optional(),
    type: z.string().nullable().optional(),
  }),
  quantity_available: z.string().optional(),
  quantity: z.string().optional(),
  cost_bases: z
    .array(
      z.object({
        direct_cost_basis: z.string().optional(),
        // additional fields observed in live shape
        currency_id: z.string().nullable().optional(),
        direct_quantity: z.string().nullable().optional(),
        direct_reward_cost_basis: z.string().nullable().optional(),
        direct_reward_quantity: z.string().nullable().optional(),
        direct_transfer_cost_basis: z.string().nullable().optional(),
        direct_transfer_quantity: z.string().nullable().optional(),
        id: z.string().nullable().optional(),
        intraday_cost_basis: z.string().nullable().optional(),
        intraday_quantity: z.string().nullable().optional(),
        marked_cost_basis: z.string().nullable().optional(),
        marked_quantity: z.string().nullable().optional(),
      }),
    )
    .optional(),
  id: z.string().optional(),
  // fields present in the live response but not previously declared
  account_id: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  currency_pair_id: z.string().nullable().optional(),
  quantity_held: z.string().nullable().optional(),
  quantity_held_for_buy: z.string().nullable().optional(),
  quantity_held_for_sell: z.string().nullable().optional(),
  quantity_staked: z.string().nullable().optional(),
  quantity_transferable: z.string().nullable().optional(),
  tax_lot_cost_bases: z
    .array(
      z.object({
        clearing_book_cost_basis: z.string().nullable().optional(),
        clearing_running_quantity: z.string().nullable().optional(),
        clearing_running_quantity_without_cost_basis: z.string().nullable().optional(),
        id: z.string().nullable().optional(),
        intraday_cost_basis: z.string().nullable().optional(),
        intraday_quantity: z.string().nullable().optional(),
        intraday_quantity_without_cost_basis: z.string().nullable().optional(),
      }),
    )
    .optional(),
  updated_at: z.string().nullable().optional(),
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
  // Account & identifiers
  account_id: z.string().nullable().optional(),
  ref_id: z.string().nullable().optional(),
  funding_source_id: z.string().nullable().optional(),
  currency_code: z.string().nullable().optional(),
  settlement_currency_id: z.string().nullable().optional(),
  replaces_order_id: z.string().nullable().optional(),
  // State & lifecycle
  derived_state: z.string().nullable().optional(),
  state_group: z.string().nullable().optional(),
  cancel_url: z.string().nullable().optional(),
  canceled_at: z.string().nullable().optional(),
  canceled_quantity: z.string().nullable().optional(),
  last_transaction_at: z.string().nullable().optional(),
  time_in_force: z.string().nullable().optional(),
  // Pricing & notional
  average_price: z.string().nullable().optional(),
  entered_price: z.string().nullable().optional(),
  limit_price: z.string().nullable().optional(),
  stop_price: z.string().nullable().optional(),
  display_estimated_price: z.string().nullable().optional(),
  rounded_estimated_notional_with_estimated_fee: z.string().nullable().optional(),
  rounded_executed_notional: z.string().nullable().optional(),
  rounded_executed_notional_with_fee: z.string().nullable().optional(),
  total_executed_notional: z.string().nullable().optional(),
  // Flags
  is_quantity_variable: z.boolean().optional(),
  is_visible_to_user: z.boolean().optional(),
  speculative: z.boolean().optional(),
  // Fees, bonuses & gain/loss
  fees: z.array(z.unknown()).optional(),
  fee_tier_impact: z.string().nullable().optional(),
  asset_trade_bonus: z.string().nullable().optional(),
  quote_trade_bonus: z.string().nullable().optional(),
  gain_loss: z.string().nullable().optional(),
  book_gain_loss: z
    .object({
      gain_loss_amount: z.string().optional(),
      excludes_transfers: z.boolean().optional(),
    })
    .nullable()
    .optional(),
  tax_lots_overview: z.string().nullable().optional(),
  // Initiator & monetization
  initiator_id: z.string().nullable().optional(),
  initiator_type: z.string().nullable().optional(),
  monetization_model: z.string().nullable().optional(),
  // Executions
  executions: z
    .array(
      z.object({
        effective_price: z.string().optional(),
        fee_ratio: z.string().optional(),
        id: z.string().optional(),
        notional: z.string().optional(),
        quantity: z.string().optional(),
        timestamp: z.string().optional(),
      }),
    )
    .optional(),
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
