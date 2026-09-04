"use client";

// Layar "tautan pembayaran tidak berlaku" — satu komponen untuk TIGA pintu buntu jalur partner
// (temuan audit B13): `/s` tanpa token, `/s/{token}` yang ditolak backend, dan `/pay/{orderId}`
// tanpa sesi yang cocok. Ketiganya dulu merender satu paragraf abu-abu tanpa satu pun tombol —
// customer partner yang mendarat di sini berhenti total, di halaman milik pihak yang bahkan tidak
// dia kenal.
//
// SUMBER: Figma `TXzbmT9lo27cse6IwqSuEP`, page `DS · Standar 2026-09`, section `50` blok E
// (state E1 partner tak dikenal, E2 partner dikenal).
//
// DUA JALAN KELUAR, dan keduanya hanya dipasang kalau benar-benar bisa dipakai:
//
//  1. "Kembali ke {partner}" — HANYA kalau ada sesi tersimpan yang `return_url`-nya lolos
//     `safeReturnUrl` (allowlist origin partner). Tanpa validasi itu halaman kami berubah jadi
//     pengalih terbuka; lihat catatan panjang di `@/lib/partner/return-url`.
//  2. "Kembali ke halaman sebelumnya" — HANYA kalau tab ini memang punya riwayat. Tombol yang
//     tak melakukan apa-apa di layar buntu memperburuk keadaan, bukan memperbaikinya.
//
// Kalau dua-duanya tak tersedia, yang tampil arahan tekstual. Itu batas jujurnya: kami tidak
// tahu ke mana customer harus dipulangkan, dan menebak alamatnya bukan pilihan.

import { useSyncExternalStore } from "react";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PARTNER_SESSION_REJECTED_MESSAGE } from "@/lib/api/partner";
import { PARTNER_REJECTED_COPY } from "@/lib/partner/copy";
import { safeReturnUrl } from "@/lib/partner/return-url";
import {
  getPartnerSessionServerSnapshot,
  getPartnerSessionSnapshot,
  subscribePartnerSession,
} from "@/lib/partner/session-store";

// `window.history` adalah store di luar React, sama seperti `sessionStorage`: dibaca lewat
// `useSyncExternalStore` supaya render server (yang tak punya `window`) tidak berbeda dari
// hidrasi klien. Panjang riwayat tidak berubah selama layar ini hidup, jadi langganannya kosong.
const subscribeHistory = () => () => {};
const getCanGoBack = () => typeof window !== "undefined" && window.history.length > 1;
const getCanGoBackServer = () => false;

export function PartnerLinkRejected() {
  const session = useSyncExternalStore(
    subscribePartnerSession,
    getPartnerSessionSnapshot,
    getPartnerSessionServerSnapshot,
  );

  const canGoBack = useSyncExternalStore(subscribeHistory, getCanGoBack, getCanGoBackServer);

  const returnUrl = safeReturnUrl(
    session?.returnUrl ?? session?.cancelUrl,
    session?.branding?.allowedReturnOrigins,
  );
  const partnerName = session?.branding?.displayName ?? null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col items-center justify-center px-4 py-8">
      <div className="flex w-full flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <XCircle className="size-6" />
        </span>
        <p className="text-base font-semibold text-foreground">{PARTNER_REJECTED_COPY.heading}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {PARTNER_SESSION_REJECTED_MESSAGE}
        </p>

        {returnUrl && (
          // Navigasi lintas-origin ke domain partner yang SUDAH tervalidasi — memang
          // meninggalkan halaman kami, dan memang itu tujuannya.
          <a
            href={returnUrl}
            data-testid="partner-return-link"
            className="mt-1 flex h-12 w-full items-center justify-center rounded-xl border border-border text-sm font-medium text-foreground transition-control hover:bg-accent"
          >
            {PARTNER_REJECTED_COPY.returnCta(partnerName)}
          </a>
        )}

        {canGoBack ? (
          // `PartnerGhostButton` tidak dipakai di sini: layar ini hidup di LUAR `PartnerShell`,
          // jadi `--partner-brand` dkk. tidak pernah dialirkan. Tombol netral dari `ui/button`
          // adalah satu-satunya yang warnanya pasti benar tanpa variabel itu.
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => window.history.back()}
            className="h-12 w-full rounded-xl"
          >
            {PARTNER_REJECTED_COPY.backCta}
          </Button>
        ) : (
          !returnUrl && (
            <p className="text-xs text-muted-foreground">{PARTNER_REJECTED_COPY.noExitNote}</p>
          )
        )}
      </div>
    </main>
  );
}
