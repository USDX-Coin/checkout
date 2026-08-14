// Config runtime yang terlihat klien (USDX-224). Var NEXT_PUBLIC_* ter-inline ke bundle
// saat build.
//
// - `apiBaseUrl` — base URL backend (`/api/v2/*`). Diisi per environment (Netlify /
//   .env.local). Checkout SELALU hit backend real, tanpa layer mock (keputusan 2026-06-19).
//
// Auth = raw session token hasil tukar one-time `#code=` handoff dari `app` (USDX-378):
// client kirim `Authorization: Bearer <token>` dari sessionStorage, BUKAN cookie. Lihat
// `@/lib/auth/token` + `@/lib/api/auth`.
//
// - `appUrl` — URL `app` consumer untuk redirect balik saat sesi tak valid (code
//   handoff invalid/kedaluwarsa/terpakai, atau token sesi 401). Diisi per environment
//   (Netlify). Kalau kosong → fallback `router.back()` (mis. localhost dev).
//
// - `demoAutocomplete` — DEMO only: simulasikan konfirmasi pembayaran setelah order
//   memilih metode, supaya demo lokal jalan tanpa provider bayar sungguhan. Display-only
//   (lihat `useCheckout`). **DUA syarat, keduanya wajib:** `NEXT_PUBLIC_DEMO_AUTOCOMPLETE
//   === "true"` DAN backend yang dituju terbukti BUKAN production (lihat di bawah).
//   Env sendirian tidak cukup — lihat blok berikutnya.

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

// ── Guard: mode demo TIDAK BOLEH bisa menyala di production ─────────────────────────
// Kenapa tidak cukup mengandalkan env: `NEXT_PUBLIC_DEMO_AUTOCOMPLETE=true` terbukti ikut
// terpasang di build production (Jenkins `usdx/frontend-checkout/main` #8 memakai
// `--build-arg NEXT_PUBLIC_DEMO_AUTOCOMPLETE=true` bersama `NEXT_PUBLIC_API_BASE_URL=
// https://api.usdx.co.id`). Satu baris env yang salah tak boleh cukup untuk membuat halaman
// pembayaran mengarang "Pembayaran diterima". Jadi flag hanya DIHORMATI kalau backend yang
// dituju memang bukan production.
//
// Jangkar = `NEXT_PUBLIC_API_BASE_URL`, BUKAN hostname halaman. Yang menentukan apakah uang
// di layar ini nyata adalah backend tempat order-nya hidup: build preview yang diarahkan ke
// backend production tetap mengurus order sungguhan, dan di situ demo wajib mati.
//
// DAFTAR PUTIH host non-prod, bukan daftar hitam host prod. Daftar hitam
// (`host !== "api.usdx.co.id"`) gagal MEMBUKA: salah ketik, domain prod baru, atau alias
// yang tak pernah didaftarkan → demo menyala di production. Daftar putih gagal MENUTUP:
// apa pun yang tidak dikenali (kosong, URL tak terparse, host asing) dianggap production →
// demo mati. Menambah environment demo baru = ubah baris ini + lewat review, bukan set env.
const NON_PROD_API_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]", // `new URL(...).hostname` mempertahankan kurung siku untuk IPv6
  "0.0.0.0",
  "api-dev.usdx.co.id", // backend dev (project-overview.md § Environment URLs)
]);

/** `true` HANYA kalau `url` terbukti menunjuk backend non-production. Apa pun yang tidak
 *  dikenali (kosong, relatif, tak terparse, host asing) → `false` = perlakukan production. */
export function isNonProdApiBaseUrl(url: string): boolean {
  if (!url) return false;
  try {
    return NON_PROD_API_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

const demoAutocomplete =
  process.env.NEXT_PUBLIC_DEMO_AUTOCOMPLETE === "true" && isNonProdApiBaseUrl(apiBaseUrl);

export const env = {
  apiBaseUrl,
  appUrl,
  demoAutocomplete,
} as const;
