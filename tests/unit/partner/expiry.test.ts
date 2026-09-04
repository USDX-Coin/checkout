import { describe, test, expect } from "vitest";
import {
  effectiveExpiryMs,
  isPartnerSessionExpired,
  secondsUntilEffectiveExpiry,
} from "@/lib/partner/expiry";

// USDX-548 AC: "Sesi tidak bisa hidup lebih lama dari ordernya."
//
// Arah yang berbahaya cuma SATU: sesi yang hidup lebih lama dari ordernya. Halaman itu masih
// membuka nomor VA dari order yang sudah mati, jadi customer bisa mentransfer ke nomor yang tak
// lagi dicocokkan dengan apa pun — uang masuk, pesanan tidak ada.

const T0 = Date.UTC(2026, 7, 27, 10, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();
const MINUTE = 60_000;

describe("effectiveExpiryMs", () => {
  describe("positive", () => {
    test("order habis LEBIH DULU → batasnya milik order", () => {
      const orderAt = T0 + 30 * MINUTE;
      expect(effectiveExpiryMs(iso(T0 + 120 * MINUTE), iso(orderAt))).toBe(orderAt);
    });

    test("sesi habis LEBIH DULU → batasnya milik sesi", () => {
      const sessionAt = T0 + 15 * MINUTE;
      expect(effectiveExpiryMs(iso(sessionAt), iso(T0 + 120 * MINUTE))).toBe(sessionAt);
    });
  });

  describe("negative", () => {
    test("KEDUANYA tak terbaca → null (pemanggil wajib menganggapnya kedaluwarsa)", () => {
      expect(effectiveExpiryMs("bukan-tanggal", null)).toBeNull();
      expect(effectiveExpiryMs(null, undefined)).toBeNull();
    });
  });

  describe("edge case", () => {
    test("sama persis → nilai itu juga", () => {
      const at = T0 + 60 * MINUTE;
      expect(effectiveExpiryMs(iso(at), iso(at))).toBe(at);
    });

    test("hanya sesi yang terbaca → pakai sesi", () => {
      const at = T0 + 10 * MINUTE;
      expect(effectiveExpiryMs(iso(at), "bukan-tanggal")).toBe(at);
    });

    test("hanya order yang terbaca → pakai order", () => {
      const at = T0 + 10 * MINUTE;
      expect(effectiveExpiryMs(null, iso(at))).toBe(at);
    });
  });
});

describe("isPartnerSessionExpired", () => {
  describe("positive", () => {
    test("belum lewat dua-duanya → belum kedaluwarsa", () => {
      expect(
        isPartnerSessionExpired(iso(T0 + 30 * MINUTE), iso(T0 + 60 * MINUTE), T0),
      ).toBe(false);
    });
  });

  describe("negative", () => {
    test("ORDER sudah mati walau sesi masih panjang → KEDALUWARSA (inti AC-nya)", () => {
      expect(
        isPartnerSessionExpired(iso(T0 + 600 * MINUTE), iso(T0 - MINUTE), T0),
      ).toBe(true);
    });

    test("sesi sudah mati walau order masih panjang → kedaluwarsa", () => {
      expect(
        isPartnerSessionExpired(iso(T0 - MINUTE), iso(T0 + 600 * MINUTE), T0),
      ).toBe(true);
    });

    test("batas tak diketahui → kedaluwarsa (fail closed, bukan berlaku selamanya)", () => {
      expect(isPartnerSessionExpired(null, null, T0)).toBe(true);
      expect(isPartnerSessionExpired("x", "y", T0)).toBe(true);
    });
  });

  describe("edge case", () => {
    test("tepat pada batas → sudah kedaluwarsa (`>=`, bukan `>`)", () => {
      expect(isPartnerSessionExpired(iso(T0), iso(T0 + 60 * MINUTE), T0)).toBe(true);
    });

    test("satu milidetik sebelum batas → belum kedaluwarsa", () => {
      expect(isPartnerSessionExpired(iso(T0 + 1), iso(T0 + 60 * MINUTE), T0)).toBe(false);
    });
  });
});

describe("secondsUntilEffectiveExpiry", () => {
  describe("positive", () => {
    test("sisa detik dihitung dari batas yang paling dekat", () => {
      expect(secondsUntilEffectiveExpiry(iso(T0 + 120 * MINUTE), iso(T0 + 5 * MINUTE), T0)).toBe(
        300,
      );
    });
  });

  describe("negative", () => {
    test("sudah lewat → 0, tidak pernah negatif", () => {
      expect(secondsUntilEffectiveExpiry(iso(T0 - 10 * MINUTE), iso(T0), T0)).toBe(0);
    });
  });

  describe("edge case", () => {
    test("batas tak diketahui → 0", () => {
      expect(secondsUntilEffectiveExpiry(null, null, T0)).toBe(0);
    });

    test("pecahan detik dibulatkan ke bawah (jangan menjanjikan waktu yang tak ada)", () => {
      expect(secondsUntilEffectiveExpiry(iso(T0 + 1999), iso(T0 + 600_000), T0)).toBe(1);
    });
  });
});
