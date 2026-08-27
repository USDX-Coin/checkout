import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PARTNER_SESSION_REJECTED_MESSAGE,
  PARTNER_SESSION_RESOLVE_PATH,
  isPartnerSessionRejected,
  resolvePartnerSession,
} from "@/lib/api/partner";

// USDX-548 AC: "Token yang salah, kedaluwarsa, atau milik order lain → ditolak, dan pesannya
// tidak membocorkan apakah ordernya ada."
//
// ⚠️ Endpoint `POST /api/v2/checkout/partner-session/resolve` BELUM ADA — lingkup USDX-547.
// `fetch` di sini di-stub dengan bentuk respons yang PERSIS seperti kontrak yang diminta di
// deskripsi PR, jadi yang diuji adalah pemanggil + perataan error, bukan backendnya.

const TOKEN = "9f2a1b3c4d5e6f70819a";

function jsonResponse(status: number, payload: unknown, headers = new Headers()): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    headers,
    json: async () => payload,
  } as unknown as Response;
}

const OK_BODY = {
  status: "success",
  data: {
    orderId: "0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012",
    model: "NEUTRAL",
    status: "OPENED",
    sessionToken: "psess-xyz",
    expiresAt: "2026-08-27T11:14:02Z",
    returnUrl: "https://partner.co.id/mint/done",
    cancelUrl: "https://partner.co.id/mint/cancelled",
    branding: {
      displayName: "Toko Partner",
      logoUrl: "https://cdn.partner.co.id/logo.svg",
      faviconUrl: "https://cdn.partner.co.id/fav.png",
      primaryColor: "#1d4ed8",
      accentColor: "#0ea5e9",
      supportEmail: "cs@partner.co.id",
      footerText: "Dilayani Toko Partner",
      allowedReturnOrigins: ["https://partner.co.id"],
    },
  },
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolvePartnerSession", () => {
  describe("positive", () => {
    test("token sah → sesi lengkap, TANPA akun & tanpa aplikasi USDX", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, OK_BODY));
      const session = await resolvePartnerSession(TOKEN);

      expect(session.orderId).toBe("0198f2c4-8d1e-7f22-a3b4-5c6d7e8f9012");
      expect(session.model).toBe("NEUTRAL");
      expect(session.sessionToken).toBe("psess-xyz");
      expect(session.branding?.displayName).toBe("Toko Partner");
      expect(session.branding?.allowedReturnOrigins).toEqual(["https://partner.co.id"]);

      // Tidak ada satu pun header Authorization: jalur ini PRA-AUTH. Kalau ia butuh sesi lebih
      // dulu, customer partner (yang tak punya akun) tak akan pernah bisa masuk.
      const [, init] = fetchMock.mock.calls[0];
      expect(new Headers(init.headers).get("Authorization")).toBeNull();
    });

    test("token hanya lewat BODY — tidak di URL, tidak di query", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, OK_BODY));
      await resolvePartnerSession(TOKEN);

      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain(PARTNER_SESSION_RESOLVE_PATH);
      expect(String(url)).not.toContain(TOKEN);
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({ token: TOKEN });
    });

    test("token TIDAK ikut ke console (tak boleh masuk log)", async () => {
      const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
        vi.spyOn(console, level).mockImplementation(() => {}),
      );
      fetchMock.mockResolvedValue(jsonResponse(200, OK_BODY));
      await resolvePartnerSession(TOKEN);
      for (const spy of spies) {
        for (const call of spy.mock.calls) {
          expect(JSON.stringify(call)).not.toContain(TOKEN);
        }
        spy.mockRestore();
      }
    });
  });

  describe("negative", () => {
    // Inilah AC-nya: keempat sebab yang BERBEDA harus menghasilkan pesan yang SAMA. Kalau
    // 404 berbunyi lain dari 403, pemegang tautan acak bisa memetakan pesanan yang ada.
    const causes = [
      { label: "token salah (401)", status: 401, code: "INVALID_TOKEN" },
      { label: "bukan haknya (403)", status: 403, code: "FORBIDDEN" },
      { label: "tidak ada (404)", status: 404, code: "NOT_FOUND" },
      { label: "kedaluwarsa (410)", status: 410, code: "SESSION_EXPIRED" },
      { label: "sudah dipakai/tak valid (422)", status: 422, code: "VALIDATION_ERROR" },
      { label: "kesalahan server (500)", status: 500, code: "INTERNAL" },
    ];

    test("semua sebab → SATU pesan yang sama, tanpa membocorkan sebabnya", async () => {
      const messages = new Set<string>();
      for (const cause of causes) {
        fetchMock.mockResolvedValueOnce(
          jsonResponse(cause.status, {
            status: "error",
            error: { code: cause.code, message: `bocor: order ord_9 ${cause.label}` },
          }),
        );
        const error = await resolvePartnerSession(TOKEN).catch((e) => e);
        expect(isPartnerSessionRejected(error), cause.label).toBe(true);
        messages.add((error as Error).message);
      }
      expect([...messages]).toEqual([PARTNER_SESSION_REJECTED_MESSAGE]);
    });

    test("pesan tidak memuat kode, status, id order, atau kata yang menyiratkan keberadaan", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(404, {
          status: "error",
          error: { code: "MINT_ORDER_NOT_FOUND", message: "Order ord_9 tidak ditemukan" },
        }),
      );
      const error = await resolvePartnerSession(TOKEN).catch((e) => e);
      const message = (error as Error).message;
      expect(message).not.toMatch(/ord_9/);
      expect(message).not.toMatch(/NOT_FOUND/i);
      expect(message).not.toMatch(/404|401|403|410/);
      expect(message).not.toMatch(/tidak ditemukan|kedaluwarsa|sudah dipakai/i);
    });

    test("jaringan mati → ditolak dengan pesan yang sama, bukan lempar error mentah", async () => {
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
      const error = await resolvePartnerSession(TOKEN).catch((e) => e);
      expect(isPartnerSessionRejected(error)).toBe(true);
    });

    test("200 tapi body bukan bentuk sesi → ditolak (jangan jalan di atas sesi setengah jadi)", async () => {
      for (const bad of [
        { status: "success", data: null },
        { status: "success", data: { orderId: "ord_1" } },
        { status: "success", data: { ...OK_BODY.data, sessionToken: "" } },
        { status: "success", data: { ...OK_BODY.data, model: "QRIS" } },
      ]) {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, bad));
        const error = await resolvePartnerSession(TOKEN).catch((e) => e);
        expect(isPartnerSessionRejected(error), JSON.stringify(bad)).toBe(true);
      }
    });
  });

  describe("edge case", () => {
    test("429 TIDAK diratakan — throttle bukan tautan tak berlaku", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          429,
          { status: "error", error: { code: "RATE_LIMITED", message: "slow down" } },
          new Headers({ "Retry-After": "2" }),
        ),
      );
      const error = await resolvePartnerSession(TOKEN).catch((e) => e);
      expect(isPartnerSessionRejected(error)).toBe(false);
      expect((error as { status?: number }).status).toBe(429);
    });

    test("model VA diterima oleh parser — penolakannya urusan halaman, bukan transport", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { status: "success", data: { ...OK_BODY.data, model: "VA" } }),
      );
      await expect(resolvePartnerSession(TOKEN)).resolves.toMatchObject({ model: "VA" });
    });

    test("branding absen → null, bukan objek kosong yang menipu", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { status: "success", data: { ...OK_BODY.data, branding: undefined } }),
      );
      const session = await resolvePartnerSession(TOKEN);
      expect(session.branding).toBeNull();
    });

    test("allowedReturnOrigins absen → daftar kosong (artinya: tak ada tujuan yang diizinkan)", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          status: "success",
          data: { ...OK_BODY.data, branding: { displayName: "P" } },
        }),
      );
      const session = await resolvePartnerSession(TOKEN);
      expect(session.branding?.allowedReturnOrigins).toEqual([]);
    });
  });
});
