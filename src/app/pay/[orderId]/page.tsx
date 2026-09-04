// Halaman pembayaran jalur partner (USDX-548) — `/pay/{orderId}`.
//
// Tempat mendarat setelah `/s/{token}` membuang tokennya dari riwayat. Rute ini terpisah dari
// `/checkout/{orderId}` supaya jalur aplikasi tidak tersentuh sama sekali (lihat
// PartnerCheckoutRoute). Server component tipis; semua keadaan ada di klien.

import type { Metadata } from "next";
import { PartnerCheckoutRoute } from "@/components/checkout/partner/PartnerCheckoutRoute";

// Judul NETRAL, menimpa `title` di layout ("USDX Checkout").
//
// Ini bukan kerapian: judul layout adalah nama kami, dan ia sudah terkirim di HTML pertama —
// jadi halaman netral akan MENGEDIPKAN "USDX Checkout" di judul tab sebelum JavaScript sempat
// menggantinya. Presentasi mana yang dipakai baru diketahui di klien (sesi ada di
// `sessionStorage`), jadi judul yang aman untuk dikirim dari server adalah judul yang tak
// menyebut siapa pun. Klien menyempurnakannya sesudah itu (lihat `PartnerCheckout`).
export const metadata: Metadata = {
  title: "Pembayaran",
  description: "Halaman pembayaran pesanan",
};

export default function PartnerPayPage() {
  return <PartnerCheckoutRoute />;
}
