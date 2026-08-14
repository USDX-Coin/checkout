import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createWrapper } from "../../helpers/test-utils";
import type { MintOrderDetail } from "@/types";

// Tiga cacat yang dilaporkan PO — semuanya lahir dari satu blok override demo di useCheckout:
//  1. "Pembayaran diterima" muncul padahal DurianPay belum dibayar sama sekali (back-office
//     masih "Waiting for payment"), dan flag demo-nya ikut terpasang di build production.
//  2. Setelah Safe ditandatangani DAN dieksekusi (backend COMPLETED), halaman tetap "Proses
//     on-chain" selamanya — override mengunci `status` dan menimpa tiap hasil poll.
//  3. Hanya refresh manual yang memperlihatkan kebenarannya (refresh me-reset `demoPaid`).
//
// `@/lib/env` di-mock lewat GETTER yang memanggil predikat ASLI `isNonProdApiBaseUrl`, bukan
// nilai literal: kalau daftar putih host non-prod dilonggarkan sampai memuat host production,
// test di bawah ikut merah. Wiring env → flag diuji terpisah di tests/unit/lib/env.test.ts.
const envState = vi.hoisted(() => ({
  apiBaseUrl: "https://api-dev.usdx.co.id",
  demoFlag: "true",
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    isNonProdApiBaseUrl: actual.isNonProdApiBaseUrl,
    env: {
      appUrl: "",
      get apiBaseUrl() {
        return envState.apiBaseUrl;
      },
      get demoAutocomplete() {
        return envState.demoFlag === "true" && actual.isNonProdApiBaseUrl(envState.apiBaseUrl);
      },
    },
  };
});
vi.mock("@/lib/auth/redirect", () => ({ redirectToApp: vi.fn() }));

import { useCheckout } from "@/hooks/useCheckout";

const DEMO_STEP_MS = 4_000;
const POLL_MS = 3_000;

function jsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    headers: new Headers(),
    json: async () => payload,
  } as unknown as Response;
}

// Order yang sudah memilih channel tapi BELUM dibayar → `paidish` true → timer demo jalan.
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
    totalPayIdr: "1656400",
    paymentBank: "BCA",
    paymentStatus: "WAITING_FOR_PAYMENT",
    safeStatus: "NONE",
    status: "WAITING_FOR_PAYMENT",
    paymentProvider: "DURIANPAY",
    virtualAccountNo: "8808123456",
    paymentUrl: null,
    paymentRef: null,
    paidAt: null,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    safeTxHash: null,
    onChainTxHash: null,
    createdAt: "2026-08-14T00:00:00Z",
    updatedAt: "2026-08-14T00:00:00Z",
    ...o,
  };
}

const fetchMock = vi.fn();

// Apa yang "dikatakan" backend saat ini. Diganti di tengah test untuk meniru poll berikutnya.
let served: MintOrderDetail;

function serve(order: MintOrderDetail) {
  served = order;
}

