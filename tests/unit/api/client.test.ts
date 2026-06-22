import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { apiFetch, ApiError } from "@/lib/api/client";
import { CHECKOUT_TOKEN_KEY } from "@/lib/auth/token";

function jsonResponse(
  status: number,
  payload: unknown,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    headers: new Headers(headers),
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

describe("apiFetch (checkout — bearer JWT, USDX-239)", () => {
  describe("auth", () => {
    test("attaches Authorization: Bearer from the sessionStorage token", async () => {
      sessionStorage.setItem(CHECKOUT_TOKEN_KEY, "tok-123");
      fetchMock.mockResolvedValue(jsonResponse(200, { status: "success", data: null }));
      await apiFetch("/api/v2/mint/ord_1");
      const [, init] = fetchMock.mock.calls[0];
      expect((init.headers as Headers).get("Authorization")).toBe("Bearer tok-123");
    });

    test("omits Authorization when no token is stored", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { status: "success", data: null }));
      await apiFetch("/api/v2/mint/ord_1");
      const [, init] = fetchMock.mock.calls[0];
      expect((init.headers as Headers).get("Authorization")).toBeNull();
    });

    test("does NOT send credentials: include (bearer-only, no cross-subdomain cookie)", async () => {
      sessionStorage.setItem(CHECKOUT_TOKEN_KEY, "tok-123");
      fetchMock.mockResolvedValue(jsonResponse(200, { status: "success", data: null }));
      await apiFetch("/api/v2/mint/ord_1");
      const [, init] = fetchMock.mock.calls[0];
      expect(init.credentials).toBeUndefined();
    });
  });

  describe("envelope", () => {
    test("unwraps the SoT success envelope and returns data", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { status: "success", metadata: {}, data: { id: "ord_1" } }),
      );
      const result = await apiFetch<{ id: string }>("/api/v2/mint/ord_1");
      expect(result).toEqual({ id: "ord_1" });
    });

    test("returns the raw payload when the handler has no envelope", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { id: "ord_1" }));
      const result = await apiFetch<{ id: string }>("/api/v2/mint/ord_1");
      expect(result).toEqual({ id: "ord_1" });
    });

    test("returns undefined for 204 No Content", async () => {
      fetchMock.mockResolvedValue(jsonResponse(204, null));
      await expect(apiFetch("/api/v2/mint/ord_1/pay")).resolves.toBeUndefined();
    });

    test("serializes the body as JSON with Content-Type", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { status: "success", data: null }));
      await apiFetch("/api/v2/mint/ord_1/pay", { method: "POST", body: { channel: "QRIS" } });
      const [, init] = fetchMock.mock.calls[0];
      expect((init.headers as Headers).get("Content-Type")).toBe("application/json");
      expect(init.body).toBe(JSON.stringify({ channel: "QRIS" }));
    });
  });

  describe("errors", () => {
    test("throws ApiError with code/message/details from the SoT error envelope", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(409, {
          status: "error",
          error: { code: "INVALID_ORDER_STATE", message: "bukan REQUESTED", details: { x: 1 } },
        }),
      );
      const err = (await apiFetch("/api/v2/mint/ord_1/pay").catch((e) => e)) as ApiError;
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(409);
      expect(err.code).toBe("INVALID_ORDER_STATE");
      expect(err.message).toBe("bukan REQUESTED");
      expect(err.details).toEqual({ x: 1 });
    });

    test("surfaces a 401 as ApiError (token absent/expired → redirect path)", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(401, { status: "error", error: { code: "UNAUTHORIZED", message: "no session" } }),
      );
      const err = (await apiFetch("/api/v2/mint/ord_1").catch((e) => e)) as ApiError;
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(401);
    });

    test("parses Retry-After into retryAfterSeconds on 429 RATE_LIMITED (USDX-252)", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          429,
          { status: "error", error: { code: "RATE_LIMITED", message: "Terlalu banyak request" } },
          { "Retry-After": "3" },
        ),
      );
      const err = (await apiFetch("/api/v2/mint/ord_1").catch((e) => e)) as ApiError;
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(429);
      expect(err.code).toBe("RATE_LIMITED");
      expect(err.retryAfterSeconds).toBe(3);
    });

    test("falls back to UNKNOWN when the error body is not parseable", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        headers: new Headers(),
        json: async () => {
          throw new Error("not json");
        },
      } as unknown as Response);
      const err = (await apiFetch("/api/v2/mint/ord_1").catch((e) => e)) as ApiError;
      expect(err.code).toBe("UNKNOWN");
      expect(err.message).toBe("Internal Server Error");
    });
  });
});
