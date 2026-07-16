import { describe, expect, it } from "vitest";
import pkg from "../package.json";
import { VERSION } from "../src/version.js";

// Guards against the stale-version drift that accumulated across earlier
// releases: the MCP handshake and HTTP User-Agent read from src/version.ts,
// which must track package.json. If a release bumps one and not the other,
// this test goes red.
describe("VERSION", () => {
  it("matches package.json version", () => {
    expect(VERSION).toBe(pkg.version);
  });
});
