"use client";

// Halaman order jalur partner: `/pay/{orderId}` (USDX-548).
//
// RUTE TERPISAH, bukan cabang di dalam `/checkout/{orderId}`. Ini keputusan sadar dan syarat
// tiketnya: jalur aplikasi tidak boleh berubah perilakunya. Cabang di dalam rute aplikasi berarti
// setiap render halaman aplikasi ikut melewati kode partner — dan cara paling murah untuk
// menjamin "tidak berubah" adalah tidak menyentuh berkasnya sama sekali. `src/app/checkout/
// [orderId]/page.tsx` dan `CheckoutContent` memang tak tersentuh oleh tiket ini.
//
// Kunci masuknya BUKAN URL: `/pay/{orderId}` tidak membuka apa pun tanpa sesi partner tersimpan
// yang memang milik order itu (lihat `readPartnerSessionFor`). Menempelkan orderId orang lain ke
// URL tidak menghasilkan halaman, dan pesannya sama dengan semua kegagalan lain.

import { useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import { PARTNER_SESSION_REJECTED_MESSAGE } from "@/lib/api/partner";
import {
  getPartnerSessionServerSnapshot,
  getPartnerSessionSnapshot,
  subscribePartnerSession,
} from "@/lib/partner/session-store";
import { PartnerCheckout } from "./PartnerCheckout";

export function PartnerCheckoutRoute() {
  const params = useParams<{ orderId: string }>();
  const orderId = params?.orderId ?? "";

  // `sessionStorage` adalah store di luar React. `useSyncExternalStore` membacanya tanpa
  // `setState` di dalam effect dan tanpa hidrasi yang tidak cocok (snapshot server = `null`).
  const stored = useSyncExternalStore(
    subscribePartnerSession,
    getPartnerSessionSnapshot,
    getPartnerSessionServerSnapshot,
  );

  // Sesi order LAIN tidak membuka order ini. Tanpa pemeriksaan ini, mengganti orderId di URL
  // akan memakai kredensial sesi yang sah untuk membuka pesanan yang bukan miliknya.
  const session = stored && stored.orderId === orderId && orderId ? stored : null;

  if (session) return <PartnerCheckout session={session} />;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">{PARTNER_SESSION_REJECTED_MESSAGE}</p>
    </main>
  );
}
