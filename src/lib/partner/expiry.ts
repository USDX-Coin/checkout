// Umur sesi partner tidak boleh melampaui umur ORDER-nya (USDX-548).
//
// `partner_checkout_sessions.expires_at` dan `mint_orders.expires_at` adalah dua kolom terpisah,
// jadi keduanya bisa berbeda — dan yang berbahaya hanya satu arah: sesi yang hidup LEBIH LAMA
// dari ordernya. Halaman itu masih membuka nomor VA dari order yang sudah mati, jadi customer
// bisa mentransfer ke nomor yang tak lagi dicocokkan dengan apa pun. Uang masuk, pesanan tidak
// ada. Karena itu umur efektif = yang mana pun yang habis LEBIH DULU.

/** Timestamp ISO → epoch ms, atau `null` kalau tak bisa dibaca. */
function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Batas waktu efektif = MIN(kedaluwarsa sesi, kedaluwarsa order), dalam epoch ms.
 *
 * Salah satu tak terbaca → pakai yang terbaca. KEDUANYA tak terbaca → `null`, dan pemanggil
 * WAJIB memperlakukannya sebagai sudah kedaluwarsa: tanpa batas yang diketahui, satu-satunya
 * jawaban yang aman bukan "berlaku selamanya".
 */
export function effectiveExpiryMs(
  sessionExpiresAt: string | null | undefined,
  orderExpiresAt: string | null | undefined,
): number | null {
  const session = parseMs(sessionExpiresAt);
  const order = parseMs(orderExpiresAt);
  if (session === null && order === null) return null;
  if (session === null) return order;
  if (order === null) return session;
  return Math.min(session, order);
}

/**
 * `true` kalau sesi tak lagi boleh membuka halaman. Batas tak diketahui → `true` (fail closed).
 */
export function isPartnerSessionExpired(
  sessionExpiresAt: string | null | undefined,
  orderExpiresAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const limit = effectiveExpiryMs(sessionExpiresAt, orderExpiresAt);
  if (limit === null) return true;
  return now >= limit;
}

/** Sisa detik sampai batas efektif (0 kalau habis / tak diketahui). */
export function secondsUntilEffectiveExpiry(
  sessionExpiresAt: string | null | undefined,
  orderExpiresAt: string | null | undefined,
  now: number = Date.now(),
): number {
  const limit = effectiveExpiryMs(sessionExpiresAt, orderExpiresAt);
  if (limit === null) return 0;
  return Math.max(0, Math.floor((limit - now) / 1000));
}
