import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor, createWrapper } from "../../helpers/test-utils";
import { CHECKOUT_TOKEN_KEY, setToken } from "@/lib/auth/token";
import type { MintOrderDetail } from "@/types";

// Mock redirect supaya 401 tidak benar-benar menavigasi (jsdom), tapi tetap bisa
// diassert dipanggil. Sisanya (capture token + client + bearer) dibiarkan ASLI agar
// anti-race teruji end-to-end lewat fetch sungguhan (di-stub).
vi.mock("@/lib/auth/redirect", () => ({ redirectToApp: vi.fn() }));
import { redirectToApp } from "@/lib/auth/redirect";
import { useCheckout } from "@/hooks/useCheckout";

const mockRedirect = vi.mocked(redirectToApp);

// Id fixture-nya UUID, bukan "ord_1" seperti dulu. Sejak temuan audit B14, hook membedakan
// orderId yang BENTUKNYA salah (`sot/api/common.yaml#/parameters/ResourceId` → `format: uuid`)
// dari kegagalan server — dan id yang bentuknya salah sengaja TIDAK ikut redirect ke `app`.
// Fixture lama tidak berbentuk UUID, jadi ia menguji jalur yang salah.

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
  window.history.replaceState(null, "", "/checkout/0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// URL yang membedakan endpoint exchange dari GET mint.
function routeFetch(handlers: {
  exchange?: () => Response;
  mint?: (init?: RequestInit) => Response;
}) {
  return (url: string, init?: RequestInit) => {
    if (url.includes("/auth/checkout-token/exchange")) {
      return Promise.resolve(
        handlers.exchange?.() ??
          jsonResponse(200, { status: "success", data: { token: "sess-default" } }),
      );
    }
    return Promise.resolve(
      handlers.mint?.(init) ?? jsonResponse(200, { status: "success", data: makeOrder() }),
    );
  };
}

describe("useCheckout — auth exchange (USDX-378)", () => {
  // Regresi 5 Sep 2026. `needsExchange` dulu berbunyi `Boolean(code) && !alreadyAuthed`,
  // jadi token sisa pesanan SEBELUMNYA membuat code BARU tak pernah ditukar: GET memakai
  // token basi → 401 → "Sesi checkout kedaluwarsa". Karena token itu tak pernah dibuang,
  // SETIAP pesanan berikutnya di tab yang sama ikut gagal — pesanannya terbuat di `app`,
  // checkoutnya tak pernah terbuka. Dua tes di bawah mengunci kedua arahnya.
  test("code baru MENANG atas token sesi lama di sessionStorage", async () => {
    setToken("token-pesanan-lama");
    window.location.hash = "#code=hc-baru";
    fetchMock.mockImplementation(
      routeFetch({
        exchange: () => jsonResponse(200, { status: "success", data: { token: "sess-baru" } }),
        mint: () => jsonResponse(200, { status: "success", data: makeOrder() }),
      }),
    );

    const { result } = renderHook(() => useCheckout("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.order).not.toBeNull());

    // Exchange TETAP dipanggil meski sessionStorage sudah berisi token.
    const exchangeCall = fetchMock.mock.calls.find(([u]) =>
      (u as string).includes("/auth/checkout-token/exchange"),
    );
    expect(exchangeCall).toBeDefined();
    expect(exchangeCall?.[1].body).toBe(JSON.stringify({ code: "hc-baru" }));

    // GET memakai token BARU, bukan yang lama.
    const getCall = fetchMock.mock.calls.find(
      ([u, i]) => (u as string).includes("/mint/0198f2c4") && (i as RequestInit)?.method === "GET",
    );
    expect((getCall?.[1].headers as Headers).get("Authorization")).toBe("Bearer sess-baru");
    expect(window.sessionStorage.getItem(CHECKOUT_TOKEN_KEY)).toBe("sess-baru");
  });

  test("tanpa code (refresh sesudah code di-strip) token tersimpan tetap dipakai, exchange tidak jalan", async () => {
    setToken("sess-tersimpan");
    window.location.hash = "";
    fetchMock.mockImplementation(
      routeFetch({ mint: () => jsonResponse(200, { status: "success", data: makeOrder() }) }),
    );

    const { result } = renderHook(() => useCheckout("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.order).not.toBeNull());

    expect(
      fetchMock.mock.calls.some(([u]) => (u as string).includes("/auth/checkout-token/exchange")),
    ).toBe(false);
    const getCall = fetchMock.mock.calls.find(
      ([u, i]) => (u as string).includes("/mint/0198f2c4") && (i as RequestInit)?.method === "GET",
    );
    expect((getCall?.[1].headers as Headers).get("Authorization")).toBe("Bearer sess-tersimpan");
  });

  test("exchanges #code before the first GET → GET carries the exchanged session token; code stripped, not persisted", async () => {
    window.location.hash = "#code=hc-1";
    fetchMock.mockImplementation(
      routeFetch({
        exchange: () => jsonResponse(200, { status: "success", data: { token: "sess-1" } }),
        mint: () => jsonResponse(200, { status: "success", data: makeOrder() }),
      }),
    );

    const { result } = renderHook(() => useCheckout("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.order).not.toBeNull());

    // Exchange dipanggil: POST { code }, pre-auth (tanpa Authorization).
    const exchangeCall = fetchMock.mock.calls.find(([u]) =>
      (u as string).includes("/auth/checkout-token/exchange"),
    );
    expect(exchangeCall?.[1].method).toBe("POST");
    expect(exchangeCall?.[1].body).toBe(JSON.stringify({ code: "hc-1" }));
    expect((exchangeCall?.[1].headers as Headers).get("Authorization")).toBeNull();

    // GET mint memakai token hasil exchange sebagai bearer (anti-race).
    const getCall = fetchMock.mock.calls.find(
      ([u, i]) => (u as string).includes("/mint/0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012") && (i as RequestInit)?.method === "GET",
    );
    expect((getCall?.[1].headers as Headers).get("Authorization")).toBe("Bearer sess-1");

    // Code di-strip dari URL; hanya session token yang tersimpan (bukan code).
    expect(window.location.hash).toBe("");
    expect(sessionStorage.getItem(CHECKOUT_TOKEN_KEY)).toBe("sess-1");
  });

  test("invalid/expired #code → exchange 401 INVALID_HANDOFF_CODE → isUnauthorized + redirect, NO mint GET", async () => {
    window.location.hash = "#code=stale";
    fetchMock.mockImplementation(
      routeFetch({
        exchange: () =>
          jsonResponse(401, {
            status: "error",
            error: { code: "INVALID_HANDOFF_CODE", message: "kode tidak valid" },
          }),
      }),
    );

    const { result } = renderHook(() => useCheckout("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isUnauthorized).toBe(true));
    expect(mockRedirect).toHaveBeenCalled();

    // Sesi tak valid → jangan sentuh GET mint sama sekali.
    const hitMint = fetchMock.mock.calls.some(([u]) => (u as string).includes("/mint/"));
    expect(hitMint).toBe(false);
    expect(sessionStorage.getItem(CHECKOUT_TOKEN_KEY)).toBeNull();
  });

  test("refresh in-tab (token tersimpan, tanpa #code) → GET pakai bearer tanpa exchange ulang", async () => {
    setToken("sess-kept");
    fetchMock.mockImplementation(routeFetch({}));

    const { result } = renderHook(() => useCheckout("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.order).not.toBeNull());

    // Tak ada panggilan exchange (sudah authed).
    const exchanged = fetchMock.mock.calls.some(([u]) =>
      (u as string).includes("/auth/checkout-token/exchange"),
    );
    expect(exchanged).toBe(false);
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer sess-kept");
  });

  test("mint GET 401 (session token dicabut/kedaluwarsa mid-sesi) → isUnauthorized + redirect", async () => {
    setToken("sess-x");
    fetchMock.mockResolvedValue(
      jsonResponse(401, { status: "error", error: { code: "UNAUTHORIZED", message: "no session" } }),
    );

    const { result } = renderHook(() => useCheckout("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isUnauthorized).toBe(true));
    expect(mockRedirect).toHaveBeenCalled();
  });

  test("a 404 does NOT trigger the app redirect (order bukan milik user)", async () => {
    setToken("sess-x");
    fetchMock.mockResolvedValue(
      jsonResponse(404, { status: "error", error: { code: "NOT_FOUND", message: "nope" } }),
    );

    const { result } = renderHook(() => useCheckout("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isUnauthorized).toBe(false);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("useCheckout — baseline (behavior yang harus tetap, characterization)", () => {
  test("loads the order; future expiresAt → not expired, countdown > 0", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { status: "success", data: makeOrder() }));
    const { result } = renderHook(() => useCheckout("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"), { wrapper: createWrapper() });
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
    const { result } = renderHook(() => useCheckout("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"), { wrapper: createWrapper() });
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
    const { result } = renderHook(() => useCheckout("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"), { wrapper: createWrapper() });
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

    const { result } = renderHook(() => useCheckout("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.order).not.toBeNull());

    await act(async () => {
      await result.current.pay("VA", "BCA");
    });

    const payCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(payCall?.[0]).toContain("/api/v2/mint/0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012/pay");
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

    const { result } = renderHook(() => useCheckout("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.order).not.toBeNull());

    await act(async () => {
      await result.current.pay("QRIS").catch(() => {});
    });

    await waitFor(() => expect(result.current.payError).toContain("tidak lagi bisa memilih metode"));
  });
});

// Tugas 6 poin 2/3 — `expiresAt` adalah batas jendela BAYAR, bukan umur order. Setelah PAID,
// order menunggu persetujuan multisig yang bisa berjam-jam; memperlakukan batas itu sebagai
// kedaluwarsa membuat user yang sudah transfer melihat "Pesanan kedaluwarsa" dan polling
// berhenti sebelum COMPLETED sempat terbaca.
describe("useCheckout — order sudah dibayar vs jendela bayar habis (Tugas 6)", () => {
  const LEWAT = new Date(Date.now() - 60_000).toISOString();

  function paidPastWindow(o: Partial<MintOrderDetail> = {}): MintOrderDetail {
    return makeOrder({
      paymentStatus: "PAID",
      status: "WAITING_FOR_APPROVAL",
      safeStatus: "PENDING_APPROVAL",
      expiresAt: LEWAT,
      ...o,
    });
  }

  describe("positive", () => {
    test("PAID lewat expiresAt → BUKAN expired", async () => {
      fetchMock.mockImplementation(
        routeFetch({ mint: () => jsonResponse(200, { status: "success", data: paidPastWindow() }) }),
      );

      const { result } = renderHook(() => useCheckout("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.order).not.toBeNull());

      expect(result.current.isExpired).toBe(false);
    });

    test("PAID lewat expiresAt → polling JALAN TERUS sampai COMPLETED terbaca", async () => {
      let hits = 0;
      fetchMock.mockImplementation(
        routeFetch({
          mint: () => {
            hits += 1;
            return jsonResponse(200, { status: "success", data: paidPastWindow() });
          },
        }),
      );

      const { result } = renderHook(() => useCheckout("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.order).not.toBeNull());

      const afterFirst = hits;
      await waitFor(() => expect(hits).toBeGreaterThan(afterFirst), { timeout: 6000 });
      expect(result.current.isExpired).toBe(false);
    }, 10_000);
  });

  describe("negative", () => {
    test("BELUM dibayar + lewat expiresAt → tetap expired", async () => {
      fetchMock.mockImplementation(
        routeFetch({
          mint: () =>
            jsonResponse(200, {
              status: "success",
              data: makeOrder({ paymentStatus: "WAITING_FOR_PAYMENT", expiresAt: LEWAT }),
            }),
        }),
      );

      const { result } = renderHook(() => useCheckout("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.order).not.toBeNull());

      expect(result.current.isExpired).toBe(true);
    });
  });

  describe("edge cases", () => {
    test("paymentStatus EXPIRED dari backend → expired walau timer klien belum habis", async () => {
      fetchMock.mockImplementation(
        routeFetch({
          mint: () =>
            jsonResponse(200, {
              status: "success",
              data: makeOrder({
                paymentStatus: "EXPIRED",
                expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
              }),
            }),
        }),
      );

      const { result } = renderHook(() => useCheckout("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.order).not.toBeNull());

      expect(result.current.isExpired).toBe(true);
    });

    test("COMPLETED lewat expiresAt → terminal, bukan expired", async () => {
      fetchMock.mockImplementation(
        routeFetch({
          mint: () =>
            jsonResponse(200, {
              status: "success",
              data: makeOrder({
                paymentStatus: "PAID",
                status: "COMPLETED",
                safeStatus: "EXECUTED",
                onChainTxHash: "0xdead",
                expiresAt: LEWAT,
              }),
            }),
        }),
      );

      const { result } = renderHook(() => useCheckout("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012"), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.order).not.toBeNull());

      expect(result.current.isExpired).toBe(false);
      expect(result.current.isTerminal).toBe(true);
    });
  });
});

// ── Temuan audit B5 & B14 ───────────────────────────────────────────────────────────────────
// Halaman dulu meratakan semua kegagalan GET jadi satu kalimat, "Pesanan tidak ditemukan atau
// sesi tidak valid". Hook sekarang menyebut SEBABNYA, karena sebab itulah yang menentukan apa
// yang jujur dikatakan — dan apakah "Coba lagi" masuk akal.
describe("useCheckout — sebab kegagalan dibedakan (B5, B14)", () => {
  const ORDER_ID = "0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012";

  describe("positive", () => {
    test("404 → not-found", async () => {
      setToken("sess-x");
      fetchMock.mockResolvedValue(
        jsonResponse(404, { status: "error", error: { code: "NOT_FOUND", message: "nope" } }),
      );
      const { result } = renderHook(() => useCheckout(ORDER_ID), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.errorKind).toBe("not-found");
    });

    test("500 → unavailable (bukan 'tidak ditemukan')", async () => {
      setToken("sess-x");
      fetchMock.mockResolvedValue(
        jsonResponse(500, { status: "error", error: { code: "INTERNAL", message: "boom" } }),
      );
      const { result } = renderHook(() => useCheckout(ORDER_ID), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.errorKind).toBe("unavailable");
    });

    test("jaringan mati → unavailable", async () => {
      setToken("sess-x");
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
      const { result } = renderHook(() => useCheckout(ORDER_ID), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.errorKind).toBe("unavailable");
    });

    test("retry() memicu GET ulang", async () => {
      setToken("sess-x");
      fetchMock.mockResolvedValue(
        jsonResponse(500, { status: "error", error: { code: "INTERNAL", message: "boom" } }),
      );
      const { result } = renderHook(() => useCheckout(ORDER_ID), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isError).toBe(true));
      const before = fetchMock.mock.calls.length;
      await act(async () => {
        result.current.retry();
      });
      await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
    });
  });

  describe("negative", () => {
    // B14: `/checkout/bukan-uuid` tanpa sesi menghasilkan 401 (guard auth jalan duluan), dan
    // redirect otomatisnya melempar user ke halaman login `app` tanpa satu kalimat penjelasan.
    test("orderId ngawur → malformed-id, dan TIDAK dilempar ke halaman login app", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(401, { status: "error", error: { code: "UNAUTHORIZED", message: "no" } }),
      );
      const { result } = renderHook(() => useCheckout("bukan-uuid"), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.errorKind).toBe("malformed-id");
      expect(result.current.isUnauthorized).toBe(false);
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    test("orderId ngawur → tidak menggantung di spinner", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(401, { status: "error", error: { code: "UNAUTHORIZED", message: "no" } }),
      );
      const { result } = renderHook(() => useCheckout("bukan-uuid"), { wrapper: createWrapper() });
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("edge cases", () => {
    // 422 dari pipe validasi backend = keputusan yang sama, cuma yang memutuskan server.
    test("422 VALIDATION_ERROR pada id berbentuk UUID → tetap dibaca sebagai id tak dipakai", async () => {
      setToken("sess-x");
      fetchMock.mockResolvedValue(
        jsonResponse(422, {
          status: "error",
          error: { code: "VALIDATION_ERROR", message: "bad id" },
        }),
      );
      const { result } = renderHook(() => useCheckout(ORDER_ID), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.errorKind).toBe("malformed-id");
    });
  });
});

// ── Temuan audit F2 ─────────────────────────────────────────────────────────────────────────
// `expiresAt` berganti ARTI setelah /pay: batas hidup ORDER → batas hidup VA. Hook menandai
// perpindahannya supaya halaman bisa mengakui lompatan angkanya, bukan membiarkannya bikin panik.
describe("useCheckout — tenggat yang berganti sumber (F2)", () => {
  const ORDER_ID = "0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012";

  describe("positive", () => {
    test("POST /pay mengembalikan expiresAt yang jauh lebih panjang → deadlineExtended", async () => {
      const pendek = new Date(Date.now() + 11 * 60_000).toISOString();
      const panjang = new Date(Date.now() + 60 * 60_000).toISOString();
      setToken("sess-x");
      fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
        Promise.resolve(
          jsonResponse(200, {
            status: "success",
            data: makeOrder(
              init?.method === "POST"
                ? { expiresAt: panjang, paymentStatus: "WAITING_FOR_PAYMENT", paymentChannel: "VA" }
                : { expiresAt: pendek },
            ),
          }),
        ),
      );

      const { result } = renderHook(() => useCheckout(ORDER_ID), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.order).not.toBeNull());
      expect(result.current.deadlineExtended).toBe(false);

      await act(async () => {
        await result.current.pay("VA", "BCA");
      });
      await waitFor(() => expect(result.current.deadlineExtended).toBe(true));
    });
  });

  describe("negative", () => {
    test("tenggat yang tidak berubah antar-poll → tidak dianggap diperpanjang", async () => {
      setToken("sess-x");
      fetchMock.mockResolvedValue(jsonResponse(200, { status: "success", data: makeOrder() }));
      const { result } = renderHook(() => useCheckout(ORDER_ID), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.order).not.toBeNull());
      expect(result.current.deadlineExtended).toBe(false);
    });
  });
});

// ── Temuan validator no. 1 · layar HELD tidak boleh basi selamanya ──────────────────────────
// Order jadi HELD lewat transfer TELAT (pasca-EXPIRED, `sot/bni-integration.md §6`), jadi batas
// bayarnya memang sudah lewat — dan guard `expiresAt` menghentikan polling di situ. Akibatnya
// layar "sedang ditinjau" tak pernah berubah walau ops sudah memutuskan.
describe("useCheckout — HELD menunggu putusan ops, jadi tetap di-poll", () => {
  const ORDER_ID = "0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012";
  const LEWAT = new Date(Date.now() - 60_000).toISOString();

  describe("positive", () => {
    test("HELD lewat batas bayar → polling JALAN TERUS sampai putusan ops terbaca", async () => {
      let hits = 0;
      setToken("sess-x");
      fetchMock.mockImplementation(
        routeFetch({
          mint: () => {
            hits += 1;
            return jsonResponse(200, {
              status: "success",
              data: makeOrder({ paymentStatus: "HELD", status: "HELD", expiresAt: LEWAT }),
            });
          },
        }),
      );

      const { result } = renderHook(() => useCheckout(ORDER_ID), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.order).not.toBeNull());
      const afterFirst = hits;
      await waitFor(() => expect(hits).toBeGreaterThan(afterFirst), { timeout: 6000 });
    }, 10_000);
  });

  describe("negative", () => {
    test("ops sudah memutuskan (FAILED) → terminal, polling berhenti", async () => {
      setToken("sess-x");
      fetchMock.mockImplementation(
        routeFetch({
          mint: () =>
            jsonResponse(200, {
              status: "success",
              data: makeOrder({ paymentStatus: "HELD", status: "FAILED", expiresAt: LEWAT }),
            }),
        }),
      );
      const { result } = renderHook(() => useCheckout(ORDER_ID), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.order).not.toBeNull());
      expect(result.current.isTerminal).toBe(true);
    });
  });
});
