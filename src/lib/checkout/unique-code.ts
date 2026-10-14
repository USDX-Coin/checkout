// Kode unik Transfer BNI (D25 + rev-17 R2; sejak keputusan PM 14 Okt 2026 — USDX-749 — dalam SEN
// USD). Kode DITAMBAHKAN ke tagihan (`totalPayUsd = dasar + kode`) dan IKUT di-mint, jadi checkout
// menampilkannya sebagai keterangan "sudah termasuk kode unik $0,47", bukan sorotan digit.

/**
 * Kode unik dari backend (`"01"`–`"99"`, sen) sebagai DOLAR (`"47"` → `0.47`) supaya bisa langsung
 * diformat `formatUSD`. Di luar bentuk kontrak → null: lebih baik keterangannya tidak tampil daripada
 * menyebut angka yang salah di kalimat tentang uang. Kode 3 digit milik Transfer BNI rupiah yang
 * lama (`001`–`999`) sengaja ditolak — membacanya sebagai sen akan menyebut $4,17 untuk Rp 417.
 */
export function uniqueCodeUsd(uniqueCode: string | null | undefined): number | null {
  if (!uniqueCode || !/^\d{1,2}$/.test(uniqueCode)) return null;
  const cents = Number(uniqueCode);
  return cents >= 1 && cents <= 99 ? cents / 100 : null;
}
