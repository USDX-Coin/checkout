"use client";

// Pemilih bank VA — frame P02 (brand) / N02 (netral) di Figma.
//
// Satu metode, tiga bank. Tidak ada pilihan channel sama sekali: customer partner tidak sedang
// memilih antara VA dan QRIS, ia cuma memilih mau transfer dari bank mana. Catatan desainnya
// menyebut alasannya tanpa basa-basi — "QRIS DIBUANG: adapter DurianPay SNAP menolak QRIS
// (VA-only, USDX-411)".
//
// Daftar banknya tetap datang dari backend (`channels[]`) dan disaring `partnerChannels`; kalau
// backend keliru menawarkan QRIS atau bank di luar tiga itu, ia tidak sampai ke sini.

import { Landmark } from "lucide-react";
import { BANK_BRAND } from "@/lib/constants";
import { formatIDR, cn } from "@/lib/utils";
import { formatSpacedCountdown } from "@/lib/partner/format";
import type { PartnerCopy } from "@/lib/partner/copy";
import type { MintChannelOption, VaBank } from "@/types";
import { PartnerBrandButton, PartnerCard, PartnerCountdown } from "./PartnerUi";

interface PartnerBankPickerProps {
  channels: MintChannelOption[];
  totalBeforePgFeeIdr: string;
  copy: PartnerCopy;
  secondsLeft: number;
  isPaying: boolean;
  payError: string | null;
  selected: VaBank | null;
  onSelect: (bank: VaBank) => void;
  onConfirm: () => void;
}

export function PartnerBankPicker({
  channels,
  totalBeforePgFeeIdr,
  copy,
  secondsLeft,
  isPaying,
  payError,
  selected,
  onSelect,
  onConfirm,
}: PartnerBankPickerProps) {
  const va = channels.find((c) => c.channel === "VA") ?? null;
  const banks = va?.banks ?? [];

  const pgFee =
    va && va.pgFeeIdr && Number.isFinite(Number(va.pgFeeIdr)) ? Number(va.pgFeeIdr) : null;
  const base = Number(totalBeforePgFeeIdr);
  const total = pgFee !== null && Number.isFinite(base) ? base + pgFee : null;

  return (
    <>
      <PartnerCountdown label={copy.countdownLabel} value={formatSpacedCountdown(secondsLeft)} />

      <p className="text-sm font-semibold text-foreground">{copy.chooseBankHeading}</p>

      <PartnerCard className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span
            style={{ backgroundColor: "var(--partner-brand)", color: "var(--partner-brand-text)" }}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-foreground/15"
          >
            <Landmark className="size-4" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold text-foreground">{copy.vaMethodLabel}</span>
            {pgFee !== null && (
              <span className="text-xs text-muted-foreground">biaya {formatIDR(pgFee)}</span>
            )}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {banks.map((bank) => {
            const brand = BANK_BRAND[bank];
            const active = selected === bank;
            return (
              <button
                key={bank}
                type="button"
                onClick={() => onSelect(bank)}
                aria-pressed={active}
                aria-label={bank}
                style={active ? { borderColor: "var(--partner-brand)" } : undefined}
                className={cn(
                  "flex h-14 items-center justify-center rounded-lg border-2 bg-white px-2 transition-colors",
                  active ? "" : "border-border hover:border-foreground/30",
                )}
              >
                {brand?.logo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={brand.logo}
                    alt={bank}
                    className="max-h-5 w-auto max-w-full object-contain"
                  />
                ) : (
                  <span className="text-xs font-bold text-[#1a1a1a]">{bank}</span>
                )}
              </button>
            );
          })}
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">{copy.bankListNote}</p>
      </PartnerCard>

      {total !== null && (
        <div className="flex items-baseline justify-between gap-3 px-1">
          <span className="text-sm text-muted-foreground">{copy.totalPlusFeeLabel}</span>
          <span className="text-xl font-bold text-foreground">{formatIDR(total)}</span>
        </div>
      )}

      {payError && (
        <p role="alert" className="text-sm text-destructive">
          {payError}
        </p>
      )}

      <div className="mt-auto pt-3">
        <PartnerBrandButton onClick={onConfirm} disabled={!selected || isPaying}>
          {isPaying ? "Memproses…" : copy.payNowCta}
        </PartnerBrandButton>
      </div>
    </>
  );
}
