/** HTTP request helpers with pagination and dataType handling. */

import { z } from "zod";
import { redactTokens, scrubSensitiveKeys } from "../redact.js";
import { APIError, NotFoundError, RateLimitError, TokenExpiredError } from "./errors.js";
import type { RobinhoodSession } from "./session.js";
import { trustedOrigins } from "./urls.js";

/** Reject URLs that point outside trusted Robinhood domains. */
function assertTrustedUrl(url: string): void {
  const parsed = new URL(url);
  if (!trustedOrigins().has(parsed.origin)) {
    throw new APIError(`Refusing to follow URL to untrusted host: ${parsed.hostname}`);
  }
}

/** Parse a single value against a Zod schema. Throws ZodError on mismatch. */
export function parseOne<T>(schema: z.ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

/** Parse an array of values against a Zod schema. Throws ZodError on mismatch. */
export function parseArray<T>(schema: z.ZodType<T>, data: unknown): T[] {
  return z.array(schema).parse(data);
}

export type DataType = "regular" | "results" | "indexzero" | "pagination";

export async function requestGet(
  session: RobinhoodSession,
  url: string,
  opts?: { dataType?: DataType; params?: Record<string, string> },
): Promise<unknown> {
  const dataType = opts?.dataType ?? "regular";
  const response = await session.get(url, opts?.params);
  await raiseForStatus(response);
  const data = (await response.json()) as Record<string, unknown>;

  if (dataType === "regular") {
    return data;
  }

  if (dataType === "results") {
    return (data.results as unknown[]) ?? [];
  }

  if (dataType === "indexzero") {
    const results = (data.results as unknown[]) ?? [];
    return results[0] ?? null;
  }

  if (dataType === "pagination") {
    const results = [...((data.results as unknown[]) ?? [])];
    let nextUrl = data.next as string | null;
    while (nextUrl) {
      assertTrustedUrl(nextUrl);
      const resp = await session.get(nextUrl);
      await raiseForStatus(resp);
      const page = (await resp.json()) as Record<string, unknown>;
      results.push(...((page.results as unknown[]) ?? []));
      nextUrl = (page.next as string | null) ?? null;
    }
    return results;
  }

  return data;
}

export async function requestPost(
  session: RobinhoodSession,
  url: string,
  opts?: {
    payload?: Record<string, unknown>;
    asJson?: boolean;
    timeoutMs?: number;
  },
): Promise<unknown> {
  const response = await session.post(url, opts?.payload, {
    asJson: opts?.asJson,
    timeoutMs: opts?.timeoutMs,
  });
  await raiseForStatus(response);

  if (response.status === 204) {
    return {};
  }
  return response.json();
}

export async function requestPatch(
  session: RobinhoodSession,
  url: string,
  opts?: { payload?: Record<string, unknown>; timeoutMs?: number },
): Promise<unknown> {
  const response = await session.patch(url, opts?.payload, {
    timeoutMs: opts?.timeoutMs,
  });
  await raiseForStatus(response);

  if (response.status === 204) {
    return {};
  }
  return response.json();
}

export async function requestDelete(session: RobinhoodSession, url: string): Promise<unknown> {
  const response = await session.delete(url);
  await raiseForStatus(response);

  if (response.status === 204) {
    return {};
  }
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function raiseForStatus(response: Response): Promise<void> {
  if (response.ok) return;

  const status = response.status;
  let body: Record<string, unknown> | undefined;

  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = undefined;
  }

  let detail = "";
  if (body) {
    detail = redactTokens(String(body.detail ?? body.error ?? JSON.stringify(body)));
  }

  const msg = detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}`;
  const safeBody = body ? scrubSensitiveKeys(body) : undefined;

  if (status === 404) {
    throw new NotFoundError(msg, { statusCode: status, responseBody: safeBody });
  }
  if (status === 429) {
    throw new RateLimitError(msg, { statusCode: status, responseBody: safeBody });
  }
  // A 401 here means automatic refresh already ran and could not recover, so
  // the session is genuinely unusable. Say that, instead of a bare HTTP 401
  // that gives the caller no idea a re-login is what's needed.
  if (status === 401) {
    throw new TokenExpiredError(
      `${msg} — session expired and could not be refreshed. Re-authenticate with browser login.`,
    );
  }
  throw new APIError(msg, { statusCode: status, responseBody: safeBody });
}
