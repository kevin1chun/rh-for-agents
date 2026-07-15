/**
 * Token storage adapters for Robinhood API credentials.
 *
 * Two adapters are provided:
 *
 * - **KeychainTokenStore** (default) — OS keychain via Bun.secrets.
 *   Best for local dev on macOS/Linux with a desktop session.
 *
 * - **EncryptedFileTokenStore** — AES-256-GCM encrypted file.
 *   Best for Docker, headless servers, CI, and cloud deployments
 *   where no OS keychain is available.
 *
 * Auto-detection: if `ROBINHOOD_TOKENS_FILE` is set, the SDK uses
 * `EncryptedFileTokenStore`; otherwise it uses `KeychainTokenStore`.
 */

const KEYRING_SERVICE = "robinhood-for-agents";
const KEYRING_TOKENS = "session-tokens";
const KEYRING_ENCRYPTION_KEY = "encryption-key";

// ---------------------------------------------------------------------------
// TokenData
// ---------------------------------------------------------------------------

export interface TokenData {
  access_token: string;
  refresh_token: string;
  token_type: string;
  device_token: string;
  account_hint?: string;
  saved_at: number;
}

export function isTokenData(data: unknown): data is TokenData {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.access_token === "string" &&
    typeof obj.refresh_token === "string" &&
    typeof obj.token_type === "string" &&
    typeof obj.device_token === "string" &&
    typeof obj.saved_at === "number"
  );
}

/** Add `saved_at` timestamp if missing. */
export function withTimestamp(tokens: Omit<TokenData, "saved_at">): TokenData {
  return { ...tokens, saved_at: Date.now() / 1000 };
}

// ---------------------------------------------------------------------------
// TokenStore interface
// ---------------------------------------------------------------------------

export interface TokenStore {
  load(): Promise<TokenData | null>;
  save(tokens: TokenData): Promise<void>;
  delete(): Promise<void>;
}

// ---------------------------------------------------------------------------
// KeychainTokenStore — OS keychain via Bun.secrets
// ---------------------------------------------------------------------------

export class KeychainTokenStore implements TokenStore {
  async load(): Promise<TokenData | null> {
    try {
      const json = await Bun.secrets.get(KEYRING_SERVICE, KEYRING_TOKENS);
      if (json) {
        const data: unknown = JSON.parse(json);
        if (isTokenData(data)) return data;
      }
    } catch {
      // Bun.secrets unavailable or keychain access denied
    }
    return null;
  }

  async save(tokens: TokenData): Promise<void> {
    await Bun.secrets.set(KEYRING_SERVICE, KEYRING_TOKENS, JSON.stringify(tokens));
  }

  async delete(): Promise<void> {
    try {
      await Bun.secrets.delete({ service: KEYRING_SERVICE, name: KEYRING_TOKENS });
    } catch {
      // Bun.secrets unavailable
    }
  }
}

// ---------------------------------------------------------------------------
// EncryptedFileTokenStore — AES-256-GCM encrypted file
// ---------------------------------------------------------------------------

const AES_ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

/** Resolve the encryption key: env var → keychain → generate (keychain only). */
async function resolveEncryptionKey(): Promise<Buffer> {
  // 1. Env var
  const envKey = process.env.ROBINHOOD_TOKEN_KEY?.trim();
  if (envKey) {
    const key = Buffer.from(envKey, "base64");
    if (key.length !== KEY_BYTES) {
      throw new Error(`ROBINHOOD_TOKEN_KEY must decode to ${KEY_BYTES} bytes (got ${key.length})`);
    }
    return key;
  }

  // 2. Keychain
  try {
    const stored = await Bun.secrets.get(KEYRING_SERVICE, KEYRING_ENCRYPTION_KEY);
    if (stored) {
      return Buffer.from(stored, "base64");
    }
  } catch {
    // Keychain unavailable
  }

  // 3. Generate and store in keychain
  const { randomBytes } = await import("node:crypto");
  const key = randomBytes(KEY_BYTES);
  try {
    await Bun.secrets.set(KEYRING_SERVICE, KEYRING_ENCRYPTION_KEY, key.toString("base64"));
  } catch {
    console.error(
      "Warning: encryption key generated but could not be saved to keychain. " +
        "Tokens encrypted this session will be unreadable after the process exits. " +
        "Set ROBINHOOD_TOKEN_KEY env var to persist the key.",
    );
  }
  return key;
}

interface EncryptedBlob {
  iv: string; // base64
  tag: string; // base64
  ciphertext: string; // base64
}

function isEncryptedBlob(data: unknown): data is EncryptedBlob {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.iv === "string" && typeof obj.tag === "string" && typeof obj.ciphertext === "string"
  );
}

export class EncryptedFileTokenStore implements TokenStore {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath =
      filePath ??
      process.env.ROBINHOOD_TOKENS_FILE?.trim() ??
      `${process.env.HOME ?? "~"}/.robinhood-for-agents/tokens.enc`;
  }

  async load(): Promise<TokenData | null> {
    try {
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(this.filePath, "utf8");
      const blob: unknown = JSON.parse(raw);

      if (!isEncryptedBlob(blob)) return null;

      const key = await resolveEncryptionKey();
      const { createDecipheriv } = await import("node:crypto");
      const decipher = createDecipheriv(AES_ALGO, key, Buffer.from(blob.iv, "base64"));
      decipher.setAuthTag(Buffer.from(blob.tag, "base64"));

      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(blob.ciphertext, "base64")),
        decipher.final(),
      ]);

      const data: unknown = JSON.parse(decrypted.toString("utf8"));
      return isTokenData(data) ? data : null;
    } catch {
      return null;
    }
  }

  async save(tokens: TokenData): Promise<void> {
    const key = await resolveEncryptionKey();
    const { createCipheriv, randomBytes } = await import("node:crypto");
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(AES_ALGO, key, iv);

    const plaintext = JSON.stringify(tokens);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    const blob: EncryptedBlob = {
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ciphertext: encrypted.toString("base64"),
    };

    const { writeFile, mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(blob), { encoding: "utf8", mode: 0o600 });
  }

  async delete(): Promise<void> {
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(this.filePath);
    } catch {
      // File missing or not writable
    }
  }
}

// ---------------------------------------------------------------------------
// Auto-detection: pick the right store based on environment
// ---------------------------------------------------------------------------

/** Create the appropriate TokenStore based on environment. */
export function createTokenStore(): TokenStore {
  if (process.env.ROBINHOOD_TOKENS_FILE?.trim()) {
    return new EncryptedFileTokenStore();
  }
  return new KeychainTokenStore();
}

// ---------------------------------------------------------------------------
// Legacy exports — used by browser-auth.ts (login) and onboard.ts (existing-
// session check). Delegate to createTokenStore()'s env-aware pick, so a
// ROBINHOOD_TOKENS_FILE-configured deployment writes/reads the file store
// consistently everywhere, not just through an explicit `new
// EncryptedFileTokenStore()`. Previously these were hardcoded to
// KeychainTokenStore, so browser-based login always wrote to the keychain
// even when ROBINHOOD_TOKENS_FILE was set — silently breaking file-store mode
// for any user who logs in interactively rather than importing an encrypted
// token file.
// ---------------------------------------------------------------------------

export async function saveTokens(tokens: Omit<TokenData, "saved_at">): Promise<void> {
  await createTokenStore().save(withTimestamp(tokens));
}

export async function loadTokens(): Promise<TokenData | null> {
  return createTokenStore().load();
}

export async function deleteTokens(): Promise<void> {
  await createTokenStore().delete();
}
