"use client";

// Ringkasan pesanan — frame P01 (brand) / N01 (netral) di Figma.
//
// Layar pertama yang dilihat customer partner, dan satu-satunya tempat ia bisa memeriksa APA yang
// dibeli sebelum menyerahkan uang: kurs yang dikunci, rincian biaya, jumlah aset yang diterima,
// dan alamat tujuannya. Desain menaruh semuanya di sini dengan sengaja — layar berikutnya cuma
// soal mekanisme transfer.
//
// Catatan penting tentang tafsir "netral": frame N01 di desain MENAMPILKAN ticker aset
// ("60,606060 USDX"), penyebut kurs ("/ USDX"), dan baris pemroses di kaki halaman. Jadi netral
// berarti tanpa KOIN dan LOCKUP USDX serta memakai warna partner — bukan menyensor nama asetnya.
// Menyembunyikan aset yang dibeli pada layar tempat orang menyetujui transfer yang tak bisa
// dibatalkan justru kebalikan dari transparan.

import { ChevronRight, Lock, Wallet } from "lucide-react";
import { formatIDR } from "@/lib/utils";
import { formatDestination, formatRateIdr, formatUsdxAmount, formatSpacedCountdown } from "@/lib/partner/format";
import type { PartnerCopy } from "@/lib/partner/copy";
import type { MintOrderDetail } from "@/types";
import {
  PartnerBanner,
  PartnerBrandButton,
  PartnerCard,
  PartnerDivider,
  PartnerRow,
} from "./PartnerUi";

interface PartnerOrderSummaryProps {
  order: MintOrderDetail;
  copy: PartnerCopy;
  /** Biaya virtual account (dari `channels[]`), atau `null` kalau belum diketahui. */
  vaFeeIdr: number | null;
  secondsLeft: number;
  onContinue: () => void;
}

export function PartnerOrderSummary({
  order,
  copy,
  vaFeeIdr,
  secondsLeft,
  onContinue,
}: PartnerOrderSummaryProps) {
  const rate = formatRateIdr(order.effectiveRate);
  const usdxAmount = formatUsdxAmount(order.amount);
  const destination = formatDestination(order.userAddress, order.chain);

  const subtotal = Number(order.subtotalIdr);
  const mintFee = Number(order.mintFeeIdr);
  const base = Number(order.totalBeforePgFeeIdr);

  // Total ditentukan SERVER kalau ia sudah mengirimnya; kalau belum (metode belum dipilih), ia
  // dihitung dari total-sebelum-biaya-PG + biaya VA yang ditawarkan. Kalau biaya VA pun belum
  // diketahui, barisnya TIDAK ditampilkan — angka yang setengah diketahui lebih buruk daripada
  // tak ada angka, karena customer menghafal nominal yang salah lalu mentransfer segitu.
  const serverTotal = order.totalPayIdr !== null ? Number(order.totalPayIdr) : null;
  const total =
    serverTotal !== null && Number.isFinite(serverTotal)
      ? serverTotal
      : vaFeeIdr !== null && Number.isFinite(base)
        ? base + vaFeeIdr
        : null;

  return (
    <>
      {rate && (
        <PartnerCard className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-xs text-muted-foreground">{copy.rateLockedLabel}</span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-foreground">{rate}</span>
              <span className="text-xs text-muted-foreground">{copy.rateUnit}</span>
            </span>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <Lock
              className="size-4"
              style={{ color: "var(--partner-accent-text)" }}
              aria-hidden="true"
            />
            <span
              style={{ color: "var(--partner-accent-text)" }}
              className="text-xs font-bold tabular-nums"
            >
              {formatSpacedCountdown(secondsLeft).replace(/ /g, "")}
            </span>
          </div>
        </PartnerCard>
      )}

      <PartnerCard>
        <PartnerRow label={copy.orderNoLabel}>{order.orderNumber}</PartnerRow>
        {usdxAmount && (
          <PartnerRow label={copy.youReceiveLabel}>{usdxAmount} USDX</PartnerRow>
        )}

        <PartnerDivider />

        {Number.isFinite(subtotal) && (
          <PartnerRow label={copy.subtotalLabel}>{formatIDR(subtotal)}</PartnerRow>
        )}
        {Number.isFinite(mintFee) && (
          <PartnerRow label={copy.mintFeeLabel}>{formatIDR(mintFee)}</PartnerRow>
        )}
        {vaFeeIdr !== null && (
          <PartnerRow label={copy.vaFeeLabel}>{formatIDR(vaFeeIdr)}</PartnerRow>
        )}

        {total !== null && (
          <>
            <PartnerDivider />
            <PartnerRow label={copy.totalLabel} strong>
              {formatIDR(total)}
            </PartnerRow>
          </>
        )}
      </PartnerCard>

      {destination && (
        <PartnerCard className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Wallet className="size-4" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold text-foreground">{copy.walletLabel}</span>
            <span className="truncate text-xs text-muted-foreground">{destination}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </PartnerCard>
      )}

      {/* Peringatan tak-bisa-dibatalkan: satu-satunya hal di layar ini yang benar-benar tak bisa
          diperbaiki setelah ditekan. Desain memberinya warna penuh, bukan teks kecil. */}
      <PartnerBanner tone="warning" icon="warning">
        {copy.irreversibleWarning}
      </PartnerBanner>

      <div className="mt-auto pt-3">
        <PartnerBrandButton onClick={onContinue}>{copy.continueCta}</PartnerBrandButton>
      </div>
    </>
  );
}
