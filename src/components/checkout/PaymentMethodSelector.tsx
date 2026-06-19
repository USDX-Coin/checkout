"use client";

// Pemilih metode pembayaran checkout (USDX-224, port USDX-202): VA (9 bank) / QRIS dengan
// "Biaya layanan" (pgFeeIdr) per metode + grand total. VA wajib pilih bank dulu. Konfirmasi
// → POST /v2/mint/{id}/pay. pgFee bisa "—" saat tak diketahui (refresh tanpa channels[]).
// Tiap channel/bank dirender sebagai chip ber-brand agar mudah dipindai.

import { useState } from "react";
import { Landmark, QrCode } from "lucide-react";
import type { MintChannelOption, PaymentChannel, VaBank } from "@/types";
import { BANK_BRAND, QRIS_RED } from "@/lib/constants";
import { formatIDR, cn } from "@/lib/utils";

function feeLabel(pgFeeIdr: string): string {
  if (!pgFeeIdr) return "—";
  const n = Number(pgFeeIdr);
  return Number.isFinite(n) ? formatIDR(n) : "—";
}

// Badge brand + subjudul untuk header tiap channel.
function channelMeta(channel: PaymentChannel) {
  return channel === "QRIS"
    ? { Icon: QrCode, badgeBg: QRIS_RED, subtitle: "Bayar dengan scan QR" }
    : { Icon: Landmark, badgeBg: "#1f2a44", subtitle: "Transfer ke nomor Virtual Account" };
}

interface PaymentMethodSelectorProps {
  channels: MintChannelOption[];
  totalBeforePgFeeIdr: string;
  isPaying: boolean;
  payError: string | null;
  onPay: (channel: PaymentChannel, bank: VaBank | null) => void;
  onCancel: () => void;
}

export function PaymentMethodSelector({
  channels,
  totalBeforePgFeeIdr,
  isPaying,
  payError,
  onPay,
  onCancel,
}: PaymentMethodSelectorProps) {
  const [channel, setChannel] = useState<PaymentChannel | null>(null);
  const [bank, setBank] = useState<VaBank | null>(null);

  const selected = channels.find((c) => c.channel === channel) ?? null;
  const needsBank = channel === "VA" && !bank;
  const pgFeeNum =
    selected && selected.pgFeeIdr && Number.isFinite(Number(selected.pgFeeIdr))
      ? Number(selected.pgFeeIdr)
      : null;
  const grandTotal = pgFeeNum != null ? Number(totalBeforePgFeeIdr) + pgFeeNum : null;
  const canPay = channel !== null && !needsBank && !isPaying;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-foreground">Pilih metode pembayaran</p>

      <div className="flex flex-col gap-2.5">
        {channels.map((opt) => {
          const active = channel === opt.channel;
          const { Icon, badgeBg, subtitle } = channelMeta(opt.channel);
          return (
            <div
              key={opt.channel}
              className={cn(
                "overflow-hidden rounded-xl border transition-colors",
                active ? "border-primary bg-primary/[0.03]" : "border-border",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  setChannel(opt.channel);
                  setBank(null);
                }}
                className="flex w-full items-center gap-3 p-3 text-left"
              >
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: badgeBg }}
                >
                  <Icon className="size-5 text-white" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-semibold text-foreground">
                    {opt.channel === "VA" ? "Virtual Account" : "QRIS"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
                </span>
                <span className="ml-auto shrink-0 text-right">
                  <span className="block text-[11px] text-muted-foreground">Biaya layanan</span>
                  <span className="block text-xs font-medium text-foreground">
                    {feeLabel(opt.pgFeeIdr)}
                  </span>
                </span>
              </button>

              {active && opt.channel === "VA" && opt.banks && (
                <div className="grid grid-cols-3 gap-2 border-t border-border bg-muted/40 p-3">
                  {opt.banks.map((b) => {
                    const brand = BANK_BRAND[b];
                    const isSel = bank === b;
                    return (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setBank(b)}
                        aria-pressed={isSel}
                        aria-label={b}
                        className={cn(
                          "flex h-16 flex-col items-center justify-center gap-1.5 rounded-lg border bg-card p-2.5 transition-colors",
                          isSel
                            ? "border-primary ring-1 ring-primary"
                            : "border-border hover:border-primary/40",
                        )}
                      >
                        {brand.logo ? (
                          // Dengan logo asli: tampilkan logo saja di tile putih.
                          <span className="flex h-9 w-full items-center justify-center rounded-md bg-white px-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={brand.logo}
                              alt={b}
                              className="max-h-6 w-auto max-w-full object-contain"
                            />
                          </span>
                        ) : (
                          // Fallback (tanpa aset logo): badge wordmark + nama.
                          <>
                            <span className="flex h-9 w-full items-center justify-center rounded-md border border-border bg-white px-2">
                              <span
                                className="text-[11px] font-extrabold tracking-tight"
                                style={{ color: brand.bg }}
                              >
                                {brand.mark}
                              </span>
                            </span>
                            <span className="text-[11px] font-medium text-foreground">{b}</span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {grandTotal != null && (
        <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
          <span className="font-medium text-foreground">Total bayar</span>
          <span className="font-semibold text-foreground">{formatIDR(grandTotal)}</span>
        </div>
      )}

      {needsBank && <p className="text-xs text-muted-foreground">Pilih bank dulu untuk lanjut.</p>}
      {payError && (
        <p role="alert" className="text-sm text-destructive">
          {payError}
        </p>
      )}

      <div className="mt-1 flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPaying}
          className="flex h-[42px] flex-1 items-center justify-center rounded-lg border border-border text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          Batal
        </button>
        <button
          type="button"
          disabled={!canPay}
          onClick={() => channel && onPay(channel, bank)}
          className="brand-gradient flex h-[42px] flex-1 items-center justify-center rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50"
        >
          {isPaying ? "Memproses…" : "Bayar Sekarang"}
        </button>
      </div>
    </div>
  );
}
