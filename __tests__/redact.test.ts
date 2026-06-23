import { describe, expect, it } from "vitest";
import { redactTokens, scrubSensitiveKeys } from "../src/redact.js";

describe("redactTokens", () => {
  const fakeJwt =
    "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4iLCJpYXQiOjE1MTYyMzkwMjJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

  it("redacts JWT-shaped strings", () => {
    const input = `HTTP 401: ${fakeJwt}`;
    expect(redactTokens(input)).toBe("HTTP 401: [REDACTED]");
  });

  it("redacts access_token values in JSON", () => {
    const input = '{"access_token":"abc123","detail":"invalid"}';
    expect(redactTokens(input)).toBe('{"access_token":"[REDACTED]","detail":"invalid"}');
  });

  it("redacts refresh_token values in JSON", () => {
    const input = '{"refresh_token":"ref-xyz"}';
    expect(redactTokens(input)).toBe('{"refresh_token":"[REDACTED]"}');
  });

  it("redacts device_token values in JSON", () => {
    const input = '{"device_token":"550e8400-e29b-41d4-a716-446655440000"}';
    expect(redactTokens(input)).toBe('{"device_token":"[REDACTED]"}');
  });

  it("redacts multiple sensitive fields at once", () => {
    const input = '{"access_token":"tok","refresh_token":"ref","status":"ok"}';
    const result = redactTokens(input);
    expect(result).toBe('{"access_token":"[REDACTED]","refresh_token":"[REDACTED]","status":"ok"}');
  });

  it("redacts JWT inside a JSON error body", () => {
    const input = `{"error":"Invalid token: ${fakeJwt}"}`;
    const result = redactTokens(input);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("eyJ");
  });

  it("does not redact normal strings", () => {
    const input = '{"symbol":"AAPL","price":150.25}';
    expect(redactTokens(input)).toBe(input);
  });

  it("does not redact UUIDs", () => {
    const input = '{"order_id":"550e8400-e29b-41d4-a716-446655440000"}';
    expect(redactTokens(input)).toBe(input);
  });

  it("does not redact account_number (needed for multi-account flows)", () => {
    const input = '{"account_number":"1AB23456","type":"individual"}';
    expect(redactTokens(input)).toBe(input);
  });

  it("does not redact short dotted strings", () => {
    const input = "version 1.2.3";
    expect(redactTokens(input)).toBe(input);
  });

  it("handles empty string", () => {
    expect(redactTokens("")).toBe("");
  });
});

describe("scrubSensitiveKeys", () => {
  it("redacts known sensitive keys", () => {
    const obj = {
      access_token: "secret",
      refresh_token: "also-secret",
      device_token: "device-uuid",
      detail: "some error",
    };
    const result = scrubSensitiveKeys(obj);
    expect(result.access_token).toBe("[REDACTED]");
    expect(result.refresh_token).toBe("[REDACTED]");
    expect(result.device_token).toBe("[REDACTED]");
    expect(result.detail).toBe("some error");
  });

  it("redacts the 'token' key", () => {
    const obj = { token: "my-token", status: "ok" };
    const result = scrubSensitiveKeys(obj);
    expect(result.token).toBe("[REDACTED]");
    expect(result.status).toBe("ok");
  });

  it("does not modify the original object", () => {
    const obj = { access_token: "secret" };
    scrubSensitiveKeys(obj);
    expect(obj.access_token).toBe("secret");
  });

  it("passes through objects with no sensitive keys", () => {
    const obj = { symbol: "AAPL", price: 150 };
    expect(scrubSensitiveKeys(obj)).toEqual(obj);
  });

  it("does not redact account_number (needed for multi-account flows)", () => {
    const obj = { account_number: "1AB23456", type: "individual" };
    const result = scrubSensitiveKeys(obj);
    expect(result.account_number).toBe("1AB23456");
    expect(result.type).toBe("individual");
  });
});
