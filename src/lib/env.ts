// Config runtime yang terlihat klien (USDX-224). Semua var NEXT_PUBLIC_* ter-inline
// ke bundle saat build.
//
// - `apiBaseUrl` — base URL backend (`/api/v2/*`). Diisi per environment (Netlify /
//   .env.local). Checkout SELALU hit backend real, tanpa layer mock (keputusan 2026-06-19).
// - `appUrl`     — origin repo `app` (mis. https://app.usdx.co.id), opsional. Dipakai
//   untuk link "Lihat Riwayat" → /history milik app. Kalau kosong, tombolnya disembunyikan.
//
// Auth = cross-subdomain cookie `.usdx.co.id` (USDX-222): client memakai
// `credentials: "include"`, BUKAN Bearer token. Cookie hanya menempel saat checkout
// diakses dari origin `*.usdx.co.id` (tidak di localhost murni).

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

export const env = {
  apiBaseUrl,
  appUrl,
} as const;
