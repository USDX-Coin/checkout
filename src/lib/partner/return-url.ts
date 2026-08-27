// Validasi `return_url` / `cancel_url` terhadap daftar origin TERDAFTAR di `partner_branding`
// (USDX-548).
//
// Kenapa ini bukan formalitas: tombol "kembali ke aplikasi partner" adalah navigasi yang
// DILAKUKAN OLEH HALAMAN KAMI, dari domain kami, atas URL yang datang dari luar. Tanpa
// pembatasan, halaman checkout kami berubah jadi pengalih terbuka (open redirect) — alat yang
// justru berharga untuk phishing karena domainnya terlihat sah. Jadi aturannya allowlist,
// bukan blocklist: yang tidak terdaftar DITOLAK, tanpa kecuali.
//
// Yang secara sengaja ditolak, karena semuanya pernah jadi celah open-redirect nyata:
//   - skema selain https (`javascript:`, `data:`, `http:`)
//   - URL relatif-protokol (`//evil.co.id`) — `new URL` tanpa base memang gagal, tapi
//     ditolak eksplisit supaya tak ada yang "memperbaiki" dengan menambahkan base
//   - kecocokan SUFIKS, bukan origin utuh (`evil-partner.co.id` vs `partner.co.id`,
//     `partner.co.id.evil.com`) → perbandingan memakai origin utuh hasil parse
//   - kredensial di dalam URL (`https://partner.co.id@evil.com`) — bagian sebelum `@`
//     terbaca sebagai host oleh mata manusia, bukan oleh parser
//   - port berbeda dari yang terdaftar (origin memuat port, jadi ini otomatis)

/** Skema satu-satunya yang boleh dituju. */
const ALLOWED_PROTOCOL = "https:";

/**
 * Normalisasi satu entri allowlist → origin kanonik (`https://host[:port]`), atau `null` kalau
 * entrinya tak bisa dipercaya. Menerima origin utuh maupun host telanjang
 * (`partner.co.id` → `https://partner.co.id`) karena `partner_branding.custom_domain`
 * menyimpan host, bukan URL.
 */
export function normalizeOrigin(entry: string): string | null {
  const raw = entry?.trim();
  if (!raw) return null;
  // Host telanjang → beri skema. Tapi JANGAN menolong `//host` (relatif-protokol) atau skema
  // lain: keduanya harus gagal, bukan diperbaiki.
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw);
  const candidate = hasScheme || raw.startsWith("//") ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== ALLOWED_PROTOCOL) return null;
  if (url.username || url.password) return null;
  if (!url.hostname) return null;
  return url.origin;
}

/** Daftar origin terdaftar → himpunan origin kanonik. Entri sampah dibuang, bukan ditoleransi. */
export function normalizeAllowedOrigins(entries: readonly string[] | null | undefined): string[] {
  if (!entries) return [];
  const out = new Set<string>();
  for (const entry of entries) {
    const normalized = normalizeOrigin(entry);
    if (normalized) out.add(normalized);
  }
  return [...out];
}

/**
 * `true` HANYA kalau `url` absolut, https, tanpa kredensial, dan origin-nya SAMA PERSIS dengan
 * salah satu origin terdaftar. Daftar kosong → selalu `false`: partner tanpa domain terdaftar
 * tidak punya tempat untuk dipulangkan, dan menebak-nebak justru itu lubangnya.
 */
export function isAllowedReturnUrl(
  url: string | null | undefined,
  allowedOrigins: readonly string[] | null | undefined,
): boolean {
  if (!url) return false;
  const allowed = normalizeAllowedOrigins(allowedOrigins);
  if (allowed.length === 0) return false;

  // Relatif-protokol: ditolak tegas, jangan pernah diberi base.
  if (url.startsWith("//")) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== ALLOWED_PROTOCOL) return false;
  if (parsed.username || parsed.password) return false;

  return allowed.includes(parsed.origin);
}

/**
 * URL yang boleh dipakai untuk navigasi, atau `null` kalau tidak lolos. Pemanggil WAJIB
 * memperlakukan `null` sebagai "tidak ada jalan keluar" — bukan "pakai apa adanya".
 */
export function safeReturnUrl(
  url: string | null | undefined,
  allowedOrigins: readonly string[] | null | undefined,
): string | null {
  return isAllowedReturnUrl(url, allowedOrigins) ? url! : null;
}
