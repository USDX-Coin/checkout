import { describe, test, expect } from "vitest";
import {
  isAllowedReturnUrl,
  normalizeAllowedOrigins,
  normalizeOrigin,
  safeReturnUrl,
} from "@/lib/partner/return-url";

// USDX-548 — `return_url` WAJIB divalidasi terhadap daftar terdaftar di `partner_branding`.
// Tanpa itu `checkout.usdx.co.id` jadi pengalih terbuka: penyerang memakai domain kami (yang
// terlihat sah) untuk melempar orang ke situsnya. Tiap kasus "negative" di bawah adalah bentuk
// bypass yang nyata dan pernah dipakai di dunia nyata, bukan variasi sintaks.

const REGISTERED = ["https://partner.co.id", "https://checkout.partner.co.id"];

describe("normalizeOrigin", () => {
  describe("positive", () => {
    test("origin https utuh → dikembalikan kanonik", () => {
      expect(normalizeOrigin("https://partner.co.id")).toBe("https://partner.co.id");
    });

    test("host telanjang (bentuk `partner_branding.custom_domain`) → diberi https", () => {
      expect(normalizeOrigin("partner.co.id")).toBe("https://partner.co.id");
    });

    test("path/query ikut dibuang — yang disimpan cuma origin", () => {
      expect(normalizeOrigin("https://partner.co.id/mint/done?x=1")).toBe("https://partner.co.id");
    });
  });

  describe("negative", () => {
    test("http ditolak — jalan keluar tidak boleh turun ke plaintext", () => {
      expect(normalizeOrigin("http://partner.co.id")).toBeNull();
    });

    test("javascript: ditolak", () => {
      expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
    });

    test("relatif-protokol `//host` TIDAK diperbaiki jadi https", () => {
      expect(normalizeOrigin("//partner.co.id")).toBeNull();
    });

    test("entri dengan kredensial ditolak", () => {
      expect(normalizeOrigin("https://user:pw@partner.co.id")).toBeNull();
    });
  });

  describe("edge case", () => {
    test("spasi di sekeliling dipangkas", () => {
      expect(normalizeOrigin("  partner.co.id  ")).toBe("https://partner.co.id");
    });

    test("string kosong → null", () => {
      expect(normalizeOrigin("")).toBeNull();
    });

    test("port dipertahankan — origin memuat port, jadi port lain bukan origin yang sama", () => {
      expect(normalizeOrigin("https://partner.co.id:8443")).toBe("https://partner.co.id:8443");
    });
  });
});

describe("normalizeAllowedOrigins", () => {
  describe("positive", () => {
    test("beberapa entri → himpunan origin kanonik", () => {
      expect(normalizeAllowedOrigins(["partner.co.id", "https://checkout.partner.co.id"])).toEqual([
        "https://partner.co.id",
        "https://checkout.partner.co.id",
      ]);
    });
  });

  describe("negative", () => {
    test("entri tak sah DIBUANG, tidak membuat seluruh daftar gagal", () => {
      expect(normalizeAllowedOrigins(["javascript:x", "partner.co.id"])).toEqual([
        "https://partner.co.id",
      ]);
    });
  });

  describe("edge case", () => {
    test("null/undefined → daftar kosong", () => {
      expect(normalizeAllowedOrigins(null)).toEqual([]);
      expect(normalizeAllowedOrigins(undefined)).toEqual([]);
    });

    test("duplikat (bentuk berbeda, origin sama) dilipat jadi satu", () => {
      expect(normalizeAllowedOrigins(["partner.co.id", "https://partner.co.id/a"])).toEqual([
        "https://partner.co.id",
      ]);
    });
  });
});

