// 401 di checkout (token absen / kedaluwarsa, USDX-239) → redirect balik ke `app`
// (`NEXT_PUBLIC_APP_URL`) supaya user re-auth, lalu mulai ulang dari `/mint`.
// Top-level navigation (cross-origin), bukan SPA route. Return false bila appUrl
// tak di-set (caller fallback ke `router.back()`). SSR-safe.

import { env } from "@/lib/env";

/** Halaman riwayat transaksi di `app` (mis. dev.app.usdx.co.id/history). */
const APP_HISTORY_PATH = "/history";

export function redirectToApp(path = ""): boolean {
  if (typeof window === "undefined") return false;
  if (!env.appUrl) return false;
  window.location.assign(`${env.appUrl}${path}`);
  return true;
}

/**
 * Pulang ke `app` SETELAH pesanan selesai diurus di checkout — navigasi penuh, sengaja BUKAN
 * `router.back()`.
 *
 * `router.back()` memundurkan riwayat browser, jadi tab `app` dipulihkan persis seperti saat
 * ditinggalkan — termasuk modal "Ringkasan Transaksi" yang terbuka waktu user menekan "Lanjut
 * Pembayaran". User yang SUDAH bayar lalu disodori tombol "Lanjut Pembayaran" lagi (terlihat di
 * rekaman uji 21 Agu, modal bertahan 6 detik sampai ditutup manual). Navigasi penuh memuat app
 * dari awal, jadi modalnya hilang dengan sendirinya.
 *
 * Mendarat di riwayat transaksi: di situlah pesanannya terlihat "Menunggu Persetujuan", nyambung
 * dengan janji "token akan otomatis masuk setelah selesai". Kembali ke `/mint` cuma menampilkan
 * form kosong, seolah pesanannya lenyap.
 *
 * `false` = `appUrl` tak di-set (mis. localhost) → pemanggil fallback ke `router.back()`.
 */
export function returnToApp(): boolean {
  return redirectToApp(APP_HISTORY_PATH);
}
