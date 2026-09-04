import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, createWrapper } from "../../helpers/test-utils";
import { getMintOrder, payMintOrder } from "@/lib/api/mint";
import { CHECKOUT_TOKEN_KEY, setToken } from "@/lib/auth/token";
import { PARTNER_SESSION_KEY } from "@/lib/partner/session-store";
import type { MintOrderDetail } from "@/types";

// USDX-548 syarat mengikat: "Alur checkout dari aplikasi USDX berperilaku PERSIS seperti
// sebelumnya — dibuktikan tes regresi, bukan pengamatan manual."
//
// Sebagian besar jaminan itu bersifat struktural: `src/app/checkout/[orderId]/page.tsx`,
// `CheckoutContent`, `PaymentMethodSelector`, `MintStatusTracker`, `useCheckout`, `client.ts`,
// dan `auth/token.ts` TIDAK diubah oleh tiket ini, dan 100 tes yang sudah ada tetap hijau.
//
// Yang TIDAK tercakup oleh itu ada dua, dan justru di situlah risikonya:
//   1. `src/lib/api/mint.ts` MEMANG diubah (menerima argumen `bearer` opsional). Kalau argumen
//      itu mengubah perilaku saat TIDAK diberikan, seluruh jalur aplikasi ikut berubah.
//   2. Kredensial partner kini bisa ada di `sessionStorage` tab yang sama. Kalau kedua jalur
//      berbagi slot, membuka tautan partner akan menimpa sesi aplikasi — dan itu kelas bug yang
//      sudah pernah kami punya di cookie desk.
//
// Berkas ini menutup dua celah itu.
//
// Catatan 4 Sep 2026 (audit UI): fixture `orderId` di sini diganti dari "ord_1" jadi UUID.
// Bukan kosmetik — sejak temuan B14, `useCheckout` membedakan orderId yang BENTUKNYA salah
// (kontraknya `format: uuid`) dari kegagalan server, dan id salah bentuk sengaja tidak ikut
// redirect ke `app`. Fixture lama akan menguji jalur yang salah, bukan jalur aplikasi.

vi.mock("@/lib/auth/redirect", () => ({ redirectToApp: vi.fn(), returnToApp: vi.fn(() => true) }));
import { redirectToApp } from "@/lib/auth/redirect";
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

function makeOrder(o: Partial<MintOrderDetail> = {}): MintOrderDetail {
  return {
    id: "0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012",
    orderNumber: "USDX-1",
    customerName: "Siti",
    type: "MINT",
    userAddress: "0xabc",
    chain: "polygon",
    inputCurrency: "IDR",
    amount: "60",
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

const PARTNER_SESSION_JSON = JSON.stringify({
  orderId: "0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012",
  model: "NEUTRAL",
  status: "OPENED",
  sessionToken: "psess-partner",
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  returnUrl: "https://partner.co.id/pesanan/selesai",
  cancelUrl: null,
  branding: null,
});

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(redirectToApp).mockReset();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState(null, "", "/checkout/0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function authOf(callIndex = 0): string | null {
  const [, init] = fetchMock.mock.calls[callIndex];
  return new Headers(init?.headers).get("Authorization");
}

describe("getMintOrder / payMintOrder — argumen bearer baru tidak mengubah jalur aplikasi", () => {
  describe("positive", () => {
    test("TANPA bearer → tetap memakai token sesi aplikasi dari sessionStorage (seperti sebelumnya)", async () => {
      setToken("app-session-token");
      fetchMock.mockResolvedValue(jsonResponse(200, { status: "success", data: makeOrder() }));

      await getMintOrder("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012");

      expect(authOf()).toBe("Bearer app-session-token");
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain("/api/v2/mint/0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012");
      expect(init.method).toBe("GET");
    });

    test("TANPA bearer pada /pay → token aplikasi, body apa adanya", async () => {
      setToken("app-session-token");
      fetchMock.mockResolvedValue(jsonResponse(200, { status: "success", data: makeOrder() }));

      await payMintOrder("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012", { channel: "VA", bank: "BCA" });

      expect(authOf()).toBe("Bearer app-session-token");
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain("/api/v2/mint/0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012/pay");
      expect(JSON.parse(init.body)).toEqual({ channel: "VA", bank: "BCA" });
    });

    test("QRIS tetap bisa dikirim dari jalur aplikasi — saringan partner tidak merembes", async () => {
      setToken("app-session-token");
      fetchMock.mockResolvedValue(jsonResponse(200, { status: "success", data: makeOrder() }));

      await payMintOrder("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012", { channel: "QRIS" });

      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ channel: "QRIS" });
    });
  });

  describe("negative", () => {
    test("tanpa token aplikasi & tanpa bearer → TIDAK ada header Authorization (seperti sebelumnya)", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { status: "success", data: makeOrder() }));

      await getMintOrder("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012");

      expect(authOf()).toBeNull();
    });

    test("bearer partner TIDAK menimpa token aplikasi di storage", async () => {
      setToken("app-session-token");
      fetchMock.mockResolvedValue(jsonResponse(200, { status: "success", data: makeOrder() }));

      await getMintOrder("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012", "psess-partner");

      expect(authOf()).toBe("Bearer psess-partner");
      expect(sessionStorage.getItem(CHECKOUT_TOKEN_KEY)).toBe("app-session-token");
    });
  });

  describe("edge case", () => {
    test("bearer string kosong diperlakukan seperti tak diberikan → token aplikasi", async () => {
      setToken("app-session-token");
      fetchMock.mockResolvedValue(jsonResponse(200, { status: "success", data: makeOrder() }));

      await getMintOrder("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012", "");

      expect(authOf()).toBe("Bearer app-session-token");
    });

    test("adanya sesi PARTNER di tab tidak mengubah header jalur aplikasi", async () => {
      setToken("app-session-token");
      sessionStorage.setItem(PARTNER_SESSION_KEY, PARTNER_SESSION_JSON);
      fetchMock.mockResolvedValue(jsonResponse(200, { status: "success", data: makeOrder() }));

      await getMintOrder("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012");

      expect(authOf()).toBe("Bearer app-session-token");
      expect(authOf()).not.toContain("psess-partner");
    });
  });
});