describe("isAllowedReturnUrl", () => {
  describe("positive", () => {
    test("URL pada origin terdaftar → diizinkan", () => {
      expect(isAllowedReturnUrl("https://partner.co.id/mint/done", REGISTERED)).toBe(true);
    });

    test("subdomain yang TERDAFTAR SENDIRI → diizinkan", () => {
      expect(isAllowedReturnUrl("https://checkout.partner.co.id/ok", REGISTERED)).toBe(true);
    });

    test("query & fragment tidak mengubah kelayakan", () => {
      expect(isAllowedReturnUrl("https://partner.co.id/done?ref=1#top", REGISTERED)).toBe(true);
    });
  });

  describe("negative", () => {
    test("origin di luar daftar → DITOLAK", () => {
      expect(isAllowedReturnUrl("https://evil.com/steal", REGISTERED)).toBe(false);
    });

    test("host ber-SUFIKS sama bukan origin yang sama (`evil-partner.co.id`)", () => {
      expect(isAllowedReturnUrl("https://evil-partner.co.id/x", REGISTERED)).toBe(false);
    });

    test("domain terdaftar dipakai sebagai PREFIKS host lain (`partner.co.id.evil.com`)", () => {
      expect(isAllowedReturnUrl("https://partner.co.id.evil.com/x", REGISTERED)).toBe(false);
    });

    test("subdomain yang TIDAK terdaftar → ditolak (tidak ada pencocokan wildcard)", () => {
      expect(isAllowedReturnUrl("https://pay.partner.co.id/x", REGISTERED)).toBe(false);
    });

    test("kredensial menyamarkan host asli (`https://partner.co.id@evil.com`)", () => {
      expect(isAllowedReturnUrl("https://partner.co.id@evil.com/x", REGISTERED)).toBe(false);
    });

    test("javascript: ditolak", () => {
      expect(isAllowedReturnUrl("javascript:alert(document.cookie)", REGISTERED)).toBe(false);
    });

    test("data: ditolak", () => {
      expect(isAllowedReturnUrl("data:text/html,<script>1</script>", REGISTERED)).toBe(false);
    });

    test("relatif-protokol `//evil.com` ditolak", () => {
      expect(isAllowedReturnUrl("//evil.com", REGISTERED)).toBe(false);
    });

    test("http pada origin terdaftar ditolak — skema ikut dibandingkan", () => {
      expect(isAllowedReturnUrl("http://partner.co.id/done", REGISTERED)).toBe(false);
    });

    test("port berbeda dari yang terdaftar ditolak", () => {
      expect(isAllowedReturnUrl("https://partner.co.id:8443/done", REGISTERED)).toBe(false);
    });

    test("URL relatif ditolak — tidak ada base yang dipakai diam-diam", () => {
      expect(isAllowedReturnUrl("/mint/done", REGISTERED)).toBe(false);
    });
  });

  describe("edge case", () => {
    test("daftar KOSONG → semua ditolak, termasuk URL yang terlihat wajar", () => {
      expect(isAllowedReturnUrl("https://partner.co.id/done", [])).toBe(false);
    });

    test("daftar null → ditolak (partner tanpa domain terdaftar tak punya tujuan)", () => {
      expect(isAllowedReturnUrl("https://partner.co.id/done", null)).toBe(false);
    });

    test("url null/kosong → ditolak", () => {
      expect(isAllowedReturnUrl(null, REGISTERED)).toBe(false);
      expect(isAllowedReturnUrl("", REGISTERED)).toBe(false);
    });

    test("beda huruf besar/kecil pada host tetap origin yang sama", () => {
      expect(isAllowedReturnUrl("https://PARTNER.co.id/done", REGISTERED)).toBe(true);
    });

    test("port https eksplisit (:443) sama dengan tanpa port", () => {
      expect(isAllowedReturnUrl("https://partner.co.id:443/done", REGISTERED)).toBe(true);
    });
  });
});

describe("safeReturnUrl", () => {
  describe("positive", () => {
    test("URL yang lolos dikembalikan APA ADANYA (path & query dipertahankan)", () => {
      const url = "https://partner.co.id/mint/done?order=1";
      expect(safeReturnUrl(url, REGISTERED)).toBe(url);
    });
  });

  describe("negative", () => {
    test("URL yang gagal → null, BUKAN fallback ke URL itu", () => {
      expect(safeReturnUrl("https://evil.com", REGISTERED)).toBeNull();
    });
  });

  describe("edge case", () => {
    test("tanpa daftar → null", () => {
      expect(safeReturnUrl("https://partner.co.id", [])).toBeNull();
    });
  });
});
