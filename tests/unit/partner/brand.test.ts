import { describe, test, expect } from "vitest";
import {
  AA_CONTRAST,
  NEUTRAL_FALLBACK_ACCENT,
  NEUTRAL_FALLBACK_PRIMARY,
  contrastRatio,
  hasReadableText,
  normalizeHex,
  readableTextOn,
  resolveBrand,
} from "@/lib/partner/brand";

// USDX-548 AC: "Light + Dark dua-duanya benar; nol elemen yang tidak terbaca di salah satunya."
//
// Warna brand di halaman netral diisi PARTNER, jadi ia bisa berupa apa saja — termasuk kuning
// neon atau putih. Yang tidak boleh terjadi: tombol "Kembali ke partner" (satu-satunya jalan
// keluar customer) jadi tak terbaca karena kami menempelkan teks putih di atas warna terang.
//
// Jaminan yang ditegakkan di sini SATU dan bisa ditegakkan: teks di atas permukaan brand selalu
// lolos AA. Karena warna brand tidak berganti antar tema, jaminan itu otomatis berlaku di Light
// dan Dark. Tepi tombol adalah soal terpisah dan diselesaikan token tema (`border-foreground/15`,
// diuji di PartnerCheckout.test.tsx) — bukan oleh warna partner, karena tidak ada satu warna pun
// yang bisa kontras terhadap latar hampir-putih dan hampir-hitam sekaligus.

describe("normalizeHex", () => {
  describe("positive", () => {
    test("#rrggbb → huruf kecil", () => {
      expect(normalizeHex("#AABBCC")).toBe("#aabbcc");
    });

    test("#rgb dilebarkan jadi #rrggbb", () => {
      expect(normalizeHex("#f0a")).toBe("#ff00aa");
    });

    test("tanpa tanda # tetap diterima (kolom bisa diisi tanpa pagar)", () => {
      expect(normalizeHex("800000")).toBe("#800000");
    });
  });

  describe("negative", () => {
    test("bukan hex → null", () => {
      expect(normalizeHex("merah")).toBeNull();
    });

    test("rgb() tidak diterima — kolomnya char(7), menerima bentuk lain = menebak", () => {
      expect(normalizeHex("rgb(128,0,0)")).toBeNull();
    });

    test("panjang salah (4/5/7 nibble) → null", () => {
      expect(normalizeHex("#abcd")).toBeNull();
      expect(normalizeHex("#abcde")).toBeNull();
      expect(normalizeHex("#abcdefa")).toBeNull();
    });
  });

  describe("edge case", () => {
    test("null/undefined/kosong → null", () => {
      expect(normalizeHex(null)).toBeNull();
      expect(normalizeHex(undefined)).toBeNull();
      expect(normalizeHex("   ")).toBeNull();
    });
  });
});

describe("contrastRatio", () => {
  describe("positive", () => {
    test("hitam vs putih = 21 (maksimum)", () => {
      expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    });

    test("warna yang sama = 1 (minimum)", () => {
      expect(contrastRatio("#800000", "#800000")).toBeCloseTo(1, 5);
    });
  });

  describe("negative", () => {
    test("hex tak sah → 1 (paling buruk), bukan lempar — agar pemanggil selalu fail-closed", () => {
      expect(contrastRatio("bukan-warna", "#ffffff")).toBe(1);
    });
  });

  describe("edge case", () => {
    test("urutan argumen tidak mengubah hasil", () => {
      expect(contrastRatio("#800000", "#ffffff")).toBeCloseTo(
        contrastRatio("#ffffff", "#800000"),
        6,
      );
    });
  });
});

describe("readableTextOn", () => {
  describe("positive", () => {
    test("maroon USDX → teks terang", () => {
      expect(contrastRatio("#800000", readableTextOn("#800000"))).toBeGreaterThanOrEqual(AA_CONTRAST);
    });

    test("KUNING TERANG → teks GELAP, bukan putih (kasus yang bikin tombol tak terbaca)", () => {
      const text = readableTextOn("#f7e600");
      expect(contrastRatio("#f7e600", text)).toBeGreaterThanOrEqual(AA_CONTRAST);
      // Bukti eksplisit bahwa pilihannya bukan putih.
      expect(contrastRatio("#f7e600", "#fafafa")).toBeLessThan(AA_CONTRAST);
    });
  });

  describe("negative", () => {
    test("warna tak sah → teks gelap (permukaannya sendiri akan di-fallback)", () => {
      expect(readableTextOn("bukan-warna")).toBe("#1a1a1a");
    });
  });

  describe("edge case", () => {
    test("abu-abu tengah (#808080) tetap menghasilkan kombinasi terbaik yang tersedia", () => {
      const text = readableTextOn("#808080");
      const other = text === "#fafafa" ? "#1a1a1a" : "#fafafa";
      expect(contrastRatio("#808080", text)).toBeGreaterThanOrEqual(
        contrastRatio("#808080", other),
      );
    });
  });
});

