import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor, createWrapper } from "../../helpers/test-utils";
import { CHECKOUT_TOKEN_KEY } from "@/lib/auth/token";
import type { MintOrderDetail } from "@/types";

// Mock redirect supaya 401 tidak benar-benar menavigasi (jsdom), tapi tetap bisa
// diassert dipanggil. Sisanya (capture token + client + bearer) dibiarkan ASLI agar
// anti-race teruji end-to-end lewat fetch sungguhan (di-stub).
vi.mock("@/lib/auth/redirect", () => ({ redirectToApp: vi.fn() }));
import { redirectToApp } from "@/lib/auth/redirect";
import { useCheckout } from "@/hooks/useCheckout";

const mockRedirect = vi.mocked(redirectToApp);

function jsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    headers: new Headers(),
    json: async () => payload,
  } as unknown as Response;
}

function makeOrder(o: Partial<MintOrderDetail> = {}): MintOrderDetail {
  return {
    id: "ord_1",
    orderNumber: "USDX-1",
    customerName: "Demo",
    type: "MINT",
    userAddress: "0xabc",
    chain: "polygon",
    inputCurrency: "USD",
    amount: "100",
    baseRate: "16000",
    spreadBuyPct: "2.5",
    effectiveRate: "16400",
    subtotalIdr: "1640000",
    mintFeePct: "1",
    mintFeeIdr: "16400",
    totalBeforePgFeeIdr: "1656400",
    paymentChannel: null,
    pgFeeIdr: null,
    totalFeeIdr: null,
    totalPayIdr: null,
    paymentBank: null,
    paymentStatus: "REQUESTED",
    safeStatus: "NONE",
    status: "WAITING_FOR_PAYMENT",
    paymentProvider: "MOCK",
    virtualAccountNo: null,
    paymentUrl: null,
    paymentRef: null,
    paidAt: null,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    safeTxHash: null,
    onChainTxHash: null,
    createdAt: "2026-06-17T00:00:00Z",
    updatedAt: "2026-06-17T00:00:00Z",
    ...o,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  mockRedirect.mockReset();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/checkout/ord_1");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCheckout — auth (USDX-239)", () => {
  test("captures #token before the first GET → first request carries Authorization: Bearer (anti-race)", async () => {
    window.location.hash = "#token=tok-1";
    fetchMock.mockResolvedValue(jsonResponse(200, { status: "success", data: makeOrder() }));

    const { result } = renderHook(() => useCheckout("ord_1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.order).not.toBeNull());

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer tok-1");
    // Token di-strip dari URL begitu di-capture.
    expect(window.location.hash).toBe("");
    // Tersimpan → refresh-safe.
    expect(sessionStorage.getItem(CHECKOUT_TOKEN_KEY)).toBe("tok-1");
  });

  test("401 → flags isUnauthorized and redirects back to app", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { status: "error", error: { code: "UNAUTHORIZED", message: "no session" } }),
    );

    const { result } = renderHook(() => useCheckout("ord_1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isUnauthorized).toBe(true));
    expect(mockRedirect).toHaveBeenCalled();
  });

  test("a 404 does NOT trigger the app redirect (order bukan milik user)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(404, { status: "error", error: { code: "NOT_FOUND", message: "nope" } }),
    );

    const { result } = renderHook(() => useCheckout("ord_1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isUnauthorized).toBe(false);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("useCheckout — baseline (behavior yang harus tetap, characterization)", () => {
  test("loads the order; future expiresAt → not expired, countdown > 0", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { status: "success", data: makeOrder() }));
    const { result } = renderHook(() => useCheckout("ord_1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.order).not.toBeNull());
    expect(result.current.isExpired).toBe(false);
    expect(result.current.secondsLeft).toBeGreaterThan(0);
  });

  test("past expiresAt → isExpired true", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        status: "success",
        data: makeOrder({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
      }),
    );
    const { result } = renderHook(() => useCheckout("ord_1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.order).not.toBeNull());
    expect(result.current.isExpired).toBe(true);
  });

  test("COMPLETED order → isTerminal true", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        status: "success",
        data: makeOrder({ status: "COMPLETED", paymentStatus: "PAID", safeStatus: "EXECUTED" }),
      }),
    );
    const { result } = renderHook(() => useCheckout("ord_1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.order).not.toBeNull());
    expect(result.current.isTerminal).toBe(true);
  });

  test("pay() posts channel+bank and updates the cached order", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(200, {
            status: "success",
            data: makeOrder({
              paymentStatus: "WAITING_FOR_PAYMENT",
              paymentChannel: "VA",
              paymentBank: "BCA",
              virtualAccountNo: "8808123456",
            }),
          }),
        );
      }
      return Promise.resolve(jsonResponse(200, { status: "success", data: makeOrder() }));
    });

    const { result } = renderHook(() => useCheckout("ord_1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.order).not.toBeNull());

    await act(async () => {
      await result.current.pay("VA", "BCA");
    });

    const payCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(payCall?.[0]).toContain("/api/v2/mint/ord_1/pay");
    expect(payCall?.[1].body).toBe(JSON.stringify({ channel: "VA", bank: "BCA" }));
    await waitFor(() => expect(result.current.order?.virtualAccountNo).toBe("8808123456"));
  });

  test("pay() on a non-REQUESTED order surfaces a mapped payError", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(409, {
            status: "error",
            error: { code: "INVALID_ORDER_STATE", message: "bukan REQUESTED" },
          }),
        );
      }
      return Promise.resolve(jsonResponse(200, { status: "success", data: makeOrder() }));
    });

    const { result } = renderHook(() => useCheckout("ord_1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.order).not.toBeNull());

    await act(async () => {
      await result.current.pay("QRIS").catch(() => {});
    });

    await waitFor(() => expect(result.current.payError).toContain("tidak lagi bisa memilih metode"));
  });
});
