/**
 * Single source of truth for the package version.
 *
 * Surfaced in the MCP server handshake (`server.ts`) and the HTTP
 * `User-Agent` (`session.ts`). Keep in sync with `package.json`'s `version`.
 * `__tests__/version.test.ts` fails the build if these ever diverge, so the
 * stale-version drift that accumulated across earlier releases can't recur.
 */
export const VERSION = "1.0.0";
