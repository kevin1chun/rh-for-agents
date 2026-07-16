import { describe, expect, it, vi } from "vitest";
import { APIError, NotFoundError, RateLimitError } from "../../src/client/errors.js";
import { requestDelete, requestGet, requestPatch, requestPost } from "../../src/client/http.js";
import type { RobinhoodSession } from "../../src/client/session.js";

function mockSession(
  responses: Array<{ ok: boolean; status: number; json: () => Promise<unknown> }>,
): RobinhoodSession {
  let callIndex = 0;
  const getResponse = () => {
    const resp = responses[callIndex] ?? responses[responses.length - 1] ?? responses[0];
    callIndex++;
    return resp as Response;
  };
  return {
    get: vi.fn().mockImplementation(() => Promise.resolve(getResponse())),
    post: vi.fn().mockImplementation(() => Promise.resolve(getResponse())),
    patch: vi.fn().mockImplementation(() => Promise.resolve(getResponse())),
    delete: vi.fn().mockImplementation(() => Promise.resolve(getResponse())),
  } as unknown as RobinhoodSession;
}

function jsonResponse(
  body: unknown,
  status = 200,
): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

describe("requestGet", () => {
  it("regular returns raw JSON", async () => {
    const session = mockSession([jsonResponse({ foo: "bar" })]);
    const data = await requestGet(session, "https://api.test/");
    expect(data).toEqual({ foo: "bar" });
  });

  it("results returns results array", async () => {
    const session = mockSession([jsonResponse({ results: [1, 2, 3], next: null })]);
    const data = await requestGet(session, "https://api.test/", { dataType: "results" });
    expect(data).toEqual([1, 2, 3]);
  });

  it("results returns empty array when missing", async () => {
    const session = mockSession([jsonResponse({})]);
    const data = await requestGet(session, "https://api.test/", { dataType: "results" });
    expect(data).toEqual([]);
  });

  it("indexzero returns first result", async () => {
    const session = mockSession([jsonResponse({ results: [{ id: "first" }, { id: "second" }] })]);
    const data = await requestGet(session, "https://api.test/", { dataType: "indexzero" });
    expect(data).toEqual({ id: "first" });
  });

  it("indexzero returns null for empty results", async () => {
    const session = mockSession([jsonResponse({ results: [] })]);
    const data = await requestGet(session, "https://api.test/", { dataType: "indexzero" });
    expect(data).toBeNull();
  });

  it("pagination follows next links", async () => {
    const session = mockSession([
      jsonResponse({ results: [1, 2], next: "https://api.robinhood.com/positions/?page=2" }),
      jsonResponse({ results: [3, 4], next: null }),
    ]);
    const data = await requestGet(session, "https://api.robinhood.com/positions/", {
      dataType: "pagination",
    });
    expect(data).toEqual([1, 2, 3, 4]);
  });

  it("passes params to session.get", async () => {
    const session = mockSession([jsonResponse({ results: [] })]);
    await requestGet(session, "https://api.test/", {
      dataType: "results",
      params: { symbol: "AAPL" },
    });
    expect(session.get).toHaveBeenCalledWith("https://api.test/", { symbol: "AAPL" });
  });
});

describe("requestPost", () => {
  it("returns JSON response", async () => {
    const session = mockSession([jsonResponse({ ok: true })]);
    const data = await requestPost(session, "https://api.test/", {
      payload: { key: "value" },
    });
    expect(data).toEqual({ ok: true });
  });

  it("returns empty object for 204", async () => {
    const session = mockSession([{ ok: true, status: 204, json: () => Promise.resolve(null) }]);
    const data = await requestPost(session, "https://api.test/");
    expect(data).toEqual({});
  });

  it("passes asJson option to session.post", async () => {
    const session = mockSession([jsonResponse({ ok: true })]);
    await requestPost(session, "https://api.test/", {
      payload: { key: "value" },
      asJson: true,
    });
    expect(session.post).toHaveBeenCalledWith(
      "https://api.test/",
      { key: "value" },
      { asJson: true, timeoutMs: undefined },
    );
  });
});

describe("requestPatch", () => {
  it("returns JSON response", async () => {
    const session = mockSession([jsonResponse({ ok: true })]);
    const data = await requestPatch(session, "https://api.test/", { payload: { name: "x" } });
    expect(data).toEqual({ ok: true });
  });

  it("returns empty object for 204", async () => {
    const session = mockSession([{ ok: true, status: 204, json: () => Promise.resolve(null) }]);
    const data = await requestPatch(session, "https://api.test/");
    expect(data).toEqual({});
  });

  it("passes payload to session.patch", async () => {
    const session = mockSession([jsonResponse({ ok: true })]);
    await requestPatch(session, "https://api.test/", { payload: { name: "x" } });
    expect(session.patch).toHaveBeenCalledWith(
      "https://api.test/",
      { name: "x" },
      {
        timeoutMs: undefined,
      },
    );
  });
});

describe("requestDelete", () => {
  it("returns empty object for 204", async () => {
    const session = mockSession([{ ok: true, status: 204, json: () => Promise.resolve(null) }]);
    const data = await requestDelete(session, "https://api.test/");
    expect(data).toEqual({});
  });

  it("returns JSON when available", async () => {
    const session = mockSession([jsonResponse({ deleted: true })]);
    const data = await requestDelete(session, "https://api.test/");
    expect(data).toEqual({ deleted: true });
  });
});

describe("Error mapping", () => {
  it("404 throws NotFoundError", async () => {
    const session = mockSession([jsonResponse({ detail: "Not found" }, 404)]);
    await expect(requestGet(session, "https://api.test/")).rejects.toThrow(NotFoundError);
  });

  it("429 throws RateLimitError", async () => {
    const session = mockSession([jsonResponse({ detail: "Rate limited" }, 429)]);
    await expect(requestGet(session, "https://api.test/")).rejects.toThrow(RateLimitError);
  });

  it("500 throws APIError", async () => {
    const session = mockSession([jsonResponse({ error: "Internal error" }, 500)]);
    await expect(requestGet(session, "https://api.test/")).rejects.toThrow(APIError);
  });

  it("error includes status code and body", async () => {
    const session = mockSession([jsonResponse({ detail: "gone" }, 410)]);
    try {
      await requestGet(session, "https://api.test/");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(APIError);
      const err = e as APIError;
      expect(err.statusCode).toBe(410);
      expect(err.responseBody).toEqual({ detail: "gone" });
      expect(err.message).toContain("410");
      expect(err.message).toContain("gone");
    }
  });
});
