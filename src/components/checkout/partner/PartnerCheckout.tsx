"use client";

// Halaman checkout jalur partner (USDX-548) — pemilih keadaan.
//
// Alurnya mengikuti Figma: ringkasan pesanan (P01/N01) → pilih bank (P02/N02) → instruksi VA
// (P03/N03) → hasil (P04–P08 / N04–N08). Baris "SEKARANG" di Figma adalah clone lama dan bukan
// acuan; yang diikuti baris REDESAIN.
//
// Urutan cabangnya mengikuti "DI MANA UANGNYA", bukan urutan enum. Itu bukan gaya penulisan:
// uang-sudah-masuk harus MENDAHULUI order-mati, karena pesanan yang sudah dibayar lalu gagal
// tetap wajib memberi tahu bahwa uangnya diterima. Kalau tidak, orang yang sudah transfer
// melihat "waktu pembayaran habis" dan menyimpulkan uangnya hangus — atau mentransfer lagi.
//
// Tidak ada satu pun `?theme=` / query string yang dibaca di sini. Presentasi datang dari sesi
// (kolom `theme` + `partner_branding`), yang datang dari server.

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePartnerCheckout } from "@/hooks/usePartnerCheckout";
import { partnerChannels } from "@/lib/partner/banks";
import { PROCESSOR_DISCLOSURE, partnerCopy } from "@/lib/partner/copy";
import { safeReturnUrl } from "@/lib/partner/return-url";
import { hasHostedPage } from "@/lib/partner/types";
import { PARTNER_SESSION_REJECTED_MESSAGE } from "@/lib/api/partner";
import { formatIDR } from "@/lib/utils";
import {
  formatDestination,
  formatSpacedCountdown,
  formatUsdxAmount,
  formatWibTime,
} from "@/lib/partner/format";
import type { PartnerCheckoutSession } from "@/lib/partner/types";
import type { VaBank } from "@/types";
import { PartnerShell } from "./PartnerShell";
import {
  PartnerBanner,
  PartnerCard,
  PartnerCountdown,
  PartnerDivider,
  PartnerGhostButton,
  PartnerRow,
  PartnerStatusPill,
} from "./PartnerUi";
import { PartnerOrderSummary } from "./PartnerOrderSummary";
import { PartnerBankPicker } from "./PartnerBankPicker";
import { PartnerVaInstructions } from "./PartnerVaInstructions";
import { PartnerProgressStepper, type StepperStep } from "./PartnerProgressStepper";
import { PartnerStatusScreen } from "./PartnerStatusScreen";

