// Kode unik Transfer BNI (D25 + rev-17 R2 — `sot/bni-integration.md` §4.3.12, `api/mint.yaml`
// MintOrder.uniqueCode).
//
// Kode unik DITAMBAHKAN ke tagihan (`total_pay_idr = subtotal + fee + kode`), jadi checkout
// menampilkannya sebagai keterangan "sudah termasuk kode unik Rp N", bukan sorotan digit.

/**
 * Kode unik dari backend sebagai angka rupiah, kalau bentuknya sesuai kontrak (`001`–`999`, tidak
 * pernah `000`). Di luar itu null: lebih baik keterangannya tidak tampil daripada menyebut angka
 * yang salah di kalimat tentang uang.
 */
export function uniqueCodeAmount(uniqueCode: string | null | undefined): number | null {
  if (!uniqueCode || !/^\d{1,3}$/.test(uniqueCode)) return null;
  const n = Number(uniqueCode);
  return n >= 1 && n <= 999 ? n : null;
}
