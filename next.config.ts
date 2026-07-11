import type { NextConfig } from "next";

// Security headers dipasang di sini (BUKAN hanya di netlify.toml) karena blok
// `[[headers]]` Netlify hanya berlaku untuk aset statis — TIDAK untuk respons SSR
// Next.js. Terbukti via curl ke dev deploy: halaman SSR tidak mengirim
// X-Frame-Options / CSP. `async headers()` diterapkan Next.js ke SEMUA respons
// (SSR + statis), jadi ini yang benar-benar menutup gap clickjacking (USDX-380).
//
// Nilai disamakan dengan netlify.toml checkout + pola back-office yang live:
// halaman bayar pegang alur pembayaran + bearer token (handoff via URL hash,
// USDX-239) → framing di-DENY penuh (checkout dicapai via top-level redirect dari
// `app`, BUKAN iframe). CSP sengaja hanya `frame-ancestors 'none'` supaya tidak
// memblokir resource sah. Saat jalur partner masuk nanti: ganti jadi allowlist.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none';" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
