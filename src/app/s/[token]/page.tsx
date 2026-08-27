// Pintu masuk jalur partner: `mint.usdx.co.id/s/{token}` (USDX-548).
//
// HOST-nya keputusan Wisnu 27 Agu 2026: `mint.usdx.co.id`, host checkout yang sudah dipakai —
// bukan subdomain baru. Draf awal kontrak menulis `checkout.usdx.co.id`, dan kontraknya yang
// dibetulkan (sot#16), bukan infrastrukturnya. Konsekuensinya nol: tidak ada DNS, sertifikat,
// atau entri `CORS_ORIGINS` baru yang dibutuhkan.
//
// Bentuk tautan ini adalah KONTRAK — `sot/api/partner-mint.yaml` → `PaymentRedirect.checkout_url`
// ("https://mint.usdx.co.id/s/9f2a1b3c4d"). Server component tipis; seluruh kerjanya
// (buang token dari riwayat → resolve → pindah ke halaman pembayaran) ada di PartnerSessionEntry.

import type { Metadata } from "next";
import { PartnerSessionEntry } from "@/components/checkout/partner/PartnerSessionEntry";

// Judul netral, menimpa `title` layout: sesi bisa bermodel NEUTRAL, dan pintu masuknya sudah
// terlihat di tab sebelum kita tahu modelnya. Lihat catatan di `/pay/[orderId]/page.tsx`.
export const metadata: Metadata = {
  title: "Pembayaran",
  description: "Halaman pembayaran pesanan",
};

export default function PartnerSessionEntryPage() {
  return <PartnerSessionEntry />;
}
