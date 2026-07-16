# Docker (OpenClaw, etc.)

**TL;DR** -- Run `onboard` on the host to login and export an encrypted token file. Mount the file into the container and pass the encryption key as an env var.

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

> **Note:** The volume must be mounted `:rw` (read-write), not `:ro`. When the access token expires, the SDK refreshes it and writes the updated tokens back to the encrypted file. A read-only mount will cause token refresh to fail silently, and the container will lose API access once the current token expires.

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
│                               │    │ → re-encrypts on token refresh     │
└───────────────────────────────┘    └────────────────────────────────────┘
```

The `EncryptedFileTokenStore`:
- Decrypts the token file on `restoreSession()` using `ROBINHOOD_TOKEN_KEY`
- Injects the Bearer header on every Robinhood API request
- On 401, refreshes the token and writes re-encrypted tokens back to the file
- Uses AES-256-GCM with a random IV per write (authenticated encryption)

---

## Stopping access

Kill the container. Once it is gone:
- No process can read the encryption key from its env vars
- The encrypted file on the host is useless without the key
- No further token refreshes will occur, so the current access token expires naturally (~8.5 days after it was issued)

To revoke immediately, delete the encrypted file on the host:

```bash
rm ./tokens.enc   # wherever you ran `onboard` from
```

