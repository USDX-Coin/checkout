// Warna brand partner → warna yang benar-benar terbaca, di Light MAUPUN Dark (USDX-548).
//
// `partner_branding.primary_color` / `accent_color` diisi PARTNER, bukan kami. Artinya nilainya
// bisa apa saja: kuning neon, putih, `#000`, atau string yang bukan warna. Menempelkannya
// mentah-mentah ke tombol lalu menulis teks putih di atasnya adalah cara paling mudah
// menghasilkan tombol "Kembali" yang tak terbaca — dan tombol itu satu-satunya jalan keluar
// customer dari halaman kami.
//
// ── KENAPA JAMINANNYA BERBENTUK SEPERTI INI ──────────────────────────────────────────────────
// Warna brand TIDAK berganti antar tema (ia milik partner, bukan milik tema). Jadi keterbacaan
// TEKS DI ATAS brand cukup dihitung sekali dan otomatis berlaku di dua tema — itu jaminan yang
// bisa ditegakkan.
//
// Yang TIDAK bisa ditegakkan lewat warna: "brand harus kontras terhadap latar halaman di dua
// tema". Satu warna tetap tidak mungkin sekaligus kontras terhadap latar hampir-putih (#f2f2f2)
// dan hampir-hitam (#0a0a0a) — begitu ia cukup gelap untuk terlihat di Light, ia lenyap di Dark.
// Percobaan pertama berkas ini memang mensyaratkan itu, dan tesnya langsung menunjukkan bahwa
// warna fallback kami sendiri pun gagal.
//
// Maka batas permukaan tombol diselesaikan di tempat yang benar: BORDER dari token tema
// (`border-foreground/15` di `PartnerUi`), yang ikut berbalik bersama tema. Dengan begitu tombol
// warna apa pun — termasuk putih di Light atau hitam di Dark — tetap punya tepi yang terlihat,
// dan satu-satunya syarat pada warna partner adalah syarat yang memang selalu bisa dipenuhi:
// teks di atasnya terbaca.

/** Dua kandidat teks di atas permukaan brand. Sama dengan `--foreground` kedua tema. */
const TEXT_LIGHT = "#fafafa";
const TEXT_DARK = "#1a1a1a";

/** Ambang WCAG AA untuk teks normal. */
export const AA_CONTRAST = 4.5;

/**
 * `#rgb` / `#rrggbb` (dengan atau tanpa `#`) → `#rrggbb` huruf kecil, atau `null` kalau bukan
 * hex yang sah. Sengaja TIDAK menerima `rgb()`/nama warna: partner mengisi kolom `char(7)`,
 * dan menerima bentuk lain berarti menebak apa yang mereka maksud.
 */
export function normalizeHex(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim().replace(/^#/, "");
  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)) return null;
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  return `#${full.toLowerCase()}`;
}

function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Luminansi relatif WCAG. Input WAJIB `#rrggbb` (hasil `normalizeHex`). */
export function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (
    0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
  );
}

/** Rasio kontras WCAG 2.x (1..21). Hex tak sah → 1 (paling buruk), bukan lempar. */
export function contrastRatio(a: string, b: string): number {
  const hexA = normalizeHex(a);
  const hexB = normalizeHex(b);
  if (!hexA || !hexB) return 1;
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Warna teks yang paling terbaca di atas `surface`. Dipilih dengan MENGUKUR, bukan dengan ambang
 * "gelap/terang" — ambang itulah yang menghasilkan teks putih di atas kuning.
 */
export function readableTextOn(surface: string | null | undefined): string {
  const hex = normalizeHex(surface);
  if (!hex) return TEXT_DARK;
  return contrastRatio(hex, TEXT_LIGHT) >= contrastRatio(hex, TEXT_DARK) ? TEXT_LIGHT : TEXT_DARK;
}

/**
 * `true` kalau teks di atas permukaan ini lolos AA.
 *
 * Ini BISA gagal, dan itulah gunanya: ada pita abu-abu tengah (sekitar `#767676`) di mana teks
 * terang maupun gelap sama-sama tidak mencapai 4.5. Permukaan seperti itu tidak boleh dipakai
 * sebagai tombol, seberapa pun partner menyukainya.
 */
export function hasReadableText(surface: string | null | undefined): boolean {
  const hex = normalizeHex(surface);
  if (!hex) return false;
  return contrastRatio(hex, readableTextOn(hex)) >= AA_CONTRAST;
}

// Fallback saat partner tak mengisi warna, mengisinya dengan nilai tak sah, atau mengisi warna
// yang teksnya tak terbaca. WAJIB netral: memakai maroon USDX di sini akan menyelundupkan merek
// kami ke halaman yang justru diminta tanpa merek.
export const NEUTRAL_FALLBACK_PRIMARY = "#334155";
export const NEUTRAL_FALLBACK_ACCENT = "#475569";

export interface ResolvedBrand {
  /** Permukaan tombol utama. Dijamin ada dan dijamin teksnya terbaca. */
  primary: string;
  /** Teks di atas `primary`. Dihitung, bukan diasumsikan. */
  primaryText: string;
  /** Warna aksen (sorotan tipis). Tidak dipakai untuk apa pun yang memikul teks. */
  accent: string;
}

/**
 * Warna partner → warna yang aman dipakai. Warna tak sah, atau warna yang tak bisa memikul teks
 * yang terbaca, DIGANTI fallback netral. Inilah yang membuat AC "nol elemen tidak terbaca di
 * salah satu tema" bisa dijamin tanpa memercayai isian partner.
 */
export function resolveBrand(
  primaryColor: string | null | undefined,
  accentColor: string | null | undefined,
): ResolvedBrand {
  const primaryCandidate = normalizeHex(primaryColor);
  const primary =
    primaryCandidate && hasReadableText(primaryCandidate)
      ? primaryCandidate
      : NEUTRAL_FALLBACK_PRIMARY;

  const accent = normalizeHex(accentColor) ?? NEUTRAL_FALLBACK_ACCENT;

  return { primary, primaryText: readableTextOn(primary), accent };
}
