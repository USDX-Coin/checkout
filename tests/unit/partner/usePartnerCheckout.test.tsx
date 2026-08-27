import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, createWrapper } from "../../helpers/test-utils";
import { usePartnerCheckout } from "@/hooks/usePartnerCheckout";
import { CHECKOUT_TOKEN_KEY, setToken } from "@/lib/auth/token";
import type { PartnerCheckoutSession } from "@/lib/partner/types";
import type { MintOrderDetail } from "@/types";

// USDX-548 — perilaku jalur partner yang menyangkut uang & waktu:
//   * checkout bisa dibuka dengan kredensial SESI PARTNER, tanpa akun & tanpa aplikasi USDX
//   * begitu uang masuk / `WAITING_FOR_APPROVAL`, polling BERHENTI (jangan tahan orang berjam-jam)
//   * polling punya ANGGARAN — bukan tanpa batas
//   * sesi tidak hidup lebih lama dari ordernya
//   * 401/403/404/410 diratakan → tidak membocorkan apakah ordernya ada

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
    customerName: "Siti",
    type: "MINT",
    userAddress: "0xabc",
    chain: "polygon",
    inputCurrency: "IDR",
    amount: "60.606060",
    baseRate: "16000",
    spreadBuyPct: "2.5",
    effectiveRate: "16400",
    subtotalIdr: "1000000",
    mintFeePct: "1",
    mintFeeIdr: "5000",
    totalBeforePgFeeIdr: "1005000",
    paymentChannel: "VA",
    pgFeeIdr: "4000",
    totalFeeIdr: "9000",
    totalPayIdr: "1009000",
    paymentBank: "BNI",
    paymentStatus: "WAITING_FOR_PAYMENT",
    safeStatus: "NONE",
    status: "WAITING_FOR_PAYMENT",
    paymentProvider: "DURIANPAY_SNAP",
    virtualAccountNo: "9881234567890",
    paymentUrl: null,
    paymentRef: "ref-1",
    paidAt: null,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    safeTxHash: null,
    onChainTxHash: null,
    createdAt: "2026-08-27T09:14:02Z",
    updatedAt: "2026-08-27T09:14:02Z",
    ...o,
  };
}

