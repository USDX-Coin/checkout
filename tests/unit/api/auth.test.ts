import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { exchangeHandoffCode } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

function jsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    headers: new Headers(),
    json: async () => payload,
  } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("exchangeHandoffCode (USDX-378 — one-time code → session token)", () => {
  test("POSTs { code } to the public exchange endpoint and returns the token", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { status: "success", data: { token: "sess-xyz" } }),
    );

    const token = await exchangeHandoffCode("hc-abc");

    expect(token).toBe("sess-xyz");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/v2/auth/checkout-token/exchange");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ code: "hc-abc" }));
    // Pre-auth endpoint: no session token yet → no Authorization header.
    expect((init.headers as Headers).get("Authorization")).toBeNull();
  });

  test("tolerates an un-enveloped { token } body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { token: "sess-raw" }));
    await expect(exchangeHandoffCode("hc-abc")).resolves.toBe("sess-raw");
  });

  test("throws ApiError 401 INVALID_HANDOFF_CODE for an invalid/expired/used code", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, {
        status: "error",
        error: { code: "INVALID_HANDOFF_CODE", message: "kode tidak valid" },
      }),
    );

    const err = (await exchangeHandoffCode("stale").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(err.code).toBe("INVALID_HANDOFF_CODE");
  });
});
