/** Portfolio and account tools for Robinhood. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAuthenticatedRh, structured, textError } from "./_helpers.js";

const READ_ONLY = { readOnlyHint: true } as const;

export function registerPortfolioTools(server: McpServer): void {
  server.registerTool(
    "robinhood_get_portfolio",
    {
      title: "Get Portfolio",
      description: "Get complete portfolio: positions with P&L, equity, buying power, cash.",
      inputSchema: {
        account_number: z
          .string()
          .optional()
          .describe("Specific account number, or omit for default."),
        with_dividends: z.boolean().default(false).describe("Include dividend info per holding."),
      },
      outputSchema: {
        holdings: z.unknown(),
        summary: z.looseObject({
          equity: z.unknown().optional(),
          market_value: z.unknown().optional(),
          cash: z.unknown().optional(),
          buying_power: z.unknown().optional(),
          crypto_buying_power: z.unknown().optional(),
          cash_available_for_withdrawal: z.unknown().optional(),
          total_equity: z.unknown().optional(),
          total_market_value: z.unknown().optional(),
          portfolio_equity: z.unknown().optional(),
          options_buying_power: z.unknown().optional(),
          uninvested_cash: z.unknown().optional(),
          withdrawable_cash: z.unknown().optional(),
          equity_market_value: z.unknown().optional(),
          option_market_value: z.unknown().optional(),
          futures_market_value: z.unknown().optional(),
          event_contracts_market_value: z.unknown().optional(),
          pending_deposits: z.unknown().optional(),
          currency: z.unknown().optional(),
        }),
        portfolio_profile: z.unknown(),
        unified: z.unknown(),
        live: z.unknown(),
      },
      annotations: READ_ONLY,
    },
    async ({ account_number, with_dividends }) => {
      try {
        const rh = await getAuthenticatedRh();
        const holdings = await rh.buildHoldings({
          accountNumber: account_number,
          withDividends: with_dividends,
        });
        const accountProfile = await rh.getAccountProfile(account_number);
        const portfolioProfile = await rh.getPortfolioProfile(account_number);
        const unified = await rh.getUnifiedPortfolio(account_number);
        const live = await rh.getPortfolioLive(account_number);

        return structured({
          holdings,
          summary: {
            // existing fields (kept for compatibility)
            equity: portfolioProfile.equity,
            market_value: portfolioProfile.market_value,
            cash: accountProfile.cash,
            buying_power: accountProfile.buying_power,
            crypto_buying_power: accountProfile.crypto_buying_power,
            cash_available_for_withdrawal: accountProfile.cash_available_for_withdrawal,
            // parity fields (from bonfire unified + live) — unified is null
            // when bonfire has no unified snapshot for this account (only
            // the default account has one; see getUnifiedPortfolio).
            total_equity: unified?.total_equity?.amount,
            total_market_value: unified?.total_market_value?.amount,
            portfolio_equity: unified?.portfolio_equity?.amount,
            options_buying_power: unified?.options_buying_power?.amount,
            uninvested_cash: unified?.uninvested_cash?.amount,
            withdrawable_cash: unified?.withdrawable_cash?.amount,
            equity_market_value: live.equity_market_value,
            option_market_value: live.option_market_value,
            futures_market_value: live.futures_market_value,
            event_contracts_market_value: live.event_contracts_market_value,
            pending_deposits: live.pending_deposits,
            currency: live.currency,
          },
          portfolio_profile: portfolioProfile,
          unified,
          live,
        });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_equity_positions",
    {
      title: "Get Equity Positions",
      description:
        "Get raw equity positions (shares, average buy price, per-account) without holding enrichment.",
      inputSchema: {
        account_number: z
          .string()
          .optional()
          .describe("Specific account number, or omit for all accounts."),
        nonzero: z.boolean().default(true).describe("Only positions with a non-zero quantity."),
      },
      outputSchema: {
        positions: z.array(z.unknown()),
      },
      annotations: READ_ONLY,
    },
    async ({ account_number, nonzero }) => {
      try {
        const rh = await getAuthenticatedRh();
        const positions = await rh.getPositions({ accountNumber: account_number, nonzero });
        return structured({ positions });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_accounts",
    {
      title: "Get Accounts",
      description: "Get all brokerage accounts (multi-account support).",
      inputSchema: {},
      outputSchema: {
        accounts: z.array(z.unknown()),
      },
      annotations: READ_ONLY,
    },
    async () => {
      try {
        const rh = await getAuthenticatedRh();
        const accounts = await rh.getAccounts({ allAccounts: true });
        return structured({ accounts });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_account",
    {
      title: "Get Account",
      description: "Get account details, profile, and investment preferences.",
      inputSchema: {
        info_type: z
          .enum(["all", "account", "user", "investment"])
          .default("all")
          .describe("What to return."),
      },
      outputSchema: {
        account: z.unknown().optional(),
        user: z.unknown().optional(),
        investment: z.unknown().optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ info_type }) => {
      try {
        const rh = await getAuthenticatedRh();
        const result: Record<string, unknown> = {};
        if (info_type === "all" || info_type === "account") {
          result.account = await rh.getAccountProfile();
        }
        if (info_type === "all" || info_type === "user") {
          result.user = await rh.getUserProfile();
        }
        if (info_type === "all" || info_type === "investment") {
          result.investment = await rh.getInvestmentProfile();
        }
        return structured(result);
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