function makeSession(o: Partial<PartnerCheckoutSession> = {}): PartnerCheckoutSession {
  return {
    orderId: "ord_1",
    model: "NEUTRAL",
    status: "OPENED",
    sessionToken: "psess-abc",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    returnUrl: "https://partner.co.id/pesanan/selesai",
    cancelUrl: null,
    branding: null,
    ...o,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderPartnerHook(session: PartnerCheckoutSession | null) {
  return renderHook(() => usePartnerCheckout(session), { wrapper: createWrapper() });
}

describe("usePartnerCheckout — membuka checkout tanpa akun & tanpa aplikasi USDX", () => {
  describe("positive", () => {
    test("GET order memakai kredensial SESI PARTNER, walau tak ada sesi aplikasi sama sekali", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { status: "success", data: makeOrder() }));
      const { result } = renderPartnerHook(makeSession());

      await waitFor(() => expect(result.current.order).not.toBeNull());

      // Tak ada token aplikasi yang tersimpan — customer partner memang tak punya akun.
      expect(sessionStorage.getItem(CHECKOUT_TOKEN_KEY)).toBeNull();

      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain("/api/v2/mint/ord_1");
      expect(new Headers(init.headers).get("Authorization")).toBe("Bearer psess-abc");
    });

    test("sesi aplikasi yang ADA tidak dipakai dan tidak tertimpa", async () => {
      setToken("app-session-token");
      fetchMock.mockResolvedValue(jsonResponse(200, { status: "success", data: makeOrder() }));
      const { result } = renderPartnerHook(makeSession());

      await waitFor(() => expect(result.current.order).not.toBeNull());

      const [, init] = fetchMock.mock.calls[0];
      // Kredensial partner yang menang, bukan token aplikasi.
      expect(new Headers(init.headers).get("Authorization")).toBe("Bearer psess-abc");
      // Dan token aplikasi tetap utuh.
      expect(sessionStorage.getItem(CHECKOUT_TOKEN_KEY)).toBe("app-session-token");
    });

    test("pilih bank → POST /pay channel VA + bank, dengan kredensial partner", async () => {
      fetchMock.mockImplementation((url: string) =>
        Promise.resolve(
          jsonResponse(200, {
            status: "success",
            data: String(url).endsWith("/pay")
              ? makeOrder({ paymentBank: "MANDIRI" })
              : makeOrder({ paymentStatus: "REQUESTED" }),
          }),
        ),
      );
      const { result } = renderPartnerHook(makeSession());
      await waitFor(() => expect(result.current.order).not.toBeNull());

      await result.current.pay("MANDIRI");

      const payCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/pay"))!;
      expect(JSON.parse(payCall[1].body)).toEqual({ channel: "VA", bank: "MANDIRI" });
      expect(new Headers(payCall[1].headers).get("Authorization")).toBe("Bearer psess-abc");
    });
  });

  describe("negative", () => {
    test("tanpa sesi → tidak ada request sama sekali", async () => {
      renderPartnerHook(null);
      await new Promise((r) => setTimeout(r, 20));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    // AC: pesannya tidak boleh membocorkan apakah ordernya ada. Keempat status ini harus
    // menghasilkan SATU keadaan yang sama.
    test.each([401, 403, 404, 410])("%i → isSessionInvalid, bukan keadaan yang berbeda", async (status) => {
      fetchMock.mockResolvedValue(
        jsonResponse(status, {
          status: "error",
          error: { code: "X", message: `order ord_9 ${status}` },
        }),
      );
      const { result } = renderPartnerHook(makeSession());

      await waitFor(() => expect(result.current.isSessionInvalid).toBe(true));
      // `isError` TIDAK menyala — kalau menyala, halaman akan menampilkan layar berbeda
      // dan perbedaan itu sendiri jadi orakel.
      expect(result.current.isError).toBe(false);
    });

    test("500 → isError (boleh dicoba lagi), BUKAN sesi tak berlaku", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(500, { status: "error", error: { code: "INTERNAL", message: "boom" } }),
      );
      const { result } = renderPartnerHook(makeSession());

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.isSessionInvalid).toBe(false);
    });
  });

  describe("edge case", () => {
    test("sesi masih panjang tapi ORDER sudah mati → sesi dianggap kedaluwarsa", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          status: "success",
          data: makeOrder({ expiresAt: new Date(Date.now() - 60_000).toISOString() }),
        }),
      );
      const { result } = renderPartnerHook(
        makeSession({ expiresAt: new Date(Date.now() + 86_400_000).toISOString() }),
      );

      await waitFor(() => expect(result.current.order).not.toBeNull());
      expect(result.current.isSessionInvalid).toBe(true);
      expect(result.current.secondsLeft).toBe(0);
    });

    test("sesi kedaluwarsa TAPI uang sudah masuk → halaman TIDAK ditutup", async () => {
      // Orang yang sudah transfer berhak melihat konfirmasinya, bukan "tautan tidak berlaku".
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          status: "success",
          data: makeOrder({
            paymentStatus: "PAID",
            status: "WAITING_FOR_APPROVAL",
            expiresAt: new Date(Date.now() - 60_000).toISOString(),
          }),
        }),
      );
      const { result } = renderPartnerHook(
        makeSession({ expiresAt: new Date(Date.now() - 60_000).toISOString() }),
      );

      await waitFor(() => expect(result.current.order).not.toBeNull());
      expect(result.current.isSessionInvalid).toBe(false);
      expect(result.current.isDoneWaiting).toBe(true);
    });

    test("sisa waktu mengikuti batas yang paling dekat (sesi, bukan order)", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          status: "success",
          data: makeOrder({ expiresAt: new Date(Date.now() + 7_200_000).toISOString() }),
        }),
      );
      const { result } = renderPartnerHook(
        makeSession({ expiresAt: new Date(Date.now() + 300_000).toISOString() }),
      );

      await waitFor(() => expect(result.current.order).not.toBeNull());
      expect(result.current.secondsLeft).toBeLessThanOrEqual(300);
      expect(result.current.secondsLeft).toBeGreaterThan(290);
    });
  });
});

