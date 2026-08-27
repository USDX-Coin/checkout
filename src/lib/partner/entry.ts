// Pintu masuk jalur partner: `mint.usdx.co.id/s/{token}` (USDX-548 — host diputuskan Wisnu 27 Agu).
//
// Bentuk tautan datang dari kontrak partner (`sot/api/partner-mint.yaml` →
// `PaymentRedirect.checkout_url`), jadi token mentah MEMANG lewat path URL — itu tak bisa
// dihindari, partner harus bisa mengirimkan satu tautan. Yang bisa dan wajib dihindari adalah
// token itu MENETAP: di entri riwayat, di `Referer` request berikutnya, di screenshot, di
// storage, di log.
//
// Jadi begitu halaman hidup, token dibaca sekali lalu path-nya ditimpa (`replaceState`) — pola
// yang sama dengan `#code=` handoff aplikasi (`@/lib/auth/token`, USDX-378/WSTG-CLNT-12), dan
// dengan alasan yang sama: kredensial yang tak lagi ada di URL tak bisa diputar ulang oleh
// siapa pun yang cuma memegang riwayat browser.
//
// Token mentah TIDAK PERNAH: ditulis ke sessionStorage/localStorage, dipakai sebagai queryKey,
// masuk query string request, atau di-log. Ia hanya muncul satu kali, di BODY POST resolve.
// Yang disimpan setelahnya adalah kredensial sesi hasil resolve (lihat `session-store.ts`).

/** Path yang dituju setelah token dibuang — tanpa segmen token. */
export const PARTNER_ENTRY_STRIPPED_PATH = "/s";

/**
 * Buang token dari entri riwayat saat ini. Idempoten & SSR-safe.
 *
 * Dipanggil SEBELUM resolve, bukan sesudah: kalau resolve lambat lalu user menutup tab atau
 * membagikan layarnya, token tidak boleh masih terpampang di address bar.
 */
export function stripPartnerTokenFromUrl(): void {
  if (typeof window === "undefined") return;
  const { pathname, hash } = window.location;
  if (pathname === PARTNER_ENTRY_STRIPPED_PATH && !hash) return;
  // Query string ikut dibuang: tak ada satu pun parameter yang boleh menyetir tampilan
  // (model checkout datang dari `partner_branding`, bukan dari pembaca halaman), dan `#`
  // tak pernah dipakai di jalur ini.
  window.history.replaceState(null, "", PARTNER_ENTRY_STRIPPED_PATH);
}

/**
 * Token dari segmen path `/s/{token}` — dibersihkan dan divalidasi bentuknya.
 *
 * Bentuk yang diterima sengaja sempit (URL-safe, 16–256 karakter): apa pun di luar itu bukan
 * token yang kami terbitkan, jadi tak perlu diteruskan ke backend hanya untuk ditolak — dan
 * menolaknya di sini mencegah isi path yang aneh ikut terbawa ke request.
 */
export function readPartnerTokenFromPath(segment: string | string[] | undefined): string | null {
  const raw = Array.isArray(segment) ? segment[0] : segment;
  if (typeof raw !== "string") return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const token = decoded.trim();
  if (!/^[A-Za-z0-9._~-]{16,256}$/.test(token)) return null;
  return token;
}
