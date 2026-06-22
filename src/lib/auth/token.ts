// Auth checkout = bearer JWT yang di-handoff dari `app` lewat URL hash
// (`#token=<jwt>`) saat redirect — USDX-239 (supersede cross-subdomain cookie).
//
// Token di-capture SEKALI saat halaman load (sebelum fetch pertama → anti-race,
// ref USDX-58), disimpan di `sessionStorage` (refresh-safe per-tab), lalu
// di-strip dari URL via `history.replaceState` supaya kredensial tidak tertinggal
// di URL/history/Referer. Tidak pakai cookie / `credentials:"include"`.
// SSR-safe (guard `window`).

export const CHECKOUT_TOKEN_KEY = "usdx_checkout_token";

// Baca `#token=<jwt>` dari URL → simpan ke sessionStorage → buang dari URL.
// Return token bila ada di hash, selain itu null. Idempoten (panggilan kedua,
// hash sudah bersih, jadi no-op) + SSR-safe.
export function captureTokenFromHash(): string | null {
  if (typeof window === "undefined") return null;

  const raw = window.location.hash;
  const hash = raw.startsWith("#") ? raw.slice(1) : raw;
  const token = new URLSearchParams(hash).get("token");
  if (!token) return null;

  window.sessionStorage.setItem(CHECKOUT_TOKEN_KEY, token);
  // Hapus hash — kredensial tidak boleh nyangkut di URL. Pertahankan path + query.
  const { pathname, search } = window.location;
  window.history.replaceState(null, "", pathname + search);
  return token;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(CHECKOUT_TOKEN_KEY);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(CHECKOUT_TOKEN_KEY);
}
