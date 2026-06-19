// Config runtime yang terlihat klien (USDX-224). Var NEXT_PUBLIC_* ter-inline ke bundle
// saat build.
//
// - `apiBaseUrl` — base URL backend (`/api/v2/*`). Diisi per environment (Netlify /
//   .env.local). Checkout SELALU hit backend real, tanpa layer mock (keputusan 2026-06-19).
//
// Auth = cross-subdomain cookie `.usdx.co.id` (USDX-222): client memakai
// `credentials: "include"`, BUKAN Bearer token. Cookie hanya menempel saat checkout
// diakses dari origin `*.usdx.co.id` (tidak di localhost murni).
//
// Navigasi balik ke `app` (Batal/Kembali) memakai `router.back()` — dynamic, tanpa
// hardcode domain app, jadi tidak ada env URL app di sini.

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

export const env = {
  apiBaseUrl,
} as const;
