"use client";

// Pintu masuk `/s/{token}` (USDX-548).
//
// Tugasnya cuma tiga, dan urutannya penting:
//   1. baca token dari path, lalu BUANG token dari entri riwayat — sebelum request apa pun,
//   2. tukar token → sesi (`POST` resolve; token hanya lewat di body),
//   3. simpan sesi di slotnya sendiri, lalu pindah ke `/pay/{orderId}`.
//
// Langkah 1 dilakukan lebih dulu supaya tidak ada jendela waktu di mana token masih terpampang
// di address bar sementara kita menunggu jaringan. Setelah pindah ke `/pay/{orderId}`, refresh
// tetap bekerja: sesinya ada di `sessionStorage`, dan tokennya sudah tidak dibutuhkan.
//
// Tujuannya `/pay/...`, BUKAN `/checkout/...`: rute aplikasi tidak disentuh tiket ini.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { PARTNER_SESSION_REJECTED_MESSAGE, resolvePartnerSession } from "@/lib/api/partner";
import { readPartnerTokenFromPath, stripPartnerTokenFromUrl } from "@/lib/partner/entry";
import { savePartnerSession } from "@/lib/partner/session-store";

export function PartnerSessionEntry() {
  const router = useRouter();
  const params = useParams<{ token: string }>();

  // `useState` lazy: jalan saat render pertama, sebelum effect mana pun dan sebelum queryFn
  // React Query. Token dibaca lalu URL-nya langsung ditimpa dalam satu tarikan.
  const [token] = useState<string | null>(() => {
    const value = readPartnerTokenFromPath(params?.token);
    stripPartnerTokenFromUrl();
    return value;
  });

  // queryKey TIDAK memuat token: kunci cache ikut terlihat di devtools dan di dump state.
  const resolve = useQuery({
    queryKey: ["partner-session-resolve"],
    queryFn: () => resolvePartnerSession(token!),
    enabled: Boolean(token),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });

  useEffect(() => {
    const session = resolve.data;
    if (!session) return;
    savePartnerSession(session);
    router.replace(`/pay/${encodeURIComponent(session.orderId)}`);
  }, [resolve.data, router]);

  const rejected = !token || resolve.isError;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      {rejected ? (
        <p className="text-sm text-muted-foreground">{PARTNER_SESSION_REJECTED_MESSAGE}</p>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> Membuka pembayaran…
        </p>
      )}
    </main>
  );
}
