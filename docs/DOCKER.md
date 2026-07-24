# Docker (OpenClaw, etc.)

**TL;DR** -- Run `onboard` on the host to login and export an encrypted token file. Mount the file into the container **read-write** (the SDK rotates and rewrites tokens) and pass the encryption key as an env var.

---

## Why Docker needs a different token store

| Where | OS Keychain? |
|-------|--------------|
| **Host (Mac/Linux)** | Yes. `KeychainTokenStore` (default) stores tokens here. |
| **Container** | No. Different OS, no access to the host keychain. |

The SDK auto-detects the environment: if `ROBINHOOD_TOKENS_FILE` is set, it uses `EncryptedFileTokenStore` (AES-256-GCM encrypted file on disk); otherwise it uses the OS keychain. In Docker, you set the env vars and the SDK does the rest.

---

## Security warning

> **The encrypted token file protects against casual disk access (e.g., a leaked volume snapshot) but NOT against a rogue agent with shell access inside the container.** An agent that can read env vars can recover `ROBINHOOD_TOKEN_KEY` and decrypt the file. This is an inherent limitation of running untrusted code with access to credentials. Limit container capabilities, network egress, and shell access accordingly.

---

## Setup

### 1. Login and export tokens on the host

```bash
npx robinhood-for-agents onboard
```

Select "Docker container / remote host" when prompted. The onboard flow will:
1. Open Chrome for Robinhood login (captures OAuth tokens)
2. Encrypt tokens to a file using AES-256-GCM
3. Print the encryption key and env var commands to copy into your container config

After onboard completes, you will have:
- An encrypted token file at `./tokens.enc` — relative to wherever you ran `onboard` (this is the *export* artifact from `onboard.ts`, distinct from `EncryptedFileTokenStore`'s own built-in fallback path `~/.robinhood-for-agents/tokens.enc`, which only applies when no path or `ROBINHOOD_TOKENS_FILE` is given)
- A base64 encryption key

### 2. Configure your container

Two env vars control `EncryptedFileTokenStore`:

| Env var | Description |
|---------|-------------|
| `ROBINHOOD_TOKENS_FILE` | Path to the encrypted token file inside the container |
| `ROBINHOOD_TOKEN_KEY` | Base64-encoded AES-256 encryption key |

#### docker-compose.yml

```yaml
services:
  agent:
    image: your-agent-image
    environment:
      ROBINHOOD_TOKENS_FILE: "/secrets/tokens.enc"
      ROBINHOOD_TOKEN_KEY: "${ROBINHOOD_TOKEN_KEY}"
    volumes:
      - ./tokens.enc:/secrets/tokens.enc:rw
```

> **Note:** The volume must be mounted `:rw` (read-write), not `:ro`. The SDK renews the access token ahead of expiry (and again on a 401) and writes the updated tokens back to the encrypted file. Every refresh **rotates** the refresh token — Robinhood invalidates the old one the instant the new one is issued — so this file is not a cache, it is the only durable copy. With a read-only mount the running container keeps working off its in-memory token and then finds nothing valid on restart, requiring a fresh `onboard` on the host. Failed writes are logged as `CRITICAL` on stderr; alert on that line.

#### docker run

```bash
docker run \
  -e ROBINHOOD_TOKENS_FILE=/secrets/tokens.enc \
  -e ROBINHOOD_TOKEN_KEY="$ROBINHOOD_TOKEN_KEY" \
  -v ./tokens.enc:/secrets/tokens.enc:rw \
  your-agent-image
```

### 3. Verify inside the container

```bash
# The SDK auto-detects EncryptedFileTokenStore from the env var
$ env | grep ROBINHOOD_TOKENS
ROBINHOOD_TOKENS_FILE=/secrets/tokens.enc

# The encrypted file is opaque without the key
$ cat /secrets/tokens.enc
{"iv":"...","tag":"...","ciphertext":"..."}
```

### 4. One writer per token file

Robinhood enforces **single-use refresh-token rotation**: each refresh returns a new refresh token and instantly invalidates the previous one. There is no cross-process lock, so two containers sharing one `tokens.enc` will race — the loser refreshes with a token the winner already spent and gets a 401 `invalid_grant`. The SDK recovers by re-reading the file and adopting whatever the other process persisted, but that is a safety net, not a supported topology.

- Do **not** scale a service that shares one `tokens.enc` to more than one replica
- Do **not** run the host SDK against the keychain and a container against an export of the same token family at the same time
- Give each independent deployment its own browser login and its own token file

### Re-authenticating a container

A container can never re-authenticate itself: browser login needs Chrome on the host. Renewal keeps the chain alive only while the SDK is actually making requests, so a container that sits idle longer than the refresh-token lifetime will lapse and need a new token file.

Symptoms: API calls raise `TokenExpiredError` ("session expired and could not be refreshed"), and `robinhood_check_session` reports `expired`. (`unknown` means a transient/network failure — retry before re-onboarding.)

Recovery:

```bash
# On the host
npx robinhood-for-agents onboard   # re-login, re-export tokens.enc
docker compose up -d --force-recreate agent
```

If you rotated the encryption key during onboard, update `ROBINHOOD_TOKEN_KEY` too.

---

## How it works

```
┌─── Host ──────────────────────┐    ┌─── Container ──────────────────────┐
│                               │    │                                    │
│ Keychain: has tokens (local)  │    │ ROBINHOOD_TOKENS_FILE=/secrets/... │
│                               │    │ ROBINHOOD_TOKEN_KEY=<base64>       │
│ onboard: login → encrypt →    │    │                                    │
│   writes tokens.enc           │───>│ Volume mount: tokens.enc           │
│                               │    │                                    │
│                               │    │ SDK loads file → decrypts with key │
│                               │    │ → injects Bearer header on calls   │
│                               │    │ → renews early, re-encrypts on save│
└───────────────────────────────┘    └────────────────────────────────────┘
```

The `EncryptedFileTokenStore`:
- Decrypts the token file on `restoreSession()` using `ROBINHOOD_TOKEN_KEY`
- Injects the Bearer header on every Robinhood API request
- Renews the token 24h before it expires (pre-request hook) and again on a 401, writing re-encrypted tokens back to the file each time — each write carries a newly rotated refresh token
- Uses AES-256-GCM with a random IV per write (authenticated encryption)

---

## Stopping access

Kill the container. Once it is gone:
- No process can read the encryption key from its env vars
- The encrypted file on the host is useless without the key
- No further token refreshes will occur, so the current access token expires naturally — its exact lifetime varies (roughly 6–8.5 days from issue), so do not treat any single figure as a guaranteed revocation window

To revoke immediately, delete the encrypted file on the host:

```bash
rm ./tokens.enc   # wherever you ran `onboard` from
```

