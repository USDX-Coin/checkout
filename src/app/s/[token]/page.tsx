// Pintu masuk jalur partner: `checkout.usdx.co.id/s/{token}` (USDX-548).
//
// Bentuk tautan ini adalah KONTRAK — `sot/api/partner-mint.yaml` → `PaymentRedirect.checkout_url`
// ("https://checkout.usdx.co.id/s/9f2a1b3c4d"). Server component tipis; seluruh kerjanya
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
