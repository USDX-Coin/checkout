"use client";

// Halaman checkout jalur partner (USDX-548) — pemilih keadaan.
//
// Urutan cabangnya mengikuti "DI MANA UANGNYA", bukan urutan enum. Itu bukan gaya penulisan:
// `moneyIn` harus MENDAHULUI `isDead`, karena pesanan yang sudah dibayar lalu gagal tetap wajib
// memberi tahu bahwa uangnya diterima. Kalau tidak, orang yang sudah transfer melihat "waktu
// pembayaran habis" dan menyimpulkan uangnya hangus — atau lebih buruk, mentransfer lagi.
//
// Tidak ada satu pun `?theme=` / query string yang dibaca di sini. Presentasi datang dari sesi
// (kolom `theme` + `partner_branding`), yang datang dari server.

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePartnerCheckout } from "@/hooks/usePartnerCheckout";
import { partnerChannels } from "@/lib/partner/banks";
import { partnerCopy } from "@/lib/partner/copy";
import { safeReturnUrl } from "@/lib/partner/return-url";
import { hasHostedPage } from "@/lib/partner/types";
import { PARTNER_SESSION_REJECTED_MESSAGE } from "@/lib/api/partner";
import { formatIDR, formatWibDateTime } from "@/lib/utils";
import type { PartnerCheckoutSession } from "@/lib/partner/types";
import type { VaBank } from "@/types";
import { PartnerShell } from "./PartnerShell";
import { PartnerCard, PartnerGhostButton } from "./PartnerUi";
import { PartnerBankPicker } from "./PartnerBankPicker";
import { PartnerVaInstructions } from "./PartnerVaInstructions";
import { PartnerStatusScreen } from "./PartnerStatusScreen";

