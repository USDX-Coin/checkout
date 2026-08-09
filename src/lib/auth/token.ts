// Auth checkout = sesi Better Auth yang DITUKAR dari one-time handoff code
// (USDX-378, WSTG-CLNT-12 — supersede bearer JWT di URL hash USDX-239). `app`
// redirect ke `mint.usdx.co.id/checkout/{id}#code=<code>` — `code` sekali-pakai,
// TTL 60 detik. Checkout:
//   1. baca `#code=` dari URL hash (`readHandoffCodeFromHash`) + STRIP dari URL,
//   2. tukar via `POST /api/v2/auth/checkout-token/exchange` → raw session token
//      (lihat `@/lib/api/auth`),
//   3. simpan token (`setToken`) di `sessionStorage`, pakai `Authorization: Bearer`.
//
// `code` hanya lewat URL sekejap lalu di-strip → replay dari history/Referer/
// screenshot MATI (beda dari bearer 30-hari lama). Token sesi TIDAK PERNAH masuk
// URL dan TIDAK di `localStorage` — `sessionStorage` = refresh-safe per-tab, hilang
// saat tab ditutup. Tidak pakai cookie / `credentials:"include"`. SSR-safe (guard
// `window`).

export const CHECKOUT_TOKEN_KEY = "usdx_checkout_token";

// Baca one-time handoff `#code=<code>` dari URL hash → STRIP dari URL → kembalikan
// code (null bila tak ada). Code BUKAN kredensial simpanan — hanya ditukar sekali,
// jadi fungsi ini tidak menyimpan apa pun. Idempoten (panggilan kedua: hash sudah
// bersih → null) + SSR-safe.
export function readHandoffCodeFromHash(): string | null {
  if (typeof window === "undefined") return null;

  const raw = window.location.hash;
  const hash = raw.startsWith("#") ? raw.slice(1) : raw;
  const code = new URLSearchParams(hash).get("code");
  if (!code) return null;

  // Buang hash — code sekali-pakai tidak boleh nyangkut di URL/history/Referer.
  // Pertahankan path + query.
  const { pathname, search } = window.location;
  window.history.replaceState(null, "", pathname + search);
  return code;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(CHECKOUT_TOKEN_KEY);
}

// Simpan session token hasil exchange. sessionStorage (BUKAN localStorage) — per-tab,
// hilang saat tab ditutup; kredensial sesi tidak boleh persist lintas-tab/lama.
export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(CHECKOUT_TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(CHECKOUT_TOKEN_KEY);
}
