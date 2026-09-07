import { describe, test, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { BANK_BRAND, VA_BANKS } from "@/lib/constants";

// Ubin bank berdiri di layar tempat orang menyerahkan uang, memakai nama institusi yang diawasi
// OJK. Yang dijaga di sini bukan estetika: identitas yang salah di titik itu menyesatkan.
//
// NOBU sempat tampil sebagai wordmark teks di atas biru tua #0B3B8C — warna yang tidak pernah
// dimiliki Nobu, dikarang saat aset resminya belum ada. Tidak ada satu tes pun yang merah.
describe("BANK_BRAND", () => {
  describe("positive", () => {
    test("tiap bank yang dikenal punya entri brand yang lengkap", () => {
      for (const bank of VA_BANKS) {
        const brand = BANK_BRAND[bank];
        expect(brand, `entri brand ${bank}`).toBeDefined();
        expect(brand.name.length, `nama ${bank}`).toBeGreaterThan(0);
        expect(brand.mark.length, `wordmark ${bank}`).toBeGreaterThan(0);
      }
    });

    test("tiap bank punya logo, dan berkasnya benar-benar ada di public/", () => {
      for (const bank of VA_BANKS) {
        const logo = BANK_BRAND[bank].logo;
        expect(logo, `logo ${bank} belum dipasang`).toBeDefined();
        // Path-nya dicek ke disk, bukan cuma ke string: salah ketik nama berkas lolos TypeScript
        // dan baru terlihat sebagai gambar rusak di layar bayar.
        expect(existsSync(join(process.cwd(), "public", logo!)), `berkas ${logo}`).toBe(true);
      }
    });
  });

  describe("negative", () => {
    test("warna brand ditulis sebagai hex enam digit, bukan nama warna atau singkatan", () => {
      for (const bank of VA_BANKS) {
        expect(BANK_BRAND[bank].bg, `bg ${bank}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(BANK_BRAND[bank].fg, `fg ${bank}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });
  });

  describe("edge cases", () => {
    // Pasangan bg/fg cuma terpakai kalau logonya gagal dimuat — justru saat itu ia harus terbaca.
    // Ambang 4.5:1 mengikuti WCAG AA untuk teks normal.
    test("pasangan bg/fg tetap terbaca kalau logonya gagal dimuat", () => {
      const lum = (hex: string): number => {
        const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
        const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
        return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
      };
      for (const bank of VA_BANKS) {
        const { bg, fg } = BANK_BRAND[bank];
        const [a, b] = [lum(bg), lum(fg)].sort((x, y) => y - x);
        expect((a + 0.05) / (b + 0.05), `kontras ${bank}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
});
