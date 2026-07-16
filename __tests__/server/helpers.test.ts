import { describe, expect, it } from "vitest";
import { structured, textError } from "../../src/server/tools/_helpers.js";

describe("structured", () => {
  it("redacts sensitive keys in structuredContent, not just the text block", () => {
    const data = { access_token: "abc123", refresh_token: "ref-xyz", status: "ok" };
    const result = structured(data);

    // Text block: same redaction text() has always produced.
    expect(result.content[0]?.text).toBe(
      '{"access_token":"[REDACTED]","refresh_token":"[REDACTED]","status":"ok"}',
    );

    // structuredContent must be redacted too — not the raw input object.
    expect(result.structuredContent.access_token).toBe("[REDACTED]");
    expect(result.structuredContent.refresh_token).toBe("[REDACTED]");
    expect(result.structuredContent.status).toBe("ok");
  });

  it("keeps the text block and structuredContent as the same parsed object", () => {
    const data = { count: 2, items: ["a", "b"], nested: { ok: true } };
    const result = structured(data);
    expect(JSON.parse(result.content[0]?.text ?? "")).toEqual(result.structuredContent);
  });

  it("redacts a JWT embedded deep in structuredContent", () => {
    const fakeJwt =
      "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const data = { detail: { message: `token was ${fakeJwt}` } };
    const result = structured(data);
    const nested = result.structuredContent.detail as { message: string };
    expect(nested.message).toBe("token was [REDACTED]");
    expect(nested.message).not.toContain("eyJ");
  });

  it("does not carry structuredContent on the error path", () => {
    const result = textError("something failed");
    expect(result.isError).toBe(true);
    expect("structuredContent" in result).toBe(false);
  });
});