describe("usePartnerCheckout — kapan berhenti menunggu", () => {
  describe("positive", () => {
    test("MASIH menunggu pembayaran → halaman memang terus bertanya (kontrol positif)", async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue(
        jsonResponse(200, { status: "success", data: makeOrder() }),
      );
      const { result } = renderPartnerHook(makeSession());

      await vi.advanceTimersByTimeAsync(50);
      expect(result.current.order).not.toBeNull();
      const afterFirst = fetchMock.mock.calls.length;

      await vi.advanceTimersByTimeAsync(20_000);
      // Tanpa kontrol positif ini, tes "berhenti" di bawah bisa lolos hanya karena polling
      // tidak pernah jalan sama sekali.
      expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFirst);
    });
  });

  describe("negative", () => {
    test("WAITING_FOR_APPROVAL → BERHENTI bertanya (keadaan terlama, bisa berjam-jam)", async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          status: "success",
          data: makeOrder({ paymentStatus: "PAID", status: "WAITING_FOR_APPROVAL" }),
        }),
      );
      const { result } = renderPartnerHook(makeSession());

      await vi.advanceTimersByTimeAsync(50);
      expect(result.current.isDoneWaiting).toBe(true);
      const afterFirst = fetchMock.mock.calls.length;

      await vi.advanceTimersByTimeAsync(120_000);
      expect(fetchMock.mock.calls.length).toBe(afterFirst);
    });

    test.each([
      ["COMPLETED", { paymentStatus: "PAID" as const, status: "COMPLETED" as const }],
      ["FAILED", { status: "FAILED" as const }],
      ["HELD", { paymentStatus: "HELD" as const, status: "HELD" as const }],
      ["EXPIRED", { paymentStatus: "EXPIRED" as const }],
    ])("%s → berhenti bertanya", async (_label, patch) => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue(
        jsonResponse(200, { status: "success", data: makeOrder(patch) }),
      );
      renderPartnerHook(makeSession());

      await vi.advanceTimersByTimeAsync(50);
      const afterFirst = fetchMock.mock.calls.length;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fetchMock.mock.calls.length).toBe(afterFirst);
    });
  });

  describe("edge case", () => {
    test("ANGGARAN polling habis → berhenti sendiri + halaman menawarkan Perbarui status", async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue(jsonResponse(200, { status: "success", data: makeOrder() }));
      const { result } = renderPartnerHook(
        // Order berumur panjang: tanpa anggaran, polling akan jalan berjam-jam.
        makeSession({ expiresAt: new Date(Date.now() + 86_400_000).toISOString() }),
      );

      await vi.advanceTimersByTimeAsync(50);
      // Lewati seluruh jendela anggaran (15 menit).
      await vi.advanceTimersByTimeAsync(16 * 60 * 1000);
      const afterBudget = fetchMock.mock.calls.length;

      expect(result.current.isPollBudgetSpent).toBe(true);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fetchMock.mock.calls.length).toBe(afterBudget);
    });

    test("refresh() membuka jendela baru → bertanya lagi", async () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue(jsonResponse(200, { status: "success", data: makeOrder() }));
      const { result } = renderPartnerHook(
        makeSession({ expiresAt: new Date(Date.now() + 86_400_000).toISOString() }),
      );

      await vi.advanceTimersByTimeAsync(50);
      await vi.advanceTimersByTimeAsync(16 * 60 * 1000);
      const afterBudget = fetchMock.mock.calls.length;

      result.current.refresh();
      await vi.advanceTimersByTimeAsync(50);
      expect(fetchMock.mock.calls.length).toBeGreaterThan(afterBudget);
      expect(result.current.isPollBudgetSpent).toBe(false);
    });
  });
});
