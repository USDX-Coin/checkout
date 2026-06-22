// 401 di checkout (token absen / kedaluwarsa, USDX-239) → redirect balik ke `app`
// (`NEXT_PUBLIC_APP_URL`) supaya user re-auth, lalu mulai ulang dari `/mint`.
// Top-level navigation (cross-origin), bukan SPA route. Return false bila appUrl
// tak di-set (caller fallback ke `router.back()`). SSR-safe.

import { env } from "@/lib/env";

export function redirectToApp(): boolean {
  if (typeof window === "undefined") return false;
  if (!env.appUrl) return false;
  window.location.assign(env.appUrl);
  return true;
}