beforeEach(() => {
  vi.useFakeTimers();
  envState.apiBaseUrl = "https://api-dev.usdx.co.id";
  envState.demoFlag = "true";
  served = makeOrder();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => jsonResponse(200, { status: "success", data: served }));
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.clear();
  window.history.replaceState(null, "", "/checkout/ord_1");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mountCheckout() {
  return renderHook(() => useCheckout("ord_1"), { wrapper: createWrapper() });
}

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("useCheckout — mode demo saat halaman menunjuk backend production", () => {
  describe("positive", () => {
    test("backend dev + flag true → simulasi konfirmasi bayar jalan", async () => {
      const { result } = mountCheckout();
      await tick(0);
      expect(result.current.order?.paymentStatus).toBe("WAITING_FOR_PAYMENT");

      await tick(DEMO_STEP_MS);
      expect(result.current.order?.paymentStatus).toBe("PAID");
      expect(result.current.order?.status).toBe("WAITING_FOR_APPROVAL");
      // Kalau tampilannya dipalsukan, UI WAJIB diberi tahu supaya badge peringatan muncul.
      expect(result.current.isDemoOverride).toBe(true);
    });
  });

  describe("negative", () => {
    test("backend PRODUCTION + flag true → PAID palsu TIDAK PERNAH muncul", async () => {
      // Persis kombinasi build Jenkins `usdx/frontend-checkout/main` #8.
      envState.apiBaseUrl = "https://api.usdx.co.id";

      const { result } = mountCheckout();
      await tick(0);
      await tick(DEMO_STEP_MS);
      expect(result.current.order?.paymentStatus).toBe("WAITING_FOR_PAYMENT");
      expect(result.current.isDemoOverride).toBe(false);

      // Jauh setelah jendela demo — tetap apa adanya dari backend.
      await tick(60_000);
      expect(result.current.order?.paymentStatus).toBe("WAITING_FOR_PAYMENT");
      expect(result.current.order?.status).toBe("WAITING_FOR_PAYMENT");
      expect(result.current.isDemoOverride).toBe(false);
    });
  });

  describe("edge cases", () => {
    test("host di luar daftar putih → diperlakukan production → demo mati", async () => {
      envState.apiBaseUrl = "https://api-staging.usdx.co.id";

      const { result } = mountCheckout();
      await tick(0);
      await tick(DEMO_STEP_MS);
      expect(result.current.order?.paymentStatus).toBe("WAITING_FOR_PAYMENT");
      expect(result.current.isDemoOverride).toBe(false);
    });

    test("NEXT_PUBLIC_API_BASE_URL kosong → demo mati", async () => {
      envState.apiBaseUrl = "";

      const { result } = mountCheckout();
      await tick(0);
      await tick(DEMO_STEP_MS);
      expect(result.current.order?.paymentStatus).toBe("WAITING_FOR_PAYMENT");
      expect(result.current.isDemoOverride).toBe(false);
    });
  });
});

describe("useCheckout — simulasi demo hanya boleh MEMAJUKAN tampilan", () => {
  describe("positive", () => {
    test("keadaan nyata lebih awal → simulasi maju ke 'menunggu approval'", async () => {
      const { result } = mountCheckout();
      await tick(0);
      await tick(DEMO_STEP_MS);

      expect(result.current.order?.status).toBe("WAITING_FOR_APPROVAL");
      expect(result.current.order?.safeStatus).toBe("PENDING_APPROVAL");
      expect(result.current.isTerminal).toBe(false);
    });
  });

  describe("negative", () => {
    test("backend COMPLETED + Safe EXECUTED → keadaan NYATA menang, tanpa refresh", async () => {
      const { result } = mountCheckout();
      await tick(0);
      await tick(DEMO_STEP_MS);
      // Override aktif dulu — ini keadaan yang dulu terkunci selamanya.
      expect(result.current.order?.status).toBe("WAITING_FOR_APPROVAL");

      // Safe ditandatangani DAN dieksekusi; backend menutup order.
      serve(
        makeOrder({
          paymentStatus: "PAID",
          status: "COMPLETED",
          safeStatus: "EXECUTED",
          paidAt: "2026-08-14T02:00:00Z",
          safeTxHash: "0xsafe",
          onChainTxHash: "0xdeadbeef",
        }),
      );
      await tick(POLL_MS + 500);

      expect(result.current.order?.status).toBe("COMPLETED");
      expect(result.current.order?.safeStatus).toBe("EXECUTED");
      expect(result.current.order?.onChainTxHash).toBe("0xdeadbeef");
      expect(result.current.isTerminal).toBe(true);
      // Tak ada lagi yang dipalsukan → badge "DEMO" harus hilang.
      expect(result.current.isDemoOverride).toBe(false);
    });
  });

  describe("edge cases", () => {
    test("backend HELD → simulasi tidak mengecat 'Pembayaran diterima' di atasnya", async () => {
      const { result } = mountCheckout();
      await tick(0);
      await tick(DEMO_STEP_MS);
      expect(result.current.isDemoOverride).toBe(true);

      // Uang masuk tapi tak cocok otomatis — layar HELD wajib menang (paling rawan bayar dobel).
      serve(makeOrder({ paymentStatus: "HELD", status: "HELD" }));
      await tick(POLL_MS + 500);

      expect(result.current.order?.paymentStatus).toBe("HELD");
      expect(result.current.order?.status).toBe("HELD");
      expect(result.current.isDemoOverride).toBe(false);
    });

    test("backend EXPIRED + FAILED → simulasi tidak menutupi order mati", async () => {
      const { result } = mountCheckout();
      await tick(0);
      await tick(DEMO_STEP_MS);
      expect(result.current.isDemoOverride).toBe(true);

      serve(makeOrder({ paymentStatus: "EXPIRED", status: "FAILED" }));
      await tick(POLL_MS + 500);

      expect(result.current.order?.paymentStatus).toBe("EXPIRED");
      expect(result.current.order?.status).toBe("FAILED");
      expect(result.current.isDemoOverride).toBe(false);
    });

    test("status tak dikenal (drift enum backend) → simulasi menyerah, bukan menimpa", async () => {
      const { result } = mountCheckout();
      await tick(0);
      await tick(DEMO_STEP_MS);
      expect(result.current.isDemoOverride).toBe(true);

      serve({ ...makeOrder(), status: "SETTLING_ON_CHAIN" } as unknown as MintOrderDetail);
      await tick(POLL_MS + 500);

      expect(result.current.order?.status).toBe("SETTLING_ON_CHAIN");
      expect(result.current.isDemoOverride).toBe(false);
    });
  });
});