export function PartnerCheckout({ session }: { session: PartnerCheckoutSession }) {
  // Model `VA` tidak punya halaman: nomor VA-nya dikembalikan lewat API ke partner. Sesi bermodel
  // VA yang punya tautan adalah keadaan yang tak seharusnya ada — dan jawabannya bukan menebak
  // presentasi mana yang dimaksud.
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
  // Desain memisahkan ringkasan pesanan dari pemilihan bank. Keduanya hidup saat backend masih
  // `REQUESTED`, jadi langkahnya disimpan di klien.
  const [step, setStep] = useState<"summary" | "bank">("summary");

  // Judul tab ikut presentasi. Judul bawaan layout ("USDX Checkout") adalah nama kami yang
  // terbaca di tab; rute partner sudah mengekspor metadata netral, dan ini menyempurnakannya
  // setelah nama partner diketahui.
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
      <PartnerShell presentation="NEUTRAL" branding={null} title={copy.title}>
        <PartnerCard>
          <p className="py-6 text-center text-sm text-muted-foreground">
            {PARTNER_SESSION_REJECTED_MESSAGE}
          </p>
        </PartnerCard>
      </PartnerShell>
    );
  }

  const shell = (
    body: React.ReactNode,
    opts: { footer?: React.ReactNode; partnerLine?: string | null; onBack?: (() => void) | null } = {},
  ) => (
    <PartnerShell
      presentation={presentation}
      branding={branding}
      title={copy.title}
      partnerLine={opts.partnerLine ?? null}
      onBack={opts.onBack ?? null}
      footer={opts.footer}
    >
      {body}
    </PartnerShell>
  );

  if (state.isLoading) {
    return shell(
      <div className="flex flex-1 items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin" /> {copy.loadingLabel}
      </div>,
    );
  }

  // Tautan tak berlaku / sesi habis. Satu pesan untuk semua sebab.
  if (state.isSessionInvalid) {
    return shell(
      <PartnerStatusScreen
        tone="failure"
        heading={copy.rejectedHeading}
        subtitle={PARTNER_SESSION_REJECTED_MESSAGE}
        returnUrl={exitUrl}
        returnCta={copy.returnCta}
        noReturnUrlNote={copy.noReturnUrlNote}
      />,
    );
  }

  // P08 · Gagal muat — dibedakan dari "pesanan tidak ditemukan": yang ini pantas dicoba lagi, dan
  // menyebutnya "tautan tidak berlaku" akan menyuruh customer membuang tautan yang masih sah.
  if (state.isError || !order) {
    return shell(
      <PartnerStatusScreen
        tone="failure"
        heading={copy.loadFailedHeading}
        subtitle={copy.loadFailedBody}
        returnUrl={exitUrl}
        returnCta={copy.returnCta}
        noReturnUrlNote={copy.noReturnUrlNote}
        primaryAction={{ label: copy.retryCta, onClick: state.refresh }}
      >
        <PartnerBanner tone="muted">{copy.loadFailedReassurance}</PartnerBanner>
      </PartnerStatusScreen>,
    );
  }

  const moneyIn = order.paymentStatus === "PAID" || order.paymentStatus === "HELD";
  const usdxAmount = formatUsdxAmount(order.amount);
  const destination = formatDestination(order.userAddress, order.chain);
  const totalPaid =
    order.totalPayIdr !== null && Number.isFinite(Number(order.totalPayIdr))
      ? formatIDR(Number(order.totalPayIdr))
      : null;

  const orderRows = (
    <PartnerCard>
      <PartnerRow label={copy.orderNoLabel}>{order.orderNumber}</PartnerRow>
      {usdxAmount && <PartnerRow label={copy.youReceiveLabel}>{usdxAmount} USDX</PartnerRow>}
    </PartnerCard>
  );

  const destinationCard = destination ? (
    <PartnerCard>
      <PartnerRow label={copy.destinationLabel}>
        <span className="font-mono text-xs">{destination}</span>
      </PartnerRow>
    </PartnerCard>
  ) : null;

  // ── HELD · transfer masuk tapi tak cocok otomatis ──────────────────────────────────────────
  // Populasi paling rawan transfer dua kali, jadi tagihannya WAJIB hilang dari layar.
  if (order.paymentStatus === "HELD") {
    return shell(
      <PartnerStatusScreen
        tone="review"
        heading="Pembayaran sedang ditinjau"
        amount={totalPaid}
        subtitle={`Transfer kamu sudah masuk tapi belum cocok otomatis dengan pesanan ini, dan sedang diperiksa. Jangan transfer lagi — hubungi ${branding?.displayName?.trim() || "penyedia layanan kamu"}.`}
        returnUrl={exitUrl}
        returnCta={copy.returnCta}
        noReturnUrlNote={copy.noReturnUrlNote}
      >
        {orderRows}
      </PartnerStatusScreen>,
    );
  }

  // ── P05/N05 · Selesai ──────────────────────────────────────────────────────────────────────
  if (order.status === "COMPLETED") {
    return shell(
      <PartnerStatusScreen
        tone="success"
        heading={copy.successHeading}
        amount={usdxAmount ? `${usdxAmount} USDX` : null}
        subtitle={copy.successSubtitle}
        returnUrl={exitUrl}
        returnCta={copy.returnCta}
        noReturnUrlNote={copy.noReturnUrlNote}
      >
        <PartnerCard>
          {destination && (
            <PartnerRow label={copy.creditedToLabel}>
              <span className="font-mono text-xs">{destination}</span>
            </PartnerRow>
          )}
          <PartnerRow label={copy.orderNoLabel}>{order.orderNumber}</PartnerRow>
          {totalPaid && <PartnerRow label={copy.totalPaidLabel}>{totalPaid}</PartnerRow>}
          {order.onChainTxHash && (
            <PartnerRow label={copy.onChainProofLabel}>
              <span className="font-mono text-xs">
                {order.onChainTxHash.slice(0, 6)}…{order.onChainTxHash.slice(-4)}
              </span>
            </PartnerRow>
          )}
        </PartnerCard>
      </PartnerStatusScreen>,
    );
  }

  // ── P07/N07 · Gagal ────────────────────────────────────────────────────────────────────────
  if (order.status === "FAILED") {
    return shell(
      <PartnerStatusScreen
        tone={moneyIn ? "review" : "failure"}
        heading={copy.failedHeading}
        subtitle={moneyIn ? copy.failedBody : copy.failedNoPaymentBody}
        returnUrl={exitUrl}
        returnCta={copy.returnCta}
        noReturnUrlNote={copy.noReturnUrlNote}
      >
        <PartnerCard>
          <PartnerRow label={copy.orderNoLabel}>{order.orderNumber}</PartnerRow>
          {moneyIn && totalPaid && (
            <PartnerRow label={copy.valueLabel}>{totalPaid}</PartnerRow>
          )}
          <PartnerRow label={copy.statusLabel}>
            <PartnerStatusPill tone="error">FAILED</PartnerStatusPill>
          </PartnerRow>
        </PartnerCard>
        <PartnerBanner tone="muted">{copy.failedHelpNote}</PartnerBanner>
      </PartnerStatusScreen>,
    );
  }

  // ── P04/N04 · Pembayaran diterima, menunggu persetujuan ────────────────────────────────────
  // INI inti tiketnya. `WAITING_FOR_APPROVAL` mendarat di sini — konfirmasi + jalan pulang,
  // bukan layar tunggu tanpa akhir.
  if (moneyIn) {
    const paidTime = formatWibTime(order.paidAt) ?? "";
    const steps: StepperStep[] = [
      {
        label: copy.stepPaymentLabel,
        detail: totalPaid ? copy.stepPaymentDetail(totalPaid, paidTime) : null,
        state: "done",
      },
      { label: copy.stepOnChainLabel, detail: copy.stepOnChainDetail, state: "active" },
      { label: copy.stepDoneLabel, state: "idle" },
    ];

    return shell(
      <PartnerStatusScreen
        tone="success"
        heading={copy.paidBanner}
        returnUrl={exitUrl}
        returnCta={copy.returnCta}
        noReturnUrlNote={copy.noReturnUrlNote}
      >
        <PartnerCard>
          <span className="text-xs text-muted-foreground">{copy.awaitingDeliveryLabel}</span>
          <p className="text-2xl font-bold text-foreground">
            {usdxAmount ? `${usdxAmount} USDX` : "—"}
          </p>
        </PartnerCard>

        <PartnerProgressStepper steps={steps} label={copy.stepperLabel} />

        {orderRows}
        {destinationCard}

        <PartnerBanner tone="muted">{copy.approvalNote}</PartnerBanner>
      </PartnerStatusScreen>,
      { footer: copy.noWaitingNote },
    );
  }

  // ── P06/N06 · Kedaluwarsa ──────────────────────────────────────────────────────────────────
  if (order.paymentStatus === "EXPIRED" || state.secondsLeft <= 0) {
    return shell(
      <PartnerStatusScreen
        tone="failure"
        heading={copy.expiredHeading}
        subtitle={copy.expiredBody}
        returnUrl={exitUrl}
        returnCta={copy.returnCta}
        noReturnUrlNote={copy.noReturnUrlNote}
      >
        <PartnerCountdown label={copy.expiredBanner} value={formatSpacedCountdown(0)} expired />
        <PartnerCard>
          {order.virtualAccountNo && (
            <>
              <PartnerRow label={copy.expiredVaLabel}>
                <span className="font-mono text-xs line-through">{order.virtualAccountNo}</span>
              </PartnerRow>
              <PartnerDivider />
            </>
          )}
          <PartnerRow label={copy.orderNoLabel}>{order.orderNumber}</PartnerRow>
          {totalPaid && <PartnerRow label={copy.valueLabel}>{totalPaid}</PartnerRow>}
          <PartnerRow label={copy.statusLabel}>
            <PartnerStatusPill tone="error">EXPIRED</PartnerStatusPill>
          </PartnerRow>
        </PartnerCard>
      </PartnerStatusScreen>,
    );
  }

  // ── P01/N01 + P02/N02 · Sebelum bayar ──────────────────────────────────────────────────────
  if (order.paymentStatus === "REQUESTED") {
    const channels = partnerChannels(order.channels);
    const vaFee =
      channels[0]?.pgFeeIdr && Number.isFinite(Number(channels[0].pgFeeIdr))
        ? Number(channels[0].pgFeeIdr)
        : null;

    if (step === "summary") {
      return shell(
        <PartnerOrderSummary
          order={order}
          copy={copy}
          vaFeeIdr={vaFee}
          secondsLeft={state.secondsLeft}
          onContinue={() => setStep("bank")}
        />,
        { partnerLine: copy.partnerLine, footer: PROCESSOR_DISCLOSURE },
      );
    }

    if (channels.length === 0) {
      return shell(
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">{copy.methodUnavailable}</p>
          <PartnerGhostButton onClick={state.refresh}>{copy.refreshStatusCta}</PartnerGhostButton>
        </div>,
        { onBack: () => setStep("summary") },
      );
    }

    return shell(
      <PartnerBankPicker
        channels={channels}
        totalBeforePgFeeIdr={order.totalBeforePgFeeIdr}
        copy={copy}
        secondsLeft={state.secondsLeft}
        isPaying={state.isPaying}
        payError={state.payError}
        selected={bank}
        onSelect={setBank}
        onConfirm={() => {
          if (bank) state.pay(bank).catch(() => {});
        }}
      />,
      { onBack: () => setStep("summary") },
    );
  }

  // ── P03/N03 · Instruksi bayar ──────────────────────────────────────────────────────────────
  return shell(
    <PartnerVaInstructions
      order={order}
      copy={copy}
      secondsLeft={state.secondsLeft}
      isPollBudgetSpent={state.isPollBudgetSpent}
      onRefresh={state.refresh}
      onCopy={copyText}
    />,
    // Janji "halaman memperbarui sendiri" hanya benar selama polling masih jalan. Setelah
    // anggarannya habis, catatan itu diganti — janji yang tak lagi benar lebih buruk daripada
    // tidak ada janji.
    { footer: state.isPollBudgetSpent ? null : copy.selfUpdatingNote },
  );
}
