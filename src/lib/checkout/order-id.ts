// Bentuk `orderId` yang sah untuk rute `/checkout/{orderId}` (temuan audit B14).
//
// Kontraknya UUID — `sot/api/common.yaml#/parameters/ResourceId` (`format: uuid`) dan
// `sot/api/mint.yaml#/schemas/MintOrder.id`. `app` membangun tautannya dari `order.id`
// (`app/src/hooks/useMint.ts`), jadi tautan yang sah SELALU berbentuk UUID.
//
// Pemeriksaan ini TIDAK memblokir request. Ia hanya dipakai untuk memilih PESAN: id yang tak
// berbentuk UUID hampir pasti URL yang diketik/dipotong salah, dan pantas dijawab "nomor
// pesanan tidak valid" alih-alih dilempar diam-diam ke halaman login `app`. Kalau suatu hari
// backend mengganti format id, halaman tetap memuat pesanan seperti biasa — yang meleset
// paling jauh cuma kalimat errornya, bukan aksesnya.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOrderIdWellFormed(id: string | null | undefined): boolean {
  return typeof id === "string" && UUID.test(id.trim());
}
