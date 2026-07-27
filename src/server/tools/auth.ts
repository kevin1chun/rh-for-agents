/** Authentication tools for Robinhood. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { browserLogin } from "../browser-auth.js";
import { getRh, structured, textError } from "./_helpers.js";

const READ_ONLY = { readOnlyHint: true } as const;

export function registerAuthTools(server: McpServer): void {
  server.registerTool(
    "robinhood_browser_login",
    {
      title: "Browser Login",
      description:
        "Authenticate with Robinhood by opening Chrome to the real login page. The user logs in normally (including MFA). This is the only way to authenticate — no credentials are passed through the tool.",
      inputSchema: {},
      outputSchema: {
        status: z.string(),
        account_hint: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async () => {
      try {
        const result = await browserLogin();
        return structured(result);
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_check_session",
    {
      title: "Check Session",
      description:
        "Check if there is a valid cached Robinhood session. Returns session status without opening a browser or requiring credentials.",
      inputSchema: {},
      outputSchema: {
        status: z.string(),
        method: z.string().optional(),
        account_hint: z.string().optional(),
        message: z.string().optional(),
      },
      annotations: READ_ONLY,
    },
    async () => {
      try {
        const { AuthenticationError } = await import("../../client/index.js");
        const rh = getRh();
        try {
          const result = await rh.restoreSession();

          // restoreSession only loads tokens from the store — it proves nothing
          // about whether they still work. Probe the API before reporting
          // "logged_in", otherwise an expired session reports healthy while
          // every subsequent call fails.
          let accountHint = "";
          try {
            const profile = await rh.getAccountProfile();
            const acct = profile.account_number ?? "";
            accountHint = acct.length >= 4 ? `...${acct.slice(-4)}` : acct;
          } catch (probeError) {
            if (probeError instanceof AuthenticationError) {
              return structured({
                status: "expired",
                method: result.method,
                message:
                  "Cached tokens are no longer valid and could not be refreshed. " +
                  "Run robinhood_browser_login to re-authenticate.",
              });
            }
            // Transient/network failure — the session may well be fine, so do
            // not claim it is expired either.
            return structured({
              status: "unknown",
              method: result.method,
              message: `Could not verify session: ${probeError}`,
            });
          }

          return structured({
            status: "logged_in",
            method: result.method,
            account_hint: accountHint,
          });
        } catch (e) {
          if (e instanceof AuthenticationError) {
            return structured({
              status: "not_authenticated",
              message: String(e),
            });
          }
          throw e;
        }
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
