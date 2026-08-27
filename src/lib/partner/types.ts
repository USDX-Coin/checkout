// Jalur partner (USDX-548). Customer partner TIDAK punya aplikasi USDX dan TIDAK punya akun —
// jadi jalur handoff `#code=` dari `app` (USDX-378) tak bisa dipakai sama sekali. Pintu masuknya
// tautan ber-token: `checkout.usdx.co.id/s/{token}` (bentuknya dari kontrak partner,
// `sot/api/partner-mint.yaml` → `PaymentRedirect.checkout_url`).
//
// Token itu KREDENSIAL: ia membuka halaman bayar tanpa login. Karena itu backend menyimpan
// HASH-nya (`partner_checkout_sessions.token_hash`, migrasi 0076) dan yang dibandingkan adalah
// hash — tabel tak pernah memuat token mentah. Di sisi halaman, kewajibannya berbeda tapi
// setara: token mentah hanya lewat sekali (body POST resolve), lalu DIBUANG dari URL/riwayat
// dan tidak pernah ditulis ke storage atau log. Lihat `@/lib/partner/entry`.

// ── TIGA MODEL CHECKOUT (keputusan Wisnu) ────────────────────────────────────────────────────
// Hanya DUA di antaranya punya halaman. Ini bukan detail sepele: kalau `VA` sampai ikut
// dirender, kita menyodorkan halaman kepada customer yang seharusnya cukup menerima nomor VA
// dari partnernya — dan halaman itu tak punya konteks apa pun untuk dipercaya.
//
//   VA      → TANPA halaman. Nomor VA dikembalikan lewat API ke partner (`delivery: VA`,
//             `PaymentVirtualAccount`), partner yang menampilkannya di produknya sendiri.
//   USDX    → halaman ber-brand USDX (`delivery: REDIRECT`, `theme: USDX`).
//   NEUTRAL → halaman tanpa merek USDX, memakai aset partner (`theme: NEUTRAL`).
export type CheckoutModel = "VA" | "USDX" | "NEUTRAL";

// Model yang benar-benar punya halaman ter-host di repo ini.
export const MODELS_WITH_PAGE = ["USDX", "NEUTRAL"] as const;

// `theme` pada `partner_checkout_sessions` / `MintCreate.theme` — dua nilai ini yang menentukan
// PRESENTASI satu basis komponen yang sama (lihat `PartnerCheckout`).
export type CheckoutPresentation = (typeof MODELS_WITH_PAGE)[number];

export function hasHostedPage(model: CheckoutModel): model is CheckoutPresentation {
  return (MODELS_WITH_PAGE as readonly string[]).includes(model);
}

// ── BRANDING PARTNER ─────────────────────────────────────────────────────────────────────────
// Cermin `partner_branding` (migrasi 0076). Model dipilih dari SINI + kolom `theme` di baris
// sesi — keduanya sisi server. TIDAK PERNAH dari query string: query string bisa diubah oleh
// pembaca halaman, jadi `?theme=NEUTRAL` akan jadi cara gratis melepas merek kami dari halaman
// kami sendiri.
export interface PartnerBranding {
  displayName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  supportEmail: string | null;
  footerText: string | null;
  // Origin yang TERDAFTAR untuk partner ini (diturunkan backend dari `partner_branding`,
  // termasuk `custom_domain`). `return_url`/`cancel_url` divalidasi terhadap daftar ini —
  // tanpa itu halaman kami jadi alat redirect terbuka: siapa pun yang bisa membuat sesi
  // (atau menebak bentuk tautannya) bisa memakai domain kami untuk melempar orang ke mana pun.
  allowedReturnOrigins: string[];
}

// Status baris `partner_checkout_sessions` (migrasi 0076).
export type PartnerSessionStatus =
  | "PENDING"
  | "OPENED"
  | "COMPLETED"
  | "EXPIRED"
  | "CANCELLED";

// Hasil resolve token → sesi. Bentuknya mengikuti kolom `partner_checkout_sessions` +
// `partner_branding`. Endpoint-nya BELUM ADA (lingkup USDX-547) — lihat `@/lib/api/partner`.
export interface PartnerCheckoutSession {
  orderId: string;
  model: CheckoutModel;
  status: PartnerSessionStatus;
  // Kredensial untuk request berikutnya (GET order / POST pay) atas nama sesi ini.
  // BUKAN token tautan: token tautan sudah habis dipakai saat resolve.
  sessionToken: string;
  // Kedaluwarsa baris sesi. Umur efektif = MIN(ini, kedaluwarsa order) — lihat `expiry.ts`.
  expiresAt: string;
  returnUrl: string | null;
  cancelUrl: string | null;
  branding: PartnerBranding | null;
}
