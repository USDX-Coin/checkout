// `/s` tanpa token — tempat mendarat setelah token dibuang dari riwayat (USDX-548).
//
// Rute ini ada supaya refresh sesudah token di-strip tidak menabrak 404. Ia sengaja tidak
// mencoba memulihkan apa pun: tanpa token tidak ada yang bisa dibuka, dan pesannya sama dengan
// semua kegagalan lain agar tidak memberi tahu apakah suatu pesanan ada.

import type { Metadata } from "next";
import { PARTNER_SESSION_REJECTED_MESSAGE } from "@/lib/api/partner";

// Judul netral (lihat catatan di `/pay/[orderId]/page.tsx`).
export const metadata: Metadata = {
  title: "Pembayaran",
  description: "Halaman pembayaran pesanan",
};

export default function PartnerSessionMissingPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">{PARTNER_SESSION_REJECTED_MESSAGE}</p>
    </main>
  );
}
