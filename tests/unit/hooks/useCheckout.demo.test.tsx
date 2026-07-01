import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createWrapper } from "../../helpers/test-utils";
import type { MintOrderDetail } from "@/types";

// USDX-293: mode demo (dev/preview) TIDAK boleh memalsukan sukses on-chain. Ia hanya
// simulasikan konfirmasi bayar (→ PAID / "menunggu approval") lalu berhenti; COMPLETED +
// onChainTxHash HANYA dari pipeline Safe real. env di-mock demoAutocomplete=true.
vi.mock("@/lib/env", () => ({
  env: { apiBaseUrl: "http://api.test", appUrl: "", demoAutocomplete: true },
}));
vi.mock("@/lib/auth/redirect", () => ({ redirectToApp: vi.fn() }));

import { useCheckout } from "@/hooks/useCheckout";

function jsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    headers: new Headers(),
    json: async () => payload,
  } as unknown as Response;
}

// Order sudah pilih channel, BELUM bayar (paymentStatus=WAITING_FOR_PAYMENT) → paidish true
// → demo timer jalan. onChainTxHash null (belum ada tx on-chain sungguhan).
function makeOrder(o: Partial<MintOrderDetail> = {}): MintOrderDetail {
  return {
    id: "ord_1",
    orderNumber: "USDX-1",
    customerName: "Demo",
    type: "MINT",
    userAddress: "0xabc",
    chain: "polygon",
    inputCurrency: "USD",
    amount: "54",
    baseRate: "16000",
    spreadBuyPct: "2.5",
    effectiveRate: "16400",
    subtotalIdr: "1640000",
    mintFeePct: "1",
    mintFeeIdr: "16400",
    totalBeforePgFeeIdr: "1656400",
    paymentChannel: "VA",
    pgFeeIdr: null,
    totalFeeIdr: null,
    totalPayIdr: null,
    paymentBank: "BCA",
    paymentStatus: "WAITING_FOR_PAYMENT",
    safeStatus: "NONE",
    status: "WAITING_FOR_PAYMENT",
    paymentProvider: "MOCK",
    virtualAccountNo: "8808123456",
    paymentUrl: null,
    paymentRef: null,
    paidAt: null,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    safeTxHash: null,
    onChainTxHash: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...o,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse(200, { status: "success", data: makeOrder() }));
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.clear();
  window.history.replaceState(null, "", "/checkout/ord_1");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useCheckout — DEMO auto-complete (USDX-293)", () => {
  test("majukan ke 'menunggu approval', TIDAK PERNAH COMPLETED", async () => {
    const { result } = renderHook(() => useCheckout("ord_1"), { wrapper: createWrapper() });

    // GET awal → order sebelum demo maju (masih WAITING_FOR_PAYMENT).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.order?.status).toBe("WAITING_FOR_PAYMENT");

    // Lewati DEMO_STEP_MS (4s) → demo majukan tampilan ke PAID / menunggu approval.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(result.current.order?.paymentStatus).toBe("PAID");
    expect(result.current.order?.status).toBe("WAITING_FOR_APPROVAL");

    // Maju jauh (60s) — dulu demo maju paksa ke COMPLETED; sekarang HARUS tetap menunggu
    // approval, tanpa tx on-chain, non-terminal.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(result.current.order?.status).not.toBe("COMPLETED");
    expect(result.current.order?.onChainTxHash).toBeNull();
    expect(result.current.isTerminal).toBe(false);
  });
});
