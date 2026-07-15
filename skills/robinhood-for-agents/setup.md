# Setup — Authentication Workflow

### Step 1: Check Session
```bash
bun -e '
import { getClient } from "robinhood-for-agents";
const rh = getClient();
try { await rh.restoreSession(); console.log("logged_in"); }
catch { console.log("not_authenticated"); }
'
```
If `logged_in` — already authenticated, stop. Otherwise continue.

`restoreSession()` loads tokens from the configured TokenStore (OS keychain by default) and injects Bearer auth directly into API requests.

### Step 2: Browser Login
```bash
bunx robinhood-for-agents onboard
```
This runs the interactive setup — it will open your browser (Chrome, Brave, or Chromium — auto-detected on macOS; override with `BROWSER_PATH`) to the real Robinhood website for login:
1. Browser opens to robinhood.com/login
2. User enters email and password
3. Robinhood handles MFA natively (push notification, SMS, etc.)
4. Token captured automatically and saved to OS keychain
5. Browser closes when login is complete

### Step 3: Verify
```bash
bun -e '
import { getClient } from "robinhood-for-agents";
const rh = getClient();
await rh.restoreSession();
const acct = await rh.getAccountProfile();
console.log(JSON.stringify(acct, null, 2));
'
```
Confirm to the user that authentication is complete.

## Token Stores

| Store | When to use | Config |
|---|---|---|
| `KeychainTokenStore` (default) | Local dev, macOS/Linux with desktop | Nothing — works out of the box |
| `EncryptedFileTokenStore` | Docker, headless servers, CI, cloud | Set `ROBINHOOD_TOKENS_FILE` + `ROBINHOOD_TOKEN_KEY` env vars |
| Direct `accessToken` | Serverless, testing, short-lived scripts | Pass `accessToken` to constructor |

## Troubleshooting
- **`not_authenticated` after login**: Try `bunx robinhood-for-agents onboard` to re-login
- **Token expired**: Tokens auto-refresh on 401. If refresh fails, re-run `onboard`
- **Docker/headless**: Set `ROBINHOOD_TOKENS_FILE` and `ROBINHOOD_TOKEN_KEY` env vars

## Notes
- No credentials (username/password) pass through the tool layer — login happens on the real Robinhood website
- Tokens are stored in the OS keychain via `Bun.secrets` (default) — never on disk in plaintext
- Access tokens last ~8.5 days; the client auto-refreshes on 401 via the stored refresh token, so re-auth is only needed roughly once a week+
- The client injects `Authorization: Bearer` headers directly into API requests
