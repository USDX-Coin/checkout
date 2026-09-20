import { describe, test, expect } from "vitest";
import nextConfig from "../../next.config";

// ─────────────────────────────────────────────────────────────────────────────
// Setelah netlify.toml dibuang, `next.config.ts` jadi SATU-SATUNYA tempat header
// keamanan halaman ini hidup — dan sebelum berkas ini tidak ada yang memeriksanya.
//
// Bukan kekhawatiran teoretis: desk.usdx.co.id (back-office, SPA statis) sudah
// KEHILANGAN keempat header ini di produksi dengan cara persis begitu — headernya
// dulu datang dari netlify.toml, host-nya pindah, dan tidak ada yang menyadarinya
// karena tidak ada satu pun test yang memeriksanya. Diverifikasi 21 Sep 2026.
//
// Taruhannya lebih tinggi di sini daripada di `app`: halaman ini memegang alur
// pembayaran DAN bearer token yang diserahkan lewat fragment URL (USDX-239).
// `Referrer-Policy` karena itu bukan pemanis — ia yang membatasi kebocoran saat
// pengguna mengeklik keluar (fragment memang tidak pernah ikut di Referer, tapi
// path + query bisa).
//
// Nilainya dari USDX-362 / USDX-380. Kalau mau berubah, ubah tiketnya dulu.
// ─────────────────────────────────────────────────────────────────────────────

const WAJIB = {
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none';",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
} as const;

async function headerUntuk(source: string) {
  const aturan = await nextConfig.headers!();
  const cocok = aturan.filter((r) => r.source === source);
  return new Map(cocok.flatMap((r) => r.headers.map((h) => [h.key, h.value] as const)));
}

describe("security headers (next.config.ts)", () => {
  describe("positive", () => {
    test.each(Object.entries(WAJIB))("mengirim %s dengan nilai dari USDX-362", async (key, value) => {
      expect((await headerUntuk("/(.*)")).get(key)).toBe(value);
    });

    test("dipasang untuk SELURUH path, bukan sebagian", async () => {
      // Halaman bayar punya beberapa langkah; aturan yang hanya mencakup salah
      // satunya meninggalkan langkah lain tanpa proteksi.
      const aturan = await nextConfig.headers!();
      expect(aturan.map((r) => r.source)).toContain("/(.*)");
    });
  });

  describe("negative", () => {
    test("framing di-DENY penuh — belum ada allowlist partner", async () => {
      // Komentar di next.config.ts sudah mengantisipasi jalur partner ("ganti jadi
      // allowlist"). Test ini sengaja MERAH saat itu terjadi: membuka framing untuk
      // halaman yang memegang bearer token adalah keputusan yang harus diambil
      // sadar, dengan daftar origin yang eksplisit — bukan diam-diam lewat satu
      // baris config.
      const csp = (await headerUntuk("/(.*)")).get("Content-Security-Policy") ?? "";
      expect(csp).toBe("frame-ancestors 'none';");
      expect((await headerUntuk("/(.*)")).get("X-Frame-Options")).toBe("DENY");
    });

    test("Referrer-Policy tidak dilonggarkan jadi bocor lintas origin", async () => {
      // `unsafe-url` / `no-referrer-when-downgrade` mengirim path + query penuh ke
      // situs lain. Di halaman yang URL-nya membawa identitas order, itu kebocoran.
      const rp = (await headerUntuk("/(.*)")).get("Referrer-Policy") ?? "";
      expect(rp).not.toMatch(/unsafe-url|no-referrer-when-downgrade|^origin$/);
    });
  });

  describe("edge cases", () => {
    test("`headers()` memang ada — bukan hanya nilainya yang benar", async () => {
      // Menghapus seluruh `async headers()` adalah cara paling mudah kehilangan
      // keempatnya sekaligus, dan test yang cuma memeriksa konstanta tetap hijau.
      expect(typeof nextConfig.headers).toBe("function");
      expect((await nextConfig.headers!()).length).toBeGreaterThan(0);
    });

    test("tidak ada header wajib yang dikirim dua kali dengan nilai berbeda", async () => {
      const semua = (await nextConfig.headers!()).flatMap((r) => r.headers);
      for (const key of Object.keys(WAJIB)) {
        const nilai = new Set(semua.filter((h) => h.key === key).map((h) => h.value));
        expect(nilai.size).toBeLessThanOrEqual(1);
      }
    });
  });
});
