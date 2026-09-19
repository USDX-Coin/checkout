import type { NextConfig } from "next";

// Security headers dipasang di sini, BUKAN di config reverse proxy, karena
// `async headers()` diterapkan Next.js ke SEMUA respons (SSR + statis) dan ikut ke
// mana pun halaman ini di-host — itu yang menutup gap clickjacking (USDX-380).
//
// Nilai dari USDX-362:
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
