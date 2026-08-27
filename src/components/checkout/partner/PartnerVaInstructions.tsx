"use client";

// Instruksi transfer VA untuk halaman partner (USDX-548).
//
// Sengaja HANYA soal membayar: nominal, nomor VA, bank, dan cara transfernya. Tidak ada jumlah
// token, tidak ada alamat wallet, tidak ada rantai, tidak ada rincian biaya internal — customer
// partner sedang menyelesaikan pembayaran, bukan mengoperasikan produk kripto, dan sebagian
// besar dari data itu bahkan bukan miliknya (wallet tujuannya bisa milik partner).
//
// Konsekuensi bagusnya: presentasi netral tidak perlu "menyensor" apa pun: yang tidak dirender
// tidak bisa bocor.

import { formatIDR, formatCountdown } from "@/lib/utils";
import { BANK_BRAND } from "@/lib/constants";
import type { MintOrderDetail } from "@/types";
import type { PartnerCopy } from "@/lib/partner/copy";
import { PartnerAccordion, PartnerCopyField, PartnerGhostButton, PartnerRow } from "./PartnerUi";

// Kelompokkan digit per 4 supaya nomor VA gampang dibaca & disalin ulang dengan mata.
function groupDigits(value: string): string {
  return value.replace(/(\d{4})(?=\d)/g, "$1 ");
}

interface PartnerVaInstructionsProps {
  order: MintOrderDetail;
  copy: PartnerCopy;
  secondsLeft: number;
  showCountdown: boolean;
  isPollBudgetSpent: boolean;
  onRefresh: () => void;
  onCopy: (text: string) => void;
}

export function PartnerVaInstructions({
  order,
  copy,
  secondsLeft,
  showCountdown,
  isPollBudgetSpent,
  onRefresh,
  onCopy,
}: PartnerVaInstructionsProps) {
  const bankBrand = order.paymentBank ? BANK_BRAND[order.paymentBank] : null;
  const total = Number(order.totalPayIdr);
  const hasTotal = order.totalPayIdr !== null && Number.isFinite(total);

  return (
    <div className="flex flex-col gap-4">
      {showCountdown && (
        <div className="rounded-lg bg-muted px-4 py-2.5 text-center text-sm text-foreground">
          {copy.countdownPrefix}{" "}
          <span className="font-semibold tabular-nums">{formatCountdown(secondsLeft)}</span>
        </div>
      )}

      {order.paymentBank && (
        <PartnerRow label="Bank">
          {bankBrand?.logo ? (
            <span className="flex h-6 items-center justify-center rounded bg-white px-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bankBrand.logo}
                alt={order.paymentBank}
                className="max-h-4 w-auto object-contain"
              />
            </span>
          ) : (
            order.paymentBank
          )}
        </PartnerRow>
      )}

      <PartnerCopyField
        label={copy.vaNumberLabel}
        value={order.virtualAccountNo ?? ""}
        display={order.virtualAccountNo ? groupDigits(order.virtualAccountNo) : "—"}
        onCopy={onCopy}
        mono
      />

      {hasTotal && (
        <div className="flex flex-col gap-1.5">
          <PartnerCopyField
            label={copy.amountLabel}
            value={order.totalPayIdr!}
            display={formatIDR(total)}
            onCopy={onCopy}
          />
          <p className="text-xs text-warning">
            Transfer nominal <span className="font-semibold">persis</span> seperti di atas.
            Kurang atau lebih akan membuat pembayaran ditahan untuk ditinjau.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">{copy.howToPayHeading}</p>
        <PartnerAccordion title="Transfer dari bank lain (antar bank)">
          <ol className="list-decimal space-y-1 pl-4">
            <li>Pilih menu Transfer → Antar Bank / Virtual Account.</li>
            <li>Masukkan nomor Virtual Account di atas.</li>
            <li>Pastikan nominalnya sama, lalu konfirmasi.</li>
          </ol>
        </PartnerAccordion>
        <PartnerAccordion title="ATM / Mobile Banking">
          <ol className="list-decimal space-y-1 pl-4">
            <li>Pilih menu Bayar / Pembelian → Virtual Account.</li>
            <li>Masukkan nomor Virtual Account, cek nominalnya, lalu konfirmasi.</li>
          </ol>
        </PartnerAccordion>
      </div>

      {/* Anggaran polling habis: halaman berhenti bertanya sendiri dan menyerahkannya ke
          tombol. Tanpa ini, tab yang ditinggal terbuka semalaman akan terus memanggil backend
          sampai tabnya ditutup. */}
      {isPollBudgetSpent && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">{copy.pollStoppedNote}</p>
          <PartnerGhostButton onClick={onRefresh}>{copy.refreshCta}</PartnerGhostButton>
        </div>
      )}
    </div>
  );
}
