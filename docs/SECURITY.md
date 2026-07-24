# Security Model

This document describes how robinhood-for-agents protects Robinhood OAuth tokens under the new TokenStore adapter architecture.

## What we store

A single JSON blob containing:

| Field | Purpose |
|-------|---------|
| `access_token` | Bearer token for API calls (variable TTL — observed ~6 to ~8.5 days; the real expiry is read from the token's JWT `exp` claim, never assumed) |
| `refresh_token` | Used with `device_token` to mint a new access token. **Single-use** — see [Token lifetime and rotation](#token-lifetime-and-rotation) |
| `device_token` | UUID binding the session to a device |
| `expires_at` | Unix seconds, derived from the access token's JWT `exp` claim. Optional (absent on entries written before the field existed). Used only to schedule proactive renewal — it is decoded without signature verification and is never an authorization decision |

The `access_token` alone is enough to trade on the user's Robinhood account until it expires. The `refresh_token` + `device_token` pair is enough to keep minting new ones indefinitely.

## Architecture: TokenStore adapters

The client loads tokens from a `TokenStore` and injects `Authorization: Bearer <token>` directly into every request. There is no intermediary proxy. Token refresh happens inside the client — proactively before each request once the token is within 24 hours of expiry, and reactively on a 401 as a fallback.

```
┌─── Client (RobinhoodClient) ─────────────────────────────┐
│                                                           │
│  TokenStore.load() ──► access_token ──► fetch() with     │
│  (keychain or file)    in memory       Authorization hdr  │
│                                                           │
│  Before each request (within 24h of expires_at):          │
│    refresh_token + device_token ──► /oauth2/token/        │
│                                                           │
│  On 401 (fallback):                                       │
│    refresh_token + device_token ──► /oauth2/token/        │
│                                                           │
│  Either path ──► NEW refresh_token ──► TokenStore.save()  │
│  (old refresh_token is dead the moment the new one issues)│
│                                                           │
└────────────────────────────────── api.robinhood.com ──────┘
```

Two TokenStore adapters are provided:

| Adapter | Backend | Best for |
|---------|---------|----------|
| `KeychainTokenStore` | OS keychain (macOS Keychain Services / Linux libsecret) via `Bun.secrets` | Local development with a desktop session |
| `EncryptedFileTokenStore` | AES-256-GCM encrypted file on disk | Docker, headless servers, CI, cloud |

Auto-detection: if `ROBINHOOD_TOKENS_FILE` is set, the SDK uses `EncryptedFileTokenStore`; otherwise it uses `KeychainTokenStore`.

## Token lifetime and rotation

Refresh tokens are **single-use**. Every successful refresh returns a *new* `refresh_token` and Robinhood invalidates the old one immediately — replaying it returns `HTTP 401 invalid_grant`. Issuing a new token family also revokes the previous **access** token.

Access-token TTL is **not fixed**. The `expires_in` we request (`734000`, ~8.5 days) is only sometimes honored; observed lifetimes run from ~5.9 to ~8.5 days. The client therefore reads the JWT `exp` claim off the access token (`deriveExpiresAt()` in `src/client/token-store.ts`) and persists it as `expires_at` rather than assuming a duration.

**Refresh is proactive, not just reactive.** `RobinhoodSession.ensureFreshToken` runs before every request and renews once the token is within 24 hours of `expires_at` (`REFRESH_SKEW_SEC` in `src/client/auth.ts`); the 401 handler remains as a fallback. Waiting for a 401 alone was not enough — nothing refreshes while the process is idle, so an idle gap longer than the token lifetime let the refresh chain lapse and forced a full browser re-login.

Consequences worth knowing:

- **A stolen refresh token is a race, not a silent clone.** Whoever refreshes first invalidates the other side. If your client suddenly demands a browser re-login for no apparent reason, treat that as a possible signal that someone else used your refresh token — check the Robinhood app for unrecognized sessions.
- **Re-running browser login revokes the previous family.** That is the cheapest incident response available: a fresh login kills any access or refresh token an attacker copied earlier.
- **Two processes sharing one store will poison each other.** There is no cross-process lock. If the MCP server and a script refresh concurrently, the loser is left holding a token the server has already killed. `adoptFromStore()` (`src/client/auth.ts`) recovers by re-reading the store and adopting whatever the winner persisted, but it narrows the window rather than closing it. Run one long-lived process per token store.
- **A failed save is fatal to the chain, not a warning.** Because rotation is server-enforced, the token just spent is already dead; if the replacement cannot be persisted it exists only in memory. The client logs a `CRITICAL` line to stderr in that case. Treat that message as "a browser re-login will be required as soon as this process exits."
- **`expires_at` comes from an unverified JWT payload.** It is decoded without checking the signature, is used only to schedule renewal, and never gates an authorization decision — but it is not a trusted assertion.

## KeychainTokenStore — threat model

**How it works:** Tokens are stored in the OS keychain, encrypted at rest by the operating system.

**What it protects against:**

- **Disk theft / offline access** — keychain entries are encrypted with OS-managed keys; reading the raw keychain database yields nothing useful without the user's login credentials
- **Other OS users** — keychain items are scoped to the owning user account
- **Filesystem scanning** — no token files on disk; `grep -r "access_token" /` finds nothing

**What it does NOT protect against:**

- **Same-user processes with shell access** — `Bun.secrets` does not use per-access biometric authentication (e.g., `kSecAccessControlUserPresence` on macOS). Once the user grants `bun` keychain access, any process running as that user can read tokens silently. On Linux, GNOME Keyring unlocks at login and stays open for the session.

This is a property of the OS keychain model, not a bug in this project. It is the strongest practical option for local development.

## EncryptedFileTokenStore — threat model

**How it works:** Tokens are encrypted with AES-256-GCM and written to a file (default: `~/.robinhood-for-agents/tokens.enc`). The encryption key is resolved in order:

1. `ROBINHOOD_TOKEN_KEY` environment variable (base64-encoded 32-byte key)
2. OS keychain (stored under `robinhood-for-agents` / `encryption-key`)
3. Auto-generated and stored in OS keychain (first run only)

**What it protects against:**

- **Casual file reads** — the file is ciphertext; `cat tokens.enc` yields nothing useful
- **Disk theft (when key is in keychain)** — if the key lives in the OS keychain and not in an env var, offline disk access cannot decrypt the file

**What it does NOT protect against:**

> **WARNING: When the encryption key is collocated with the encrypted file (e.g., both inside a Docker container via `ROBINHOOD_TOKEN_KEY` env var), the encryption provides defense-in-depth only, NOT a security boundary. A rogue agent with shell access can decrypt tokens in one command.**

This is the critical tradeoff. See the attack scenarios below.

**Two implementation details worth knowing:**

- **File mode is set on creation only.** `writeFile(..., { mode: 0o600 })` applies when the file doesn't already exist; it is not re-asserted on every write, and the write itself isn't atomic (no write-to-temp-then-rename). If the file was ever created with looser permissions by another process, or a write is interrupted mid-flight, that isn't self-healing. Since refresh tokens are single-use, a torn or failed write is not a lost cache entry — it strands the rotated token in memory and costs a browser re-login. The client logs a `CRITICAL` line to stderr when a post-refresh save fails.
- **A persistent `ROBINHOOD_TOKEN_KEY` (e.g., exported from a shell profile like `.zshrc`) puts the key in plaintext on disk in that dotfile, and hands it to every child process spawned from that shell** — not just this SDK. That's a real, ongoing exposure distinct from the Docker-container scenario below (no container boundary involved at all), and it's easy to set up once for convenience and forget about. Prefer the OS keychain for the key unless you specifically need portability.

## Attack scenarios

### Scenario A: Plaintext token file (DO NOT DO THIS)

```bash
$ cat /secrets/robinhood-tokens.json
{"access_token":"eyJ...","refresh_token":"abc...","device_token":"uuid..."}

# Full credential theft — one command.
```

### Scenario B: EncryptedFileTokenStore with key in same environment

```bash
$ cat ~/.robinhood-for-agents/tokens.enc
{"iv":"ab12..","tag":"cd34..","ciphertext":"encrypted-blob"}
# Encrypted — but check the environment:

$ env | grep ROBINHOOD
ROBINHOOD_TOKEN_KEY=a1b2c3d4e5f6...

# Or just call the library directly:
$ bun -e "
  import { EncryptedFileTokenStore } from 'robinhood-for-agents';
  const store = new EncryptedFileTokenStore();
  console.log(JSON.stringify(await store.load()));
"
{"access_token":"eyJ...","refresh_token":"abc...","device_token":"uuid..."}
```

**Result**: Same as plaintext with one extra step. The decryption key sits in the same environment as the ciphertext. Any process with shell access can call `store.load()` or read the env var and decrypt manually.

### Scenario C: EncryptedFileTokenStore with key in OS keychain (local machine)

```bash
$ cat ~/.robinhood-for-agents/tokens.enc
{"iv":"ab12..","tag":"cd34..","ciphertext":"encrypted-blob"}

$ env | grep ROBINHOOD
# (nothing — key is in keychain, not env)

# Same-user process can still read the keychain:
$ bun -e "
  import { EncryptedFileTokenStore } from 'robinhood-for-agents';
  const store = new EncryptedFileTokenStore();
  console.log(JSON.stringify(await store.load()));
"
{"access_token":"eyJ...","refresh_token":"abc...","device_token":"uuid..."}
```

**Result**: Same as KeychainTokenStore in practice — the keychain is the security boundary. This mode is useful when you want file-based storage for operational reasons (backup, migration) but still have a keychain available for key management.

### Scenario D: KeychainTokenStore (strongest for local dev)

```bash
$ grep -r "access_token" / 2>/dev/null
# (nothing — no token files on disk)

$ env | grep ROBINHOOD
# (nothing — no token env vars)

# Tokens are only accessible through the OS keychain:
$ bun -e "console.log(await Bun.secrets.get('robinhood-for-agents','session-tokens'))"
'{"access_token":"eyJ...",...}'
# ↑ Requires same-user keychain access
```

**Result**: Strongest practical option. No files on disk, no env vars. Attack surface is limited to same-user keychain access.

## Security tiers

| Tier | Store | Key location | Token location | Rogue agent risk |
|------|-------|-------------|----------------|-----------------|
| **1. Strongest** | `KeychainTokenStore` | N/A (OS-managed) | OS keychain | Agent must have same-user keychain access |
| **2. Strong** | `EncryptedFileTokenStore` | OS keychain | Encrypted file | Agent must have same-user keychain access (for the key) |
| **3. Weaker** | `EncryptedFileTokenStore` | `ROBINHOOD_TOKEN_KEY` env var | Encrypted file | **Agent with shell access can decrypt — env var + file are collocated** |

## Docker and headless deployments

> **WARNING: In Docker, both the encrypted token file and the `ROBINHOOD_TOKEN_KEY` env var live inside the container. This means a rogue agent with shell access (or code execution) can decrypt your Robinhood tokens. Encryption here is defense-in-depth, NOT a security boundary.**

### Why this is acceptable (with caveats)

Docker without an OS keychain forces `EncryptedFileTokenStore` with the key in an env var. This is the weakest tier, but it is still better than plaintext because:

1. **Casual inspection is blocked** — `cat tokens.enc` yields ciphertext, not credentials
2. **Log/crash dump safety** — the encrypted blob is harmless if leaked in logs or error output
3. **Automated scanning tools** — secret scanners that look for JWT patterns or known token formats will not flag the encrypted file

But a motivated attacker with code execution can trivially decrypt the tokens by reading the env var or calling the SDK.

### Recommendations for Docker

- **Only run trusted agents.** The encryption does not protect against a malicious or compromised agent that has shell access inside the container.
- **Use read-only filesystem** where possible (`docker run --read-only`) to prevent the agent from writing exfiltration scripts to disk.
- **Restrict network egress** to `api.robinhood.com` only, preventing token exfiltration to third-party servers.
- **Set `ROBINHOOD_TOKEN_KEY` via Docker secrets** (not `docker run -e`) to avoid exposure in `docker inspect` output.
- **Re-run browser auth periodically** to revoke the current token family. Renewal is automatic while the container is running, so this is a revocation practice, not a keep-alive one — but note that a container idle longer than the access-token lifetime (variable, ~6 to ~8.5 days) will let the refresh chain lapse and require a fresh login.
- **Monitor API activity** in the Robinhood app for unexpected trades or account actions.

### Setup

```bash
# Generate a key
export ROBINHOOD_TOKEN_KEY=$(openssl rand -base64 32)

# Pass to Docker via secrets or env
docker run \
  -e ROBINHOOD_TOKEN_KEY \
  -e ROBINHOOD_TOKENS_FILE=/data/tokens.enc \
  -v tokens-volume:/data \
  your-agent-image
```

## Best practices

### Local deployments

- Use `KeychainTokenStore` (the default) — no tokens on disk, no env vars
- Agent permission models (e.g., Claude Code approval prompts) provide an additional layer
- The client handles token refresh automatically — proactively 24 hours before expiry, and on a 401 as a fallback

### Never do this

- **Never store RH tokens as plaintext files** — one `cat` command exposes everything
- **Never pass RH tokens directly as env vars** — visible via `docker inspect`, `/proc/<pid>/environ`, and orchestrator logs
- **Never assume EncryptedFileTokenStore is equivalent to KeychainTokenStore** — when the key is collocated with the ciphertext, encryption is defense-in-depth only
- **Never run untrusted agents with token access** — no amount of encryption protects against an agent that can execute arbitrary code in the same environment as the tokens or the decryption key

## Comparison with the former auth proxy

The previous architecture used a host-side auth proxy (`127.0.0.1:3100`) that injected Bearer tokens on behalf of containerized clients. Tokens never entered the container.

| Property | Auth proxy (old) | TokenStore adapters (new) |
|----------|-----------------|--------------------------|
| Tokens in container | Never | Yes (encrypted) in Docker |
| Network dependency | Proxy must be running | Direct to `api.robinhood.com` |
| Token refresh | Proxy handled it | Client handles it — proactive (pre-request, 24h skew) + reactive (401) |
| Container isolation | Strong — tokens physically absent | Weaker — encrypted tokens present |
| Operational complexity | Higher — proxy process, proxy token, port forwarding | Lower — single env var + file |

The auth proxy provided stronger isolation for Docker deployments at the cost of operational complexity. The TokenStore approach trades some container isolation for simplicity, with the explicit understanding that **Docker deployments rely on trusting the agent** rather than on cryptographic isolation.
