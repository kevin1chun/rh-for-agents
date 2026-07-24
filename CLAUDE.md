# robinhood-for-agents

AI-native Robinhood trading interface — MCP server + TypeScript client library.

## Project Structure
- `src/client/` — Robinhood API client (76 async methods)
- `src/server/` — MCP server with 49 tools
- `bin/` — CLI entry point (`robinhood-for-agents`)
- `skills/` — Claude Code skills for interactive use

## Tech Stack
- **Runtime**: Bun
- **Language**: TypeScript (strict mode, ESM-only)
- **MCP SDK**: `@modelcontextprotocol/sdk` v1.12+ (McpServer + StdioServerTransport)
- **Validation**: Zod v4 — types API response shapes (cast, not runtime-parsed) + runtime-validates MCP tool-call params
- **Testing**: Vitest (not `bun test` — module isolation matters)
- **Linting**: Biome v2
- **Browser Auth**: playwright-core (drives system Chrome, no bundled browser)

## Running the MCP Server
```bash
bun install
bun bin/robinhood-for-agents.ts
```

## Development
```bash
bun run typecheck   # tsc --noEmit
bun run check       # biome lint + format
npx vitest run      # all tests (use vitest, NOT bun test)
```

## Skills
Canonical skill source is `skills/`. Local `.claude/skills/` contains symlinks for development.

Install MCP server + skills: `bun bin/robinhood-for-agents.ts install`

Skills use three-layer progressive disclosure:
1. **SKILL.md** — MCP tool orchestration (default)
2. **reference.md** — MCP tool API details (loaded on demand)
3. **client-api.md** — TypeScript client library patterns (advanced, loaded on demand)

Available skills:
- `robinhood-for-agents` - Unified skill: auth, portfolio, research, trading, options (dual-mode: MCP + client API)

## Client Patterns
```typescript
import { RobinhoodClient, getClient } from "robinhood-for-agents";

// Class-based
const client = new RobinhoodClient();
await client.restoreSession();
const quotes = await client.getQuotes("AAPL");

// Singleton
const rh = getClient();
await rh.restoreSession();
```
- All methods are `async` (native `fetch` under the hood)
- Multi-account is first-class: every account-scoped method accepts `accountNumber`
- Session cached in OS keychain via `Bun.secrets` (macOS Keychain Services) — no plaintext fallback, no tokens on disk
- Token refresh via `refresh_token` + `device_token` — **proactive** (pre-request hook renews 24h before `expires_at`, `REFRESH_SKEW_SEC` in `src/client/auth.ts`) *and* reactive (on 401). Refresh tokens are single-use: every refresh rotates them and kills the previous one
- Proper exceptions: `AuthenticationError`, `TokenExpiredError` (subclass — a 401 that survived the refresh retry; means re-login), `APIError`
- **Do NOT use `phoenix.robinhood.com`** — it rejects TLS. Use `api.robinhood.com` endpoints only.