describe("useCheckout — perilaku jalur aplikasi tetap seperti sebelumnya", () => {
  describe("positive", () => {
    test("memakai token sesi aplikasi, BUKAN kredensial partner yang ada di tab yang sama", async () => {
      setToken("app-session-token");
      sessionStorage.setItem(PARTNER_SESSION_KEY, PARTNER_SESSION_JSON);
      fetchMock.mockResolvedValue(jsonResponse(200, { status: "success", data: makeOrder() }));

      const { result } = renderHook(() => useCheckout("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.order).not.toBeNull());

      expect(authOf()).toBe("Bearer app-session-token");
    });

    test("TETAP menunggui WAITING_FOR_APPROVAL — aturan 'berhenti' milik jalur partner saja", async () => {
      // Ini pembeda inti antara dua jalur, dan justru yang paling mudah rusak kalau
      // seseorang kelak menyatukan kedua hook. Penunggu di jalur aplikasi PUNYA aplikasi
      // USDX yang akan memberitahunya, jadi menunggui di sini memang masuk akal.
      vi.useFakeTimers();
      setToken("app-session-token");
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          status: "success",
          data: makeOrder({ paymentStatus: "PAID", status: "WAITING_FOR_APPROVAL" }),
        }),
      );

      const { result } = renderHook(() => useCheckout("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"), { wrapper: createWrapper() });
      await vi.advanceTimersByTimeAsync(50);
      expect(result.current.order).not.toBeNull();
      const afterFirst = fetchMock.mock.calls.length;

      await vi.advanceTimersByTimeAsync(20_000);
      expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFirst);
    });
  });

  describe("negative", () => {
    test("401 → tetap redirect balik ke `app` (jalur partner tidak pernah melakukan ini)", async () => {
      setToken("stale-token");
      fetchMock.mockResolvedValue(
        jsonResponse(401, { status: "error", error: { code: "UNAUTHORIZED", message: "no" } }),
      );

      const { result } = renderHook(() => useCheckout("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isUnauthorized).toBe(true));
      expect(vi.mocked(redirectToApp)).toHaveBeenCalled();
    });

    test("404 TIDAK diratakan jadi 'sesi tak berlaku' di jalur aplikasi (perataan itu milik partner)", async () => {
      setToken("app-session-token");
      fetchMock.mockResolvedValue(
        jsonResponse(404, { status: "error", error: { code: "NOT_FOUND", message: "no" } }),
      );

      const { result } = renderHook(() => useCheckout("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.isUnauthorized).toBe(false);
      expect(vi.mocked(redirectToApp)).not.toHaveBeenCalled();
    });
  });

  describe("edge case", () => {
    test("handoff `#code=` masih ditukar lebih dulu, lalu GET memakai token hasil tukar", async () => {
      window.location.hash = "#code=hc-1";
      fetchMock.mockImplementation((url: string) =>
        Promise.resolve(
          String(url).includes("/auth/checkout-token/exchange")
            ? jsonResponse(200, { status: "success", data: { token: "sess-exchanged" } })
            : jsonResponse(200, { status: "success", data: makeOrder() }),
        ),
      );

      const { result } = renderHook(() => useCheckout("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.order).not.toBeNull());

      const mintCall = fetchMock.mock.calls.findIndex(([url]) =>
        String(url).includes("/api/v2/mint/0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"),
      );
      expect(new Headers(fetchMock.mock.calls[mintCall][1].headers).get("Authorization")).toBe(
        "Bearer sess-exchanged",
      );
      // Dan code-nya tetap di-strip dari URL, seperti sebelumnya.
      expect(window.location.hash).toBe("");
    });

    test("slot sesi aplikasi & slot sesi partner memang kunci yang berbeda", () => {
      expect(CHECKOUT_TOKEN_KEY).not.toBe(PARTNER_SESSION_KEY);
    });
  });
});
