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

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

export const env = {
  apiBaseUrl,
  appUrl,
} as const;
