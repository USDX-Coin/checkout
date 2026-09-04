"use client";

// Pemilih metode pembayaran checkout (USDX-224, port USDX-202): VA (9 bank) / QRIS dengan
// "Biaya layanan" (pgFeeIdr) per metode + grand total. VA wajib pilih bank dulu. Konfirmasi
// → POST /v2/mint/{id}/pay. pgFee bisa "—" saat tak diketahui (refresh tanpa channels[]).
//
// Dua pilihan eksklusif di layar ini — metode, lalu bank — dan keduanya memakai `ui/radio-group`
// (Radix), bukan tombol buatan tangan. Yang didapat gratis dan TIDAK dipunyai versi tangan:
// `role="radiogroup"` + `aria-checked` (pembaca layar menyebut "1 dari 2, terpilih", bukan
// "tombol"), navigasi panah kiri/kanan di dalam grup, dan satu tab stop untuk seluruh grup alih-
// alih satu per opsi. `aria-pressed` yang dipakai sebelumnya menyatakan toggle, bukan pilihan
// eksklusif — itu keliru bahkan sebelum bicara keyboard.
//
// Grup bank sengaja BUKAN anak dari grup metode: dua RovingFocusGroup Radix yang bersarang akan
// berebut tombol panah. Desain (Figma `50` blok A, state A1b) juga menaruhnya sebagai baris
// sendiri berlabel "Pilih bank" di bawah daftar metode.

import { useState } from "react";
import { Landmark, QrCode } from "lucide-react";
import type { MintChannelOption, PaymentChannel, VaBank } from "@/types";
import { BANK_BRAND, QRIS_RED } from "@/lib/constants";
import { CHECKOUT_COPY, TOTAL_LABEL } from "@/lib/checkout/copy";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatIDR, cn } from "@/lib/utils";

function feeLabel(pgFeeIdr: string): string {
  if (!pgFeeIdr) return "—";
  const n = Number(pgFeeIdr);
  return Number.isFinite(n) ? formatIDR(n) : "—";
}