export function PartnerCheckout({ session }: { session: PartnerCheckoutSession }) {
  // Model `VA` tidak punya halaman: nomor VA-nya dikembalikan lewat API ke partner. Kalau sesi
  // bermodel VA sampai punya tautan, itu keadaan yang tak seharusnya ada — dan jawabannya bukan
  // menebak presentasi mana yang dimaksud.
  const presentation = hasHostedPage(session.model) ? session.model : null;

  const branding = session.branding;
  const copy = useMemo(
    () => partnerCopy(presentation ?? "NEUTRAL", branding?.displayName),
    [presentation, branding?.displayName],
  );

  const allowed = branding?.allowedReturnOrigins;
  const returnUrl = safeReturnUrl(session.returnUrl, allowed);
  const cancelUrl = safeReturnUrl(session.cancelUrl, allowed);
  // Jalan keluar terbaik yang tersedia. `null` = tidak ada URL terdaftar yang cocok, jadi tidak
  // ada tombol — bukan "pakai apa adanya".
  const exitUrl = returnUrl ?? cancelUrl;

  const state = usePartnerCheckout(presentation ? session : null);
  const { order } = state;

  const [bank, setBank] = useState<VaBank | null>(null);

  // Judul tab + favicon ikut presentasi. Judul bawaan layout ("USDX Checkout") adalah nama kami
  // yang terbaca di tab, jadi presentasi netral wajib menimpanya — pemeriksaan "nol kemunculan
  // USDX di halaman ter-render" mencakup `document.title`.
  useEffect(() => {
    document.title = copy.documentTitle;
  }, [copy.documentTitle]);

  useEffect(() => {
    if (presentation !== "NEUTRAL" || !branding?.faviconUrl) return;
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = branding.faviconUrl;
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, [presentation, branding?.faviconUrl]);

  function copyText(text: string) {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    toast.success("Disalin");
  }

  if (!presentation) {
    return (
      <PartnerShell presentation="NEUTRAL" branding={null}>
        <PartnerCard>
          <p className="py-6 text-center text-sm text-muted-foreground">
            {PARTNER_SESSION_REJECTED_MESSAGE}
          </p>
        </PartnerCard>
      </PartnerShell>
    );
  }

  const body = (() => {
    if (state.isLoading) {
      return (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> Memuat pembayaran…
        </div>
      );
    }

    // Tautan tak berlaku / sesi habis. Satu pesan untuk semua sebab (lihat
    // `PARTNER_SESSION_REJECTED_MESSAGE`).
    if (state.isSessionInvalid) {
      return (
        <PartnerStatusScreen
          tone="failure"
          heading="Tautan tidak berlaku"
          body={PARTNER_SESSION_REJECTED_MESSAGE}
          returnUrl={exitUrl}
          returnCta={copy.returnCta}
          noReturnUrlNote={copy.noReturnUrlNote}
        />
      );
    }

    // Gagal memuat karena hal lain (jaringan, 5xx). Beda dari sesi tak berlaku: yang ini pantas
    // dicoba lagi, dan menyebutnya "tautan tidak berlaku" akan menyuruh customer membuang
    // tautan yang sebenarnya masih sah.
    if (state.isError || !order) {
      return (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Gagal memuat pembayaran. Periksa koneksi lalu coba lagi.
          </p>
          <PartnerGhostButton onClick={state.refresh}>{copy.refreshCta}</PartnerGhostButton>
        </div>
      );
    }

    const moneyIn = order.paymentStatus === "PAID" || order.paymentStatus === "HELD";
    const amount =
      order.totalPayIdr !== null && Number.isFinite(Number(order.totalPayIdr))
        ? formatIDR(Number(order.totalPayIdr))
        : null;
    const paidAt = formatWibDateTime(order.paidAt);
    const paidDetail = (
      <>
        {amount && <p className="text-lg font-semibold text-foreground">{amount}</p>}
        {paidAt && <p className="text-xs text-muted-foreground">{paidAt}</p>}
      </>
    );

    // Transfer masuk tapi tak cocok otomatis — populasi paling rawan transfer dua kali, jadi
    // tagihannya WAJIB hilang dari layar.
    if (order.paymentStatus === "HELD") {
      return (
        <PartnerStatusScreen
          tone="review"
          heading={copy.heldHeading}
          body={copy.heldBody}
          returnUrl={exitUrl}
          returnCta={copy.returnCta}
          noReturnUrlNote={copy.noReturnUrlNote}
        >
          {paidDetail}
        </PartnerStatusScreen>
      );
    }

    if (order.status === "COMPLETED") {
      return (
        <PartnerStatusScreen
          tone="success"
          heading={copy.completedHeading}
          body={copy.completedBody}
          returnUrl={exitUrl}
          returnCta={copy.returnCta}
          noReturnUrlNote={copy.noReturnUrlNote}
        >
          {paidDetail}
        </PartnerStatusScreen>
      );
    }

    if (moneyIn && order.status === "FAILED") {
      return (
        <PartnerStatusScreen
          tone="review"
          heading={copy.paidButFailedHeading}
          body={copy.paidButFailedBody}
          returnUrl={exitUrl}
          returnCta={copy.returnCta}
          noReturnUrlNote={copy.noReturnUrlNote}
        >
          {paidDetail}
        </PartnerStatusScreen>
      );
    }

    // INI inti tiketnya: `WAITING_FOR_APPROVAL` (uang masuk, menunggu multisig) mendarat di
    // sini — konfirmasi + tombol pulang, bukan layar tunggu tanpa akhir.
    if (moneyIn) {
      return (
        <PartnerStatusScreen
          tone="success"
          heading={copy.paidHeading}
          body={copy.paidBody}
          returnUrl={exitUrl}
          returnCta={copy.returnCta}
          noReturnUrlNote={copy.noReturnUrlNote}
        >
          {paidDetail}
        </PartnerStatusScreen>
      );
    }

    if (order.status === "FAILED") {
      return (
        <PartnerStatusScreen
          tone="failure"
          heading={copy.failedHeading}
          body={copy.failedBody}
          returnUrl={exitUrl}
          returnCta={copy.returnCta}
          noReturnUrlNote={copy.noReturnUrlNote}
        />
      );
    }

    if (order.paymentStatus === "EXPIRED" || state.secondsLeft <= 0) {
      return (
        <PartnerStatusScreen
          tone="failure"
          heading={copy.expiredHeading}
          body={copy.expiredBody}
          returnUrl={exitUrl}
          returnCta={copy.returnCta}
          noReturnUrlNote={copy.noReturnUrlNote}
        />
      );
    }

    if (order.paymentStatus === "REQUESTED") {
      const channels = partnerChannels(order.channels);
      if (channels.length === 0) {
        return (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Metode pembayaran belum tersedia. Coba beberapa saat lagi.
            </p>
            <PartnerGhostButton onClick={state.refresh}>{copy.refreshCta}</PartnerGhostButton>
          </div>
        );
      }
      return (
        <PartnerBankPicker
          channels={channels}
          totalBeforePgFeeIdr={order.totalBeforePgFeeIdr}
          heading={copy.chooseBankHeading}
          hint={copy.chooseBankHint}
          amountLabel={copy.amountLabel}
          isPaying={state.isPaying}
          payError={state.payError}
          selected={bank}
          onSelect={setBank}
          onConfirm={() => {
            if (bank) state.pay(bank).catch(() => {});
          }}
        />
      );
    }

    return (
      <PartnerVaInstructions
        order={order}
        copy={copy}
        secondsLeft={state.secondsLeft}
        showCountdown
        isPollBudgetSpent={state.isPollBudgetSpent}
        onRefresh={state.refresh}
        onCopy={copyText}
      />
    );
  })();

  return (
    <PartnerShell presentation={presentation} branding={branding}>
      <PartnerCard>
        <h1 className="text-base font-medium text-foreground">{copy.payHeading}</h1>
        {body}
      </PartnerCard>
    </PartnerShell>
  );
}
