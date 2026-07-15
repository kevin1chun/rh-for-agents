/** Shared helpers for MCP tool handlers. */

import { getClient } from "../../client/index.js";
import { redactTokens } from "../../redact.js";

/**
 * Success-path result helper for tools with an `outputSchema`. Serializes +
 * redacts `data` exactly like `text()` (same text block, so existing
 * content[0].text assertions keep passing), then round-trips the redacted
 * JSON string back through JSON.parse to build `structuredContent`. The
 * round-trip matters: redaction must apply to structuredContent too, not
 * just the text block, and re-parsing the already-redacted string is the only
 * way to guarantee that (rather than redacting the text and structured copies
 * independently, which could drift).
 */
export function structured(data: unknown) {
  const redactedJson = redactTokens(JSON.stringify(data));
  return {
    content: [{ type: "text" as const, text: redactedJson }],
    structuredContent: JSON.parse(redactedJson) as Record<string, unknown>,
  };
}

export function textError(msg: string) {
  return {
    content: [{ type: "text" as const, text: redactTokens(JSON.stringify({ error: msg })) }],
    isError: true as const,
  };
}

export function getRh() {
  return getClient();
}

export async function getAuthenticatedRh() {
  const rh = getClient();
  if (!rh.isLoggedIn) {
    await rh.restoreSession();
  }
  return rh;
}
