"use client";

// Pemilih bank VA untuk halaman partner (USDX-548).
//
// TIGA bank, dan TIDAK ADA QRIS. Daftarnya disaring `partnerChannels` sebelum sampai ke sini,
// jadi backend yang keliru menawarkan QRIS (atau bank di luar Mandiri/BNI/BRI) tidak bisa
// memunculkan pilihan yang pasti gagal saat diklik. Logo bank di sini adalah penanda bank
// CUSTOMER — bukan merek kami — jadi ia tetap muncul di presentasi netral.
//
// Bedanya dengan pemilih di jalur aplikasi: di sini tidak ada pilihan channel sama sekali.
// Customer partner tidak sedang memilih antara VA dan QRIS; ia cuma memilih mau transfer dari
// bank mana.

import { BANK_BRAND } from "@/lib/constants";
import { formatIDR, cn } from "@/lib/utils";
import type { MintChannelOption, VaBank } from "@/types";
import { PartnerBrandButton } from "./PartnerUi";

interface PartnerBankPickerProps {
  channels: MintChannelOption[];
  totalBeforePgFeeIdr: string;
  heading: string;
  hint: string;
  amountLabel: string;
  isPaying: boolean;
  payError: string | null;
  selected: VaBank | null;
  onSelect: (bank: VaBank) => void;
  onConfirm: () => void;
}

export function PartnerBankPicker({
  channels,
  totalBeforePgFeeIdr,
  heading,
  hint,
  amountLabel,
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
  // Total hanya ditampilkan kalau kedua sukunya diketahui. Angka yang setengah diketahui lebih
  // buruk daripada tak ada angka: customer menghafal nominal yang salah lalu transfer segitu.
  const total = pgFee !== null && Number.isFinite(base) ? base + pgFee : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{heading}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
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
                "flex h-16 flex-col items-center justify-center gap-1.5 rounded-lg border bg-card p-2.5 transition-colors",
                active ? "ring-1" : "border-border hover:border-foreground/30",
              )}
            >
              {brand?.logo ? (
                <span className="flex h-9 w-full items-center justify-center rounded-md bg-white px-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={brand.logo}
                    alt={bank}
                    className="max-h-6 w-auto max-w-full object-contain"
                  />
                </span>
              ) : (
                <span className="text-xs font-semibold text-foreground">{bank}</span>
              )}
            </button>
          );
        })}
      </div>

      {total !== null && (
        <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
          <span className="font-medium text-foreground">{amountLabel}</span>
          <span className="font-semibold text-foreground">{formatIDR(total)}</span>
        </div>
      )}

      {payError && (
        <p role="alert" className="text-sm text-destructive">
          {payError}
        </p>
      )}

      <PartnerBrandButton onClick={onConfirm} disabled={!selected || isPaying}>
        {isPaying ? "Memproses…" : "Lanjut"}
      </PartnerBrandButton>
    </div>
  );
}
