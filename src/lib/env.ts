// Config runtime yang terlihat klien (USDX-224). Var NEXT_PUBLIC_* ter-inline ke bundle
// saat build.
//
// - `apiBaseUrl` — base URL backend (`/api/v2/*`). Diisi per environment (Netlify /
//   .env.local). Checkout SELALU hit backend real, tanpa layer mock (keputusan 2026-06-19).
//
// Auth = bearer JWT yang di-handoff dari `app` lewat URL hash (USDX-239): client
// kirim `Authorization: Bearer <token>` dari sessionStorage, BUKAN cookie. Lihat
// `@/lib/auth/token`.
//
// - `appUrl` — URL `app` consumer untuk redirect balik saat `401` (token absen /
//   kedaluwarsa). Diisi per environment (Netlify). Kalau kosong → fallback
//   `router.back()` (mis. localhost dev).
//
// - `demoAutocomplete` — DEMO only (dev/preview): simulasikan status tracker maju ke
//   "Selesai" setelah bayar (pipeline on-chain real belum jalan di dev). Display-only;
//   nyala bila `NEXT_PUBLIC_DEMO_AUTOCOMPLETE="true"`. WAJIB OFF di prod.

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
const demoAutocomplete = process.env.NEXT_PUBLIC_DEMO_AUTOCOMPLETE === "true";

export const env = {
  apiBaseUrl,
  appUrl,
  demoAutocomplete,
} as const;