## Authentication
- Browser login (`robinhood_browser_login`) opens Google Chrome via playwright-core's `channel: "chrome"` (`src/server/browser-auth.ts`). Chrome must be installed — there is no Brave/Chromium auto-detection, `BROWSER_PATH` override, or `--chrome` CLI flag implemented yet, despite earlier docs suggesting otherwise.
- Purely passive — Playwright intercepts `/oauth2/token` network traffic, never interacts with the DOM
- Request body (JSON) → captures `device_token`; Response → captures `access_token` + `refresh_token`; `withTimestamp()` stamps `saved_at` and derives `expires_at` from the JWT `exp` claim
- Tokens stored in OS keychain (`KeychainTokenStore`, default) or encrypted file (`EncryptedFileTokenStore`, for Docker/headless)
- `restoreSession()` loads tokens from the configured `TokenStore`, sets Bearer auth on the session, registers the 401 refresh callback (`session.onUnauthorized`) **and** the pre-request renewal hook (`session.ensureFreshToken`), and backfills `expires_at` on entries persisted before that field existed
- `TokenData.expires_at` (unix seconds, **optional** for back-compat with already-stored entries) is derived by `deriveExpiresAt()` in `token-store.ts` — JWT `exp` claim first, `issuedAt + expires_in` as fallback
- Access-token TTL **varies** (~5.9d/6.9d on browser login; 8.5d then 6.1d on refresh grants). **Never hardcode a lifetime** — read `expires_at`
- Rotation is enforced server-side and single-use: each refresh returns a new `refresh_token` and instantly kills the old one (401 `invalid_grant`); issuing a new token family also revokes the previous *access* token
- **No cross-process lock.** Two clients refreshing concurrently poison the loser. When a refresh POST is rejected, `adoptFromStore()` re-reads the `TokenStore` and adopts a token another process may have already persisted, instead of giving up
- A failed token save is **never** swallowed — it logs `CRITICAL` to stderr, because the rotated refresh token then exists only in memory
- Proactive renewal keeps the chain alive only while the client is *in use*. Idle longer than the refresh-token lifetime → the chain lapses and a new browser login is required
- A 401 that survives the refresh retry raises `TokenExpiredError` ("re-authenticate with browser login"), not a bare `APIError: HTTP 401` (`src/client/http.ts`)
- `robinhood_check_session` **probes the API** rather than checking that tokens exist: `logged_in` | `expired` (with re-login instructions) | `unknown` (transient/network) | `not_authenticated`
- **Docker / headless:** Use `EncryptedFileTokenStore` — set `ROBINHOOD_TOKENS_FILE` and `ROBINHOOD_TOKEN_KEY` env vars. The `onboard` command can export encrypted tokens for container use.

## Safety Rules
- **NEVER** place bulk cancel operations
- **NEVER** call fund transfer functions
- **ALWAYS** confirm with user before placing any order
- Order tools require explicit parameters - no defaults that could cause accidental trades
- **NEVER** use real PII in code, docs, examples, or commit messages — this includes account numbers, tokens, device IDs, email addresses, and any other user-identifying data. Use placeholders like `"ACCOUNT_ID"`, `"xxx-token"`, etc.

### Write tiers (policy for every mutating tool)
The confirmation model scales with reversibility & stakes. This governs all new writes (watchlists shipped; scanner mutations next):
1. **Financial writes** (orders): two-step review→place where the official MCP has it; **always confirm with the user** (tool description + skill); explicit params, no defaults.
2. **Reversible non-financial writes** (watchlists, scanners): confirm-before-calling directive in the tool description (mirroring the official MCP); honest MCP annotations (`readOnlyHint:false`, `destructiveHint`/`idempotentHint` set truthfully); **single-target, single-operation per call** — the client primitive builds the underlying bulk/multi-target wire-map internally so multi-list or mixed create/delete writes are never expressible; results reported **declaratively** ("ensured present" / "removed" vs "not_present") since the API echoes the request, not the new state. No self-serviceable `confirm` param (it's theater — the real gate is the MCP host's permission prompt, which the annotations drive).
3. **Prohibited** (bulk cancel, fund transfers): never implemented as tools — absence is the gate.

Resolution is **strict on writes, tolerant on reads**: symbol→instrument resolution uses exact-match (never `findInstruments()[0]`, a fuzzy search), and index/currency-pair ids are validated against the live catalogs before a write; reads pass unknown/exotic items through untouched.

## Testing
```bash
npx vitest run
```
Tests use mocking (vi.mock) for HTTP layer — no real API calls.

### Integration Tests (local only, requires login)
```bash
# Login first (one-time)
robinhood-for-agents onboard

# Run integration tests
bun run test:integration
```
Integration tests hit the real Robinhood API (read-only). They are excluded from CI and default test runs.

## Releases
Tag `v*` → publishes to npm
