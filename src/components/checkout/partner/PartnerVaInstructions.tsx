"use client";

// Instruksi transfer VA — frame P03 (brand) / N03 (netral) di Figma.
//
// Tidak ada tombol utama di layar ini, dan itu disengaja di desain: yang harus dilakukan customer
// terjadi di aplikasi banknya, bukan di sini. Halaman cuma menyediakan dua angka yang wajib
// disalin persis dan memberi tahu bahwa ia akan memperbarui dirinya sendiri.
//
// "Cara bayar" adalah daftar bernomor yang selalu terbuka, bukan accordion. Pilihan desain, dan
// benar: langkahnya cuma tiga, dan menyembunyikannya di balik klik pada layar tempat orang sedang
// memegang ponsel banknya cuma menambah satu hambatan.

import { formatIDR } from "@/lib/utils";
import { formatSpacedCountdown } from "@/lib/partner/format";
import { BANK_BRAND } from "@/lib/constants";
import type { PartnerCopy } from "@/lib/partner/copy";
import type { MintOrderDetail } from "@/types";
import {
  PartnerCard,
  PartnerCountdown,
  PartnerCopyValue,
  PartnerDivider,
  PartnerGhostButton,
} from "./PartnerUi";

/** Kelompokkan digit per 4 supaya nomor VA gampang dibaca & dicek ulang dengan mata. */
function groupDigits(value: string): string {
  return value.replace(/(\d{4})(?=\d)/g, "$1 ");
}

interface PartnerVaInstructionsProps {
  order: MintOrderDetail;
  copy: PartnerCopy;
  secondsLeft: number;
  isPollBudgetSpent: boolean;
  onRefresh: () => void;
  onCopy: (text: string) => void;
}

export function PartnerVaInstructions({
  order,
  copy,
  secondsLeft,
  isPollBudgetSpent,
  onRefresh,
  onCopy,
}: PartnerVaInstructionsProps) {
  const bankBrand = order.paymentBank ? BANK_BRAND[order.paymentBank] : null;
  const total = Number(order.totalPayIdr);
  const hasTotal = order.totalPayIdr !== null && Number.isFinite(total);

  return (
    <>
      <PartnerCountdown
        label={copy.countdownLabel}
        value={formatSpacedCountdown(secondsLeft)}
      />

      <PartnerCard className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-base font-bold text-foreground">{copy.vaCardTitle}</span>
          {order.paymentBank && (
            // Chip logo bank: penanda bank CUSTOMER, bukan merek kami — jadi ia tetap tampil di
            // presentasi netral. Tile putih karena logo bank dirancang untuk latar terang.
            <span className="flex h-7 items-center justify-center rounded-md border border-border bg-white px-2">
              {bankBrand?.logo ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={bankBrand.logo}
                  alt={order.paymentBank}
                  className="max-h-4 w-auto object-contain"
                />
              ) : (
                // Warna literal DISENGAJA: platnya `bg-white` permanen di kedua tema (logo bank
                // dibuat untuk latar putih). Token teks akan berbalik jadi terang di tema gelap
                // dan lenyap di atas plat yang tidak ikut berbalik.
                <span className="text-xs font-bold text-[#1a1a1a]">{order.paymentBank}</span>
              )}
            </span>
          )}
        </div>

        <PartnerCopyValue
          label={copy.vaNumberLabel}
          value={order.virtualAccountNo ?? ""}
          display={order.virtualAccountNo ? groupDigits(order.virtualAccountNo) : "—"}
          copyLabel={copy.copyCta}
          onCopy={onCopy}
          mono
        />

        {hasTotal && (
          <>
            <PartnerDivider />
            <PartnerCopyValue
              label={copy.totalLabel}
              value={order.totalPayIdr!}
              display={formatIDR(total)}
              copyLabel={copy.copyCta}
              onCopy={onCopy}
              strong
            />
          </>
        )}
      </PartnerCard>

      <div className="flex flex-col gap-2 rounded-xl bg-muted p-4">
        <span className="text-sm font-semibold text-foreground">{copy.howToPayHeading}</span>
        <ol className="flex flex-col gap-1.5">
          {copy.howToPaySteps(order.paymentBank).map((step) => (
            <li key={step} className="text-xs leading-relaxed text-muted-foreground">
              {step}
            </li>
          ))}
        </ol>
      </div>

      {/* Anggaran polling habis: halaman berhenti bertanya sendiri dan menyerahkannya ke tombol.
          Tanpa ini, tab yang ditinggal terbuka semalaman terus memanggil backend sampai ditutup.
          Catatan "halaman memperbarui sendiri" di kaki halaman diganti catatan ini, karena mulai
          titik ini ia TIDAK lagi memperbarui sendiri — dan janji yang tak lagi benar lebih buruk
          daripada tombol. */}
      {isPollBudgetSpent && (
        <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
          <p className="text-xs leading-relaxed text-muted-foreground">{copy.pollStoppedNote}</p>
          <PartnerGhostButton onClick={onRefresh}>{copy.refreshStatusCta}</PartnerGhostButton>
        </div>
      )}
    </>
  );
}
