// Penyimpanan sesi partner hasil resolve (USDX-548).
//
// SLOT SENDIRI, bukan slot yang sama dengan sesi aplikasi (`usdx_checkout_token`). Alasannya
// bukan kerapian: satu slot dipakai bersama berarti membuka tautan partner di tab yang sedang
// memegang sesi aplikasi akan MENIMPA sesi itu — persis kelas bug yang sudah kami punya di
// cookie desk. Dua jalur, dua kredensial, dua slot; tidak saling menyentuh.
//
// `sessionStorage` (bukan `localStorage`): per-tab, selamat dari refresh, hilang saat tab
// ditutup. Kredensial yang membuka halaman bayar tanpa login tidak boleh bertahan lebih lama
// dari tab yang membukanya.
//
// Yang disimpan adalah HASIL resolve — token tautan mentah tidak pernah sampai ke sini.

import type { PartnerCheckoutSession } from "./types";

export const PARTNER_SESSION_KEY = "usdx_checkout_partner_session";

function isSession(value: unknown): value is PartnerCheckoutSession {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.orderId === "string" &&
    s.orderId.length > 0 &&
    typeof s.sessionToken === "string" &&
    s.sessionToken.length > 0 &&
    typeof s.model === "string" &&
    typeof s.expiresAt === "string"
  );
}

export function savePartnerSession(session: PartnerCheckoutSession): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PARTNER_SESSION_KEY, JSON.stringify(session));
}

/**
 * Sesi tersimpan, atau `null`. Isi yang rusak/tak berbentuk sesi dibuang, bukan dipaksa dipakai —
 * halaman bayar yang jalan di atas sesi setengah jadi lebih buruk daripada halaman yang bilang
 * tautannya tak berlaku.
 */
export function readPartnerSession(): PartnerCheckoutSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(PARTNER_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isSession(parsed)) {
      window.sessionStorage.removeItem(PARTNER_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.sessionStorage.removeItem(PARTNER_SESSION_KEY);
    return null;
  }
}

/** Sesi tersimpan HANYA kalau ia milik order ini. Sesi order lain tidak boleh membuka order ini. */
export function readPartnerSessionFor(orderId: string): PartnerCheckoutSession | null {
  const session = readPartnerSession();
  if (!session) return null;
  return session.orderId === orderId ? session : null;
}

export function clearPartnerSession(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PARTNER_SESSION_KEY);
  snapshot = { raw: null, value: null };
}

// ── Snapshot untuk `useSyncExternalStore` ─────────────────────────────────────────────────────
// `sessionStorage` adalah store di luar React, dan membacanya lewat `useState` + `useEffect`
// menghasilkan dua masalah sekaligus: render server (tanpa `window`) berbeda dari render klien
// pertama (hidrasi tidak cocok), dan `setState` di dalam effect memicu render berantai.
// `useSyncExternalStore` memang dibuat untuk kasus ini — dengan syarat snapshotnya STABIL secara
// referensi, kalau tidak React akan me-render tanpa henti. Karena itu hasil parse di-cache dan
// hanya dihitung ulang saat string mentahnya berubah.
let snapshot: { raw: string | null; value: PartnerCheckoutSession | null } = {
  raw: null,
  value: null,
};

export function getPartnerSessionSnapshot(): PartnerCheckoutSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(PARTNER_SESSION_KEY);
  if (raw === snapshot.raw) return snapshot.value;
  snapshot = { raw, value: readPartnerSession() };
  return snapshot.value;
}

/** Snapshot server: selalu `null` — tak ada `sessionStorage` di server. */
export function getPartnerSessionServerSnapshot(): PartnerCheckoutSession | null {
  return null;
}

export function subscribePartnerSession(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  // `storage` tidak menyala untuk `sessionStorage` di tab yang sama, jadi ini bukan sumber
  // pembaruan utama — sesi partner ditulis sekali lalu tidak berubah selama tab hidup. Langganan
  // tetap dipasang supaya kontrak `useSyncExternalStore` terpenuhi.
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
