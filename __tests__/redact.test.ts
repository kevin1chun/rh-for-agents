import { describe, expect, it } from "vitest";
import {
  redactTokens,
  scrubAccountIdentifiers,
  scrubRedundantAccountFields,
  scrubSensitiveKeys,
} from "../src/redact.js";

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

  it("redacts the profile uuid in a /followers/{uuid}/ URL (follow/unfollow error path)", () => {
    const input =
      "HTTP 500: POST https://api.robinhood.com/discovery/lists/f79523c4-7ac3-4592-91dc-7887039a4ad2/followers/95bf89c0-25ed-46fe-85ff-6618762931c7/";
    const out = redactTokens(input);
    expect(out).toContain("/followers/[USER]/");
    expect(out).not.toContain("95bf89c0-25ed-46fe-85ff-6618762931c7");
    // the list id (not personal) is left intact
    expect(out).toContain("f79523c4-7ac3-4592-91dc-7887039a4ad2");
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

describe("scrubAccountIdentifiers", () => {
  it("drops account-identifier keys from response bodies", () => {
    const body = {
      account_number: "1AB23456",
      account_id: "guid-123",
      account: "https://api.robinhood.com/accounts/1AB23456/",
      collateral: { cash: { amount: "100.00", currency: "USD" } },
    };
    const result = scrubAccountIdentifiers(body) as Record<string, unknown>;
    expect(result.account_number).toBeUndefined();
    expect(result.account_id).toBeUndefined();
    expect(result.account).toBeUndefined();
    // Non-identifier data is preserved.
    expect(result.collateral).toEqual({ cash: { amount: "100.00", currency: "USD" } });
  });

  it("redacts /accounts/{id}/ URL segments embedded in string values", () => {
    const body = { url: "https://api.robinhood.com/accounts/1AB23456/unified/", other: "keep" };
    const result = scrubAccountIdentifiers(body) as Record<string, unknown>;
    expect(result.url).toBe("https://api.robinhood.com/accounts/[ACCOUNT]/unified/");
    expect(result.other).toBe("keep");
  });

  it("recurses into nested objects and arrays", () => {
    const body = {
      results: [
        { account_number: "X", value: 1 },
        { account_number: "Y", value: 2 },
      ],
    };
    const result = scrubAccountIdentifiers(body) as { results: Array<Record<string, unknown>> };
    expect(result.results[0]?.account_number).toBeUndefined();
    expect(result.results[0]?.value).toBe(1);
    expect(result.results[1]?.value).toBe(2);
  });

  it("does not modify the original object", () => {
    const body = { account_number: "1AB23456" };
    scrubAccountIdentifiers(body);
    expect(body.account_number).toBe("1AB23456");
  });

  it("passes primitives through unchanged", () => {
    expect(scrubAccountIdentifiers(42)).toBe(42);
    expect(scrubAccountIdentifiers(null)).toBe(null);
    expect(scrubAccountIdentifiers("plain string")).toBe("plain string");
  });
});

describe("scrubRedundantAccountFields", () => {
  it("drops url/can_downgrade_to_cash/rhs_account_number but keeps account_number", () => {
    const account = {
      account_number: "1AB23456",
      url: "https://api.robinhood.com/accounts/1AB23456/",
      can_downgrade_to_cash: "https://api.robinhood.com/accounts/1AB23456/can_downgrade_to_cash/",
      rhs_account_number: 123456789,
      type: "cash",
    };
    const result = scrubRedundantAccountFields(account) as Record<string, unknown>;
    expect(result.account_number).toBe("1AB23456");
    expect(result.type).toBe("cash");
    expect(result.url).toBeUndefined();
    expect(result.can_downgrade_to_cash).toBeUndefined();
    expect(result.rhs_account_number).toBeUndefined();
  });

  it("leaves the account URL field on positions/orders untouched (no sibling account_number, it's the sole identifier)", () => {
    const position = {
      url: "https://api.robinhood.com/positions/xyz/",
      account: "https://api.robinhood.com/accounts/1AB23456/",
      quantity: "10.0000",
    };
    const result = scrubRedundantAccountFields(position) as Record<string, unknown>;
    expect(result.account).toBe("https://api.robinhood.com/accounts/1AB23456/");
    expect(result.url).toBe("https://api.robinhood.com/positions/xyz/");
  });

  it("recurses into arrays of accounts", () => {
    const body = {
      accounts: [
        {
          account_number: "A",
          url: "https://api.robinhood.com/accounts/A/",
          rhs_account_number: 1,
        },
        {
          account_number: "B",
          url: "https://api.robinhood.com/accounts/B/",
          rhs_account_number: 2,
        },
      ],
    };
    const result = scrubRedundantAccountFields(body) as {
      accounts: Array<Record<string, unknown>>;
    };
    expect(result.accounts[0]?.account_number).toBe("A");
    expect(result.accounts[0]?.url).toBeUndefined();
    expect(result.accounts[0]?.rhs_account_number).toBeUndefined();
    expect(result.accounts[1]?.account_number).toBe("B");
  });

  it("passes primitives through unchanged", () => {
    expect(scrubRedundantAccountFields(42)).toBe(42);
    expect(scrubRedundantAccountFields(null)).toBe(null);
    expect(scrubRedundantAccountFields("plain string")).toBe("plain string");
  });
});
