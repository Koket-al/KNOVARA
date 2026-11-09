import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, ApiError } from "../src/services/api.js";

describe("API Service Client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("handles successful JSON response with credentials: 'include'", async () => {
    const mockData = { authenticated: true, user: { accountId: "alice.testnet" } };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => mockData,
    });

    const res = await api.getSession();
    expect(res).toEqual(mockData);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/session"),
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({ Accept: "application/json" }),
      })
    );
  });

  it("throws ApiError with status and code when response is not ok", async () => {
    const errorBody = { error: "Authentication required", code: "ERR_UNAUTHENTICATED" };
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => "application/json" },
      json: async () => errorBody,
    });

    await expect(api.getSession()).rejects.toThrow(ApiError);
    await expect(api.getSession()).rejects.toMatchObject({
      status: 401,
      code: "ERR_UNAUTHENTICATED",
      message: "Authentication required",
    });
  });

  it("sends JSON body and Content-Type on POST requests", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ nonceHex: "a".repeat(64), state: "test-state" }),
    });

    await api.getChallenge("alice.testnet", "http://localhost:3000");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/challenge"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ accountId: "alice.testnet", callbackUrl: "http://localhost:3000" }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("formats discovery search query params correctly", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ discoveries: [], pagination: { total: 0 } }),
    });

    await api.getDiscoveries({ page: 2, limit: 10, category: "BIOTECHNOLOGY", q: "vaccine", sort: "oldest" });

    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain("page=2");
    expect(calledUrl).toContain("limit=10");
    expect(calledUrl).toContain("category=BIOTECHNOLOGY");
    expect(calledUrl).toContain("q=vaccine");
    expect(calledUrl).toContain("sort=oldest");
  });
});

