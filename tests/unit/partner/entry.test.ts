import { describe, test, expect, beforeEach } from "vitest";
import {
  PARTNER_ENTRY_STRIPPED_PATH,
  readPartnerTokenFromPath,
  stripPartnerTokenFromUrl,
} from "@/lib/partner/entry";
import {
  PARTNER_SESSION_KEY,
  clearPartnerSession,
  readPartnerSession,
  readPartnerSessionFor,
  savePartnerSession,
} from "@/lib/partner/session-store";
import { CHECKOUT_TOKEN_KEY, getToken, setToken } from "@/lib/auth/token";
import type { PartnerCheckoutSession } from "@/lib/partner/types";

// USDX-548: "Token dibandingkan lewat hash-nya. Token mentah tidak boleh masuk log atau URL
// riwayat yang tersimpan."
//
// Pembandingan hash itu milik backend (`partner_checkout_sessions.token_hash`). Yang bisa dan
// wajib dibuktikan di sisi halaman: token mentah TIDAK MENETAP — ia hilang dari URL, dan tidak
// pernah ditulis ke storage mana pun.

const TOKEN = "9f2a1b3c4d5e6f70819a";

function makeSession(o: Partial<PartnerCheckoutSession> = {}): PartnerCheckoutSession {
  return {
    orderId: "ord_1",
    model: "NEUTRAL",
    status: "OPENED",
    sessionToken: "psess-abc",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    returnUrl: "https://partner.co.id/done",
    cancelUrl: null,
    branding: null,
    ...o,
  };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState(null, "", `/s/${TOKEN}`);
});

describe("readPartnerTokenFromPath", () => {
  describe("positive", () => {
    test("segmen path → token", () => {
      expect(readPartnerTokenFromPath(TOKEN)).toBe(TOKEN);
    });

    test("array segmen (bentuk catch-all) → elemen pertama", () => {
      expect(readPartnerTokenFromPath([TOKEN, "lain"])).toBe(TOKEN);
    });

    test("token ter-encode di-decode", () => {
      const raw = "abcdefghijklmnop-_.~";
      expect(readPartnerTokenFromPath(encodeURIComponent(raw))).toBe(raw);
    });
  });

  describe("negative", () => {
    test("terlalu pendek ditolak — bukan token yang kami terbitkan", () => {
      expect(readPartnerTokenFromPath("abc")).toBeNull();
    });

    test("karakter di luar URL-safe ditolak (jangan teruskan isi path yang aneh)", () => {
      expect(readPartnerTokenFromPath("abcdefghijklmnop/../../etc")).toBeNull();
      expect(readPartnerTokenFromPath("<script>alert(1)</script>xxxx")).toBeNull();
    });

    test("undefined → null", () => {
      expect(readPartnerTokenFromPath(undefined)).toBeNull();
    });

    test("encoding rusak → null, bukan lempar", () => {
      expect(readPartnerTokenFromPath("%E0%A4%A")).toBeNull();
    });
  });

  describe("edge case", () => {
    test("tepat 16 karakter diterima; 15 ditolak", () => {
      expect(readPartnerTokenFromPath("a".repeat(16))).toBe("a".repeat(16));
      expect(readPartnerTokenFromPath("a".repeat(15))).toBeNull();
    });

    test("tepat 256 diterima; 257 ditolak", () => {
      expect(readPartnerTokenFromPath("a".repeat(256))).toBe("a".repeat(256));
      expect(readPartnerTokenFromPath("a".repeat(257))).toBeNull();
    });
  });
});

describe("stripPartnerTokenFromUrl", () => {
  describe("positive", () => {
    test("token HILANG dari URL setelah dipanggil", () => {
      expect(window.location.pathname).toContain(TOKEN);
      stripPartnerTokenFromUrl();
      expect(window.location.pathname).toBe(PARTNER_ENTRY_STRIPPED_PATH);
      expect(window.location.href).not.toContain(TOKEN);
    });

    test("query string ikut dibuang — tak ada parameter yang boleh menyetir tampilan", () => {
      window.history.replaceState(null, "", `/s/${TOKEN}?theme=NEUTRAL`);
      stripPartnerTokenFromUrl();
      expect(window.location.search).toBe("");
      expect(window.location.pathname).toBe(PARTNER_ENTRY_STRIPPED_PATH);
    });

    test("hash ikut dibuang", () => {
      window.history.replaceState(null, "", `/s/${TOKEN}#x=1`);
      stripPartnerTokenFromUrl();
      expect(window.location.hash).toBe("");
    });
  });

  describe("negative", () => {
    test("token TIDAK ditulis ke sessionStorage / localStorage oleh proses ini", () => {
      stripPartnerTokenFromUrl();
      expect(sessionStorage.length).toBe(0);
      expect(localStorage.length).toBe(0);
    });
  });

  describe("edge case", () => {
    test("idempoten — panggilan kedua tidak mengubah apa pun", () => {
      stripPartnerTokenFromUrl();
      const after = window.location.href;
      stripPartnerTokenFromUrl();
      expect(window.location.href).toBe(after);
    });
  });
});

describe("session-store partner", () => {
  describe("positive", () => {
    test("simpan → baca kembali utuh", () => {
      const session = makeSession();
      savePartnerSession(session);
      expect(readPartnerSession()).toEqual(session);
    });

    test("SLOT TERPISAH dari sesi aplikasi — membuka tautan partner tidak menimpa sesi app", () => {
      setToken("app-session-token");
      savePartnerSession(makeSession());
      // Dua-duanya masih ada, masing-masing di kuncinya sendiri.
      expect(getToken()).toBe("app-session-token");
      expect(readPartnerSession()?.sessionToken).toBe("psess-abc");
      expect(PARTNER_SESSION_KEY).not.toBe(CHECKOUT_TOKEN_KEY);
    });

    test("dan sebaliknya: sesi app tidak menimpa sesi partner", () => {
      savePartnerSession(makeSession());
      setToken("app-session-token");
      expect(readPartnerSession()?.orderId).toBe("ord_1");
    });
  });

  describe("negative", () => {
    test("sesi order LAIN tidak membuka order ini", () => {
      savePartnerSession(makeSession({ orderId: "ord_1" }));
      expect(readPartnerSessionFor("ord_2")).toBeNull();
      expect(readPartnerSessionFor("ord_1")).not.toBeNull();
    });

    test("isi rusak dibuang, bukan dipaksa dipakai", () => {
      sessionStorage.setItem(PARTNER_SESSION_KEY, "{bukan json");
      expect(readPartnerSession()).toBeNull();
      expect(sessionStorage.getItem(PARTNER_SESSION_KEY)).toBeNull();
    });

    test("JSON sah tapi bukan bentuk sesi → dibuang", () => {
      sessionStorage.setItem(PARTNER_SESSION_KEY, JSON.stringify({ orderId: "ord_1" }));
      expect(readPartnerSession()).toBeNull();
    });
  });

  describe("edge case", () => {
    test("clear menghapus sesi partner dan TIDAK menyentuh sesi aplikasi", () => {
      setToken("app-session-token");
      savePartnerSession(makeSession());
      clearPartnerSession();
      expect(readPartnerSession()).toBeNull();
      expect(getToken()).toBe("app-session-token");
    });

    test("tanpa sesi tersimpan → null", () => {
      expect(readPartnerSession()).toBeNull();
      expect(readPartnerSessionFor("ord_1")).toBeNull();
    });
  });
});