function feeOf(option: MintChannelOption): number | null {
  const n = Number(option.pgFeeIdr);
  return option.pgFeeIdr && Number.isFinite(n) ? n : null;
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
  // Temuan F6: satu-satunya metode yang ditawarkan tetap harus diklik manual sebelum tombol
  // bayar hidup — pilihan yang tidak punya alternatif bukan pilihan, cuma rintangan. Konvensi
  // ini ditulis di `ui/radio-group` sendiri: grup dengan tepat satu opsi dipilih dari awal.
  const [channel, setChannel] = useState<PaymentChannel | null>(
    () => (channels.length === 1 ? channels[0].channel : null),
  );
  const [bank, setBank] = useState<VaBank | null>(() => {
    const only = channels.length === 1 ? channels[0] : null;
    return only?.channel === "VA" && only.banks?.length === 1 ? only.banks[0] : null;
  });

  function pickChannel(next: PaymentChannel) {
    setChannel(next);
    const opt = channels.find((c) => c.channel === next);
    // Bank tunggal ikut terpilih; selain itu pilihan bank sebelumnya dilepas supaya tak terbawa
    // ke metode lain.
    setBank(opt?.channel === "VA" && opt.banks?.length === 1 ? opt.banks[0] : null);
  }

  const selected = channels.find((c) => c.channel === channel) ?? null;
  const needsBank = channel === "VA" && !bank;
  const canPay = channel !== null && !needsBank && !isPaying;

  // Temuan D4: angka yang benar-benar harus dibayar dulu baru muncul SETELAH kartu metode
  // diklik — di halaman pembayaran, itu terlambat. Sekarang total dihitung sejak awal dari
  // `channels[]`, yang memang sudah membawa `pgFeeIdr` per metode (USDX-216).
  //
  // Kalau biaya antar-metode BERBEDA, totalnya belum satu angka — dan mengarang satu angka
  // (mis. memakai yang termurah tanpa bilang) justru menyesatkan tepat di tempat yang mahal.
  // Jadi yang ditampilkan rentangnya, dengan catatan bahwa pilihan metode yang menentukan.
  const base = Number(totalBeforePgFeeIdr);
  const selectedFee = selected ? feeOf(selected) : null;
  const knownFees = channels.map(feeOf).filter((f): f is number => f !== null);
  const allFeesKnown = knownFees.length === channels.length && knownFees.length > 0;
  const feeMin = allFeesKnown ? Math.min(...knownFees) : null;
  const feeMax = allFeesKnown ? Math.max(...knownFees) : null;
  // Satu angka pasti: metode sudah dipilih, atau semua metode berbiaya sama.
  const fixedFee = selectedFee ?? (feeMin !== null && feeMin === feeMax ? feeMin : null);
  const grandTotal = fixedFee != null && Number.isFinite(base) ? base + fixedFee : null;
  const totalRange =
    grandTotal == null && feeMin !== null && feeMax !== null && Number.isFinite(base)
      ? { min: base + feeMin, max: base + feeMax }
      : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-foreground">Pilih metode pembayaran</p>

      <RadioGroup
        value={channel ?? ""}
        onValueChange={(v) => pickChannel(v as PaymentChannel)}
        aria-label="Metode pembayaran"
        className="gap-2.5"
      >
        {channels.map((opt) => {
          const active = channel === opt.channel;
          const { Icon, badgeBg, subtitle } = channelMeta(opt.channel);
          const id = `metode-${opt.channel}`;
          return (
            <label
              key={opt.channel}
              htmlFor={id}
              className={cn(
                // `min-w-0` menanggung beban: sejak pindah ke RadioGroup, label ini jadi
                // grid item, dan default `min-width: auto` mengunci lebarnya di min-content
                // sehingga kartu menembus tepi layar di HP (395px di viewport 375 dan 320).
                "flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-control",
                active ? "border-primary-text bg-primary/[0.03]" : "border-border",
              )}
            >
              <RadioGroupItem value={opt.channel} id={id} />
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
                <span className="block text-xs text-muted-foreground">Biaya layanan</span>
                <span className="block text-xs font-medium text-foreground">
                  {feeLabel(opt.pgFeeIdr)}
                </span>
              </span>
            </label>
          );
        })}
      </RadioGroup>

      {/* Grup kedua, bukan grup bersarang — lihat catatan di kepala berkas. Tile-nya tetap
          seperti desain (logo di atas ubin putih, tepi brand saat terpilih); radionya sendiri
          disembunyikan secara visual, dan yang membawa cincin fokus adalah ubinnya lewat
          `has-[...]`. Tanpa itu, fokus keyboard mendarat di lingkaran yang tak terlihat. */}
      {selected?.channel === "VA" && selected.banks && selected.banks.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{CHECKOUT_COPY.chooseBankLabel}</p>
          <RadioGroup
            value={bank ?? ""}
            onValueChange={(v) => setBank(v as VaBank)}
            aria-label={CHECKOUT_COPY.chooseBankLabel}
            className="grid-cols-3 gap-2"
          >
            {selected.banks.map((b) => {
              const brand = BANK_BRAND[b];
              const isSel = bank === b;
              const id = `bank-${b}`;
              return (
                <label
                  key={b}
                  htmlFor={id}
                  className={cn(
                    "flex h-16 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border bg-card p-2.5 transition-control",
                    "has-[[data-slot=radio-group-item]:focus-visible]:ring-2 has-[[data-slot=radio-group-item]:focus-visible]:ring-focus-ring has-[[data-slot=radio-group-item]:focus-visible]:ring-offset-2 has-[[data-slot=radio-group-item]:focus-visible]:ring-offset-background",
                    isSel
                      // `primary-text`, bukan `primary`: maroon #800000 di atas kartu gelap
                      // #1a1a1a cuma 1,59:1 (SC 1.4.11 minta 3:1), dan radio ubin bank
                      // `sr-only` sehingga cincin ini satu-satunya penanda bank terpilih.
                      ? "border-primary-text ring-1 ring-primary-text"
                      : "border-border hover:border-primary-text/40",
                  )}
                >
                  <RadioGroupItem value={b} id={id} aria-label={b} className="sr-only" />
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
                          className="text-xs font-extrabold tracking-tight"
                          style={{ color: brand.bg }}
                        >
                          {brand.mark}
                        </span>
                      </span>
                      <span className="text-xs font-medium text-foreground">{b}</span>
                    </>
                  )}
                </label>
              );
            })}
          </RadioGroup>
        </div>
      )}

      {(grandTotal != null || totalRange != null) && (
        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">{TOTAL_LABEL}</span>
            <span className="font-semibold text-foreground">
              {grandTotal != null
                ? formatIDR(grandTotal)
                : `${formatIDR(totalRange!.min)} – ${formatIDR(totalRange!.max)}`}
            </span>
          </div>
          {grandTotal == null && (
            <p className="text-xs text-muted-foreground">
              {CHECKOUT_COPY.totalDependsOnMethodNote}
            </p>
          )}
        </div>
      )}

      {needsBank && <p className="text-xs text-muted-foreground">Pilih bank dulu untuk lanjut.</p>}
      {payError && (
        <p role="alert" className="text-sm text-destructive-text">
          {payError}
        </p>
      )}

      <div className="mt-1 flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={isPaying}
        >
          Batal
        </Button>
        {/* `loading` milik `ui/button` menahan lebar tombol saat labelnya berganti — tombol
            footer yang menyusut di tengah submit terbaca sebagai bug tata letak. */}
        <Button
          type="button"
          variant="brand"
          className="flex-1"
          disabled={!canPay}
          loading={isPaying}
          loadingLabel="Memproses…"
          onClick={() => channel && onPay(channel, bank)}
        >
          Bayar Sekarang
        </Button>
      </div>
    </div>
  );
}