describe("hasReadableText", () => {
  describe("positive", () => {
    test("maroon gelap bisa memikul teks terang", () => {
      expect(hasReadableText("#800000")).toBe(true);
    });

    test("kuning terang bisa memikul teks gelap", () => {
      expect(hasReadableText("#f7e600")).toBe(true);
    });
  });

  describe("negative", () => {
    test("abu-abu tengah GAGAL — teks terang maupun gelap tak mencapai 4.5", () => {
      // Justru kasus ini yang membuat fungsi ini berguna, bukan formalitas.
      expect(hasReadableText("#767676")).toBe(false);
    });

    test("warna tak sah gagal", () => {
      expect(hasReadableText("bukan-warna")).toBe(false);
    });
  });

  describe("edge case", () => {
    test("putih & hitam dua-duanya LOLOS — keduanya sanggup memikul teks", () => {
      expect(hasReadableText("#ffffff")).toBe(true);
      expect(hasReadableText("#000000")).toBe(true);
    });
  });
});

describe("resolveBrand", () => {
  describe("positive", () => {
    test("warna partner yang sah & terbaca dipakai apa adanya", () => {
      const brand = resolveBrand("#1d4ed8", "#0ea5e9");
      expect(brand.primary).toBe("#1d4ed8");
      expect(brand.accent).toBe("#0ea5e9");
      expect(contrastRatio(brand.primary, brand.primaryText)).toBeGreaterThanOrEqual(AA_CONTRAST);
    });

    test("hasil resolve SELALU lolos AA — inilah jaminan 'nol elemen tak terbaca'", () => {
      const candidates = [
        "#ffffff",
        "#000000",
        "#f7e600",
        "#800000",
        "#00ff00",
        "#767676",
        "#808080",
        "bukan-warna",
        null,
        undefined,
        "",
        "#fff",
      ];
      for (const candidate of candidates) {
        const brand = resolveBrand(candidate, candidate);
        expect(
          contrastRatio(brand.primary, brand.primaryText),
          `primary ${brand.primary} dari input ${String(candidate)}`,
        ).toBeGreaterThanOrEqual(AA_CONTRAST);
      }
    });

    test("putih & kuning DIPERTAHANKAN — tepinya urusan border tema, bukan urusan warna", () => {
      expect(resolveBrand("#ffffff", null).primary).toBe("#ffffff");
      expect(resolveBrand("#f7e600", null).primary).toBe("#f7e600");
    });
  });

  describe("negative", () => {
    test("warna tak sah → fallback NETRAL (bukan maroon USDX — itu menyelundupkan merek kami)", () => {
      const brand = resolveBrand("bukan-warna", "juga-bukan");
      expect(brand.primary).toBe(NEUTRAL_FALLBACK_PRIMARY);
      expect(brand.accent).toBe(NEUTRAL_FALLBACK_ACCENT);
      expect(brand.primary).not.toBe("#800000");
    });

    test("abu-abu tengah yang tak bisa memikul teks → fallback", () => {
      expect(resolveBrand("#767676", null).primary).toBe(NEUTRAL_FALLBACK_PRIMARY);
    });
  });

  describe("edge case", () => {
    test("primary sah, accent tak sah → hanya accent yang di-fallback", () => {
      const brand = resolveBrand("#1d4ed8", "bukan-warna");
      expect(brand.primary).toBe("#1d4ed8");
      expect(brand.accent).toBe(NEUTRAL_FALLBACK_ACCENT);
    });

    test("fallback netral sendiri lolos syarat yang sama (bukan pengecualian)", () => {
      expect(hasReadableText(NEUTRAL_FALLBACK_PRIMARY)).toBe(true);
    });

    test("fallback netral BUKAN warna brand USDX", () => {
      expect([NEUTRAL_FALLBACK_PRIMARY, NEUTRAL_FALLBACK_ACCENT]).not.toContain("#800000");
      expect([NEUTRAL_FALLBACK_PRIMARY, NEUTRAL_FALLBACK_ACCENT]).not.toContain("#f7a100");
    });
  });
});
