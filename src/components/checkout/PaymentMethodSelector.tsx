"use client";

// Pemilih metode pembayaran checkout. Konfirmasi → POST /v2/mint/{id}/pay.
//
// Bentuk mengikuti desain PM 2 Okt 2026 (D25 — `sot/phase-2/week2.md` § Checkout,
// `sot/bni-integration.md` §4.3), disambungkan ke kontrak rev-16/17:
//
//  1. DAFTAR — tiap baris cuma NAMA metode + SATU angka total. "Paling hemat" hanya menempel di
//     opsi yang `estimatedTotalPayMaxIdr`-nya benar-benar terkecil (rev-17 R8: total TERMASUK kode
//     unik, Transfer BNI +999 sebelum /pay). Tidak ada penanda tetap untuk metode tertentu.
//  2. DETAIL membuka di bawah opsi yang diketuk: Transfer BNI → kurs BNI + sumbernya; Virtual
//     Account → pilih bank (biaya per bank dari `bankOptions[]`). Lalu rincian harga metode itu.
//  3. Tombol utama menyebut angkanya: "Bayar Rp X".
//
// TIDAK ADA kartu statis dan TIDAK ADA urutan yang dipatok di sini. Daftar metode, urutannya, dan
// biayanya diatur admin dari back-office (`payment_methods`, rev-16 §4.3.11) dan sampai ke sini
// lewat `channels[]` yang sudah urut `sortOrder` — begitu juga `banks`. Menyusun ulang di FE berarti
// mengabaikan keputusan admin.
//
// Yang dipertahankan dari versi sebelumnya:
//  - Tidak ada yang dipra-pilih (Figma A1a): memilihkan metode diam-diam berarti memilihkan HARGA.
//  - Bank di `disabledBanks` tampil "Segera hadir", bukan disembunyikan (USDX-622).
//  - Pilihan direkonsiliasi tiap render: metode/bank yang hilang atau berubah tidak tersedia
//    sesudah dipilih tidak boleh tetap bisa dibayar.

import { useState } from "react";
import { Landmark, Lock, QrCode } from "lucide-react";
import type { MintChannelBankOption, MintChannelOption, PaymentChannel, VaBank } from "@/types";
import { Badge } from "@/components/ui/badge";
import { BANK_BRAND, QRIS_RED } from "@/lib/constants";
import { CHECKOUT_COPY, TOTAL_LABEL } from "@/lib/checkout/copy";
import { Button } from "@/components/ui/button";
import { CardChoice } from "@/components/ui/card-choice";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatIDR, formatRate, formatWibDateTime, cn } from "@/lib/utils";

/** Channel yang bisa digambar halaman ini. Kontrak menyatakan enum `PaymentChannel` terbuka —
 *  channel yang tak dikenal TIDAK ditawarkan: tombol bayar untuk instrumen yang instruksinya
 *  tidak kita kenal adalah tombol yang menyuruh orang membayar tanpa tahu caranya. */
const KNOWN_CHANNELS: ReadonlySet<string> = new Set<PaymentChannel>(["VA", "QRIS", "BANK_TRANSFER"]);

// Angka opsional dari kontrak → number, atau null kalau absen/tak terbaca. `Number("")` dan
// `Number(null)` sama-sama 0 — keduanya akan terbaca sebagai "Rp 0", jadi keduanya null.
function num(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Absen = tersedia (backend sebelum rev-17 tidak mengirim field ini). */
function isAvailable(o: { available?: boolean }): boolean {
  return o.available !== false;
}

function channelTitle(channel: PaymentChannel): string {
  if (channel === "BANK_TRANSFER") return CHECKOUT_COPY.bniTransferTitle;
  if (channel === "QRIS") return "QRIS";
  return CHECKOUT_COPY.vaTitle;
}

function unavailableText(o: { unavailableReason?: string | null; maxAmountIdr?: string | null }) {
  if (o.unavailableReason === "AMOUNT_ABOVE_METHOD_MAX") {
    const max = num(o.maxAmountIdr);
    return CHECKOUT_COPY.unavailableAboveMax(max !== null ? formatIDR(max) : null);
  }
  return CHECKOUT_COPY.unavailableGeneric;
}

/** Angka-angka satu pilihan (channel, atau satu bank di dalamnya). Null = backend tak mengirim. */
interface Priced {
  total: number | null;
  subtotal: number | null;
  mintFee: number | null;
  pgFee: number | null;
  rate: number | null;
}

/** Harga ORDER — hanya dari backend sebelum D25, yang belum mengirim estimasi per metode. */
interface LegacyOrderPrice {
  totalBeforePgFeeIdr?: string | null;
  subtotalIdr?: string | null;
  mintFeeIdr?: string | null;
  effectiveRate?: string | null;
}

/**
 * Harga satu channel, dan — kalau bank sudah dipilih dan backend mengirim `bankOptions[]` — harga
 * bank itu. Rev-16: biaya per METODE (bank); field tingkat channel = bank termurah.
 *
 * Backend sebelum D25 hanya mengirim harga ORDER + `pgFeeIdr` per channel. Untuk itu totalnya
 * order + biaya layanan, persis perhitungan lama.
 */
export function priceOf(
  option: MintChannelOption,
  legacy: LegacyOrderPrice,
  bankOption?: MintChannelBankOption | null,
): Priced {
  const estimate = num(bankOption?.estimatedTotalPayIdr) ?? num(option.estimatedTotalPayIdr);
  const pgFee = num(bankOption?.pgFeeIdr) ?? num(option.pgFeeIdr);
  if (estimate !== null) {
    return {
      total: estimate,
      subtotal: num(option.subtotalIdr),
      mintFee: num(option.mintFeeIdr),
      pgFee,
      rate: num(option.effectiveRate),
    };
  }
  const base = num(legacy.totalBeforePgFeeIdr);
  return {
    total: base !== null && pgFee !== null ? base + pgFee : null,
    subtotal: num(legacy.subtotalIdr),
    mintFee: num(legacy.mintFeeIdr),
    pgFee,
    rate: num(legacy.effectiveRate),
  };
}

/**
 * Channel yang pantas diberi "Paling hemat" (rev-17 R8, `api/mint.yaml` ChannelOption).
 *
 * Dasarnya SATU-SATUNYA `estimatedTotalPayMaxIdr` — total termasuk batas atas kode unik. Kalau
 * ada opsi tersedia yang tidak membawanya (backend lama), tidak ada penanda sama sekali:
 * membandingkan total BNI tanpa kode unik dengan total VA bisa menobatkan opsi yang ternyata lebih
 * mahal. Opsi `available=false` tidak pernah diberi penanda; seri = tidak ada penanda; satu opsi =
 * tak ada pembanding.
 */
export function cheapestChannel(channels: MintChannelOption[]): PaymentChannel | null {
  const candidates = channels.filter(isAvailable);
  if (candidates.length < 2) return null;
  const totals = candidates.map((c) => num(c.estimatedTotalPayMaxIdr));
  if (totals.some((t) => t === null)) return null;
  const min = Math.min(...(totals as number[]));
  const atMin = candidates.filter((_, i) => totals[i] === min);
  return atMin.length === 1 ? atMin[0].channel : null;
}

/**
 * Bank-bank satu channel punya tarif berbeda (rev-16: biaya per metode). Selama bank belum
 * dipilih, angka tingkat channel = bank TERMURAH — menyebutnya sebagai angka pasti menyesatkan,
 * jadi ia diberi awalan "mulai".
 */
function bankFeesVary(option: MintChannelOption): boolean {
  const opts = (option.bankOptions ?? []).filter(isAvailable);
  return new Set(opts.map((o) => num(o.estimatedTotalPayIdr))).size > 1;
}

function channelIcon(channel: PaymentChannel) {
  if (channel === "BANK_TRANSFER") {
    return (
      <span className="flex size-8 items-center justify-center rounded-full bg-white shadow-[inset_0_0_0_1px_var(--color-border)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BANK_BRAND.BNI.logo} alt="" className="max-h-3 w-auto max-w-6 object-contain" />
      </span>
    );
  }
  return channel === "QRIS" ? (
    <span
      className="flex size-8 items-center justify-center rounded-full"
      style={{ backgroundColor: QRIS_RED }}
    >
      <QrCode className="size-4 text-white" />
    </span>
  ) : (
    <span className="flex size-8 items-center justify-center rounded-full bg-muted">
      <Landmark className="size-4" />
    </span>
  );
}

function FeeRow({
  label,
  value,
  strong = false,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className={cn(strong ? "font-medium text-foreground" : "text-muted-foreground")}>
        {label}
      </span>
      <span
        className={cn(
          "text-right whitespace-nowrap tabular-nums",
          strong ? "font-semibold text-foreground" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

// Plat logo bank (Figma `2639:32218`/`2639:32219`): logo 24 px di tengah plat putih 48.
function BankPlate({ bank, muted = false }: { bank: VaBank; muted?: boolean }) {
  const brand = BANK_BRAND[bank];
  return (
    <span className="flex h-12 w-full shrink-0 items-center justify-center rounded-md bg-white px-2">
      {brand?.logo ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={brand.logo}
          alt={muted ? "" : (brand?.name ?? bank)}
          className={cn("max-h-6 w-auto max-w-full object-contain", muted && "grayscale")}
        />
      ) : (
        <span className="text-sm font-extrabold tracking-tight" style={{ color: brand?.bg }}>
          {brand?.mark ?? bank}
        </span>
      )}
    </span>
  );
}

// Bank yang tampil tapi tidak bisa dipilih — "Segera hadir" (metode belum aktif, USDX-622) atau
// "Tidak tersedia" (metode aktif, tapi tidak untuk order ini — rev-17). Daftar biasa, BUKAN radio
// mati di dalam RadioGroup: radio yang tak bisa dipilih tetap ikut urutan panah dan dibacakan
// sebagai pilihan.
function DeadBankList({
  banks,
  label,
  badge,
  badgeTone,
}: {
  banks: VaBank[];
  label: string;
  badge: string;
  badgeTone: "coming-soon" | "neutral";
}) {
  if (banks.length === 0) return null;
  return (
    <ul className="grid grid-cols-3 gap-2" aria-label={label}>
      {banks.map((b) => (
        <li key={b} className="flex flex-col items-center gap-1">
          <div
            aria-hidden="true"
            className="relative flex h-16 w-full items-center justify-center rounded-lg bg-card p-2 opacity-50 shadow-[inset_0_0_0_1px_var(--color-border)]"
          >
            <BankPlate bank={b} muted />
          </div>
          <span className="flex flex-col items-center gap-1">
            <span className="text-[11px] leading-none text-muted-foreground">
              {BANK_BRAND[b]?.name ?? b}
            </span>
            <Badge tone={badgeTone} className="px-1.5 text-[10px] tracking-normal">
              {badge}
            </Badge>
          </span>
        </li>
      ))}
    </ul>
  );
}

interface PaymentMethodSelectorProps {
  channels: MintChannelOption[];
  isPaying: boolean;
  payError: string | null;
  onPay: (channel: PaymentChannel, bank: VaBank | null) => void;
  onCancel: () => void;
  /** Harga ORDER — hanya untuk backend sebelum D25 (null di D25 selama REQUESTED). */
  totalBeforePgFeeIdr?: string | null;
  effectiveRate?: string | null;
  subtotalIdr?: string | null;
  mintFeeIdr?: string | null;
  /** Persen biaya mint (global, `fee_configs.mint_fee_pct`). Label saja. */
  mintFeePct?: string | null;
  /** Sisa waktu memilih metode, sudah terformat. */
  countdown?: React.ReactNode;
}

export function PaymentMethodSelector({
  channels: channelsRaw,
  isPaying,
  payError,
  onPay,
  onCancel,
  totalBeforePgFeeIdr,
  effectiveRate,
  subtotalIdr,
  mintFeeIdr,
  mintFeePct,
  countdown,
}: PaymentMethodSelectorProps) {
  // Urutan = urutan backend (sortOrder admin). Channel yang tak dikenal dibuang, tidak disusun.
  const channels = channelsRaw.filter((c) => KNOWN_CHANNELS.has(c.channel));
  const legacy: LegacyOrderPrice = { totalBeforePgFeeIdr, subtotalIdr, mintFeeIdr, effectiveRate };
  const cheapest = cheapestChannel(channels);

  const [channel, setChannel] = useState<PaymentChannel | null>(null);
  const [bank, setBank] = useState<VaBank | null>(null);

  function pickChannel(next: PaymentChannel) {
    setChannel(next);
    setBank(null);
  }

  // Direkonsiliasi tiap render: channel yang dipilih bisa hilang dari `channels[]` atau berubah
  // `available=false` di muatan berikutnya (admin mematikan metode, kurs BNI dikosongkan).
  const selectedOption =
    channels.find((c) => c.channel === channel && isAvailable(c)) ?? null;
  const selectedChannel = selectedOption?.channel ?? null;

  // Bank: `banks` (urutan backend) dikurangi yang mati. Yang mati MENANG kalau backend mengirim
  // bank yang sama di dua daftar — menerima bank yang pasti ditolak lebih mahal daripada menolak
  // yang boleh. Bank yang `bankOptions[].available=false` (rev-17) tampil dengan alasannya.
  const comingSoonBanks = selectedOption?.disabledBanks ?? [];
  const comingSoonSet = new Set<VaBank>(comingSoonBanks);
  const bankOptionOf = (b: VaBank) =>
    selectedOption?.bankOptions?.find((o) => o.bank === b) ?? null;
  const listedBanks = (selectedOption?.banks ?? []).filter((b) => !comingSoonSet.has(b));
  const activeBanks = listedBanks.filter((b) => {
    const o = bankOptionOf(b);
    return o === null || isAvailable(o);
  });
  const unavailableBanks = listedBanks.filter((b) => !activeBanks.includes(b));
  const effectiveBank = bank !== null && activeBanks.includes(bank) ? bank : null;

  const isVa = selectedChannel === "VA";
  const noBankSelectable = isVa && activeBanks.length === 0;
  const needsBank = isVa && effectiveBank === null;
  const canPay = selectedOption !== null && !needsBank && !isPaying;
  const nothingSelectable = channels.every((c) => !isAvailable(c));

  const selectedPrice = selectedOption
    ? priceOf(selectedOption, legacy, effectiveBank ? bankOptionOf(effectiveBank) : null)
    : null;

  const payLabel =
    selectedPrice === null
      ? CHECKOUT_COPY.pickMethodCta
      : selectedPrice.total !== null
        ? CHECKOUT_COPY.payAmountCta(formatIDR(selectedPrice.total))
        : CHECKOUT_COPY.payCta;

  function detail(option: MintChannelOption) {
    const ch = option.channel;
    const p = priceOf(option, legacy, effectiveBank ? bankOptionOf(effectiveBank) : null);
    const hasBreakdown = p.subtotal !== null && p.mintFee !== null;
    const rateUpdatedAt = formatWibDateTime(option.rateUpdatedAt);
    const feeVaries = bankFeesVary(option) && effectiveBank === null;
    return (
      <div
        data-testid={`detail-${ch}`}
        className="flex flex-col gap-3 rounded-lg bg-muted p-3 min-[544px]:p-4"
      >
        {ch === "BANK_TRANSFER" && p.rate !== null && (
          <div className="flex flex-col gap-0.5 text-sm text-foreground">
            <p>{CHECKOUT_COPY.bniRateLine(formatRate(p.rate))}</p>
            {rateUpdatedAt && (
              <p className="text-xs text-muted-foreground">
                {CHECKOUT_COPY.rateUpdatedAt(rateUpdatedAt)}
              </p>
            )}
          </div>
        )}

        {ch === "QRIS" && <p className="text-sm text-foreground">{CHECKOUT_COPY.qrisDescription}</p>}

        {/* Grup radio bank tinggal DI DALAM grup metode. Aman karena `ui/radio-group` hanya
            menggerakkan radio miliknya sendiri saat tombol panah ditekan. */}
        {ch === "VA" &&
          (activeBanks.length > 0 || comingSoonBanks.length > 0 || unavailableBanks.length > 0) && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                {noBankSelectable ? CHECKOUT_COPY.noBankAvailableLabel : CHECKOUT_COPY.chooseBankLabel}
              </p>
              {activeBanks.length > 0 && (
                <RadioGroup
                  value={effectiveBank ?? ""}
                  onValueChange={(v) => setBank(v as VaBank)}
                  aria-label={CHECKOUT_COPY.chooseBankLabel}
                  className="grid-cols-3 gap-2"
                >
                  {activeBanks.map((b) => {
                    const isSel = effectiveBank === b;
                    const id = `bank-${b}`;
                    return (
                      <label
                        key={b}
                        htmlFor={id}
                        className={cn(
                          // Tepi = bayangan INSET, bukan `border`: border memakan tinggi dan
                          // menyusutkan plat 48 px; bayangan tidak (8 + 48 + 8 = 64 persis).
                          "relative flex h-16 cursor-pointer items-center justify-center rounded-lg bg-card p-2 transition-control",
                          "has-[[data-slot=radio-group-item]:focus-visible]:ring-2 has-[[data-slot=radio-group-item]:focus-visible]:ring-focus-ring has-[[data-slot=radio-group-item]:focus-visible]:ring-offset-2 has-[[data-slot=radio-group-item]:focus-visible]:ring-offset-background",
                          isSel
                            ? "bg-primary-text/5 shadow-[inset_0_0_0_2px_var(--color-primary-text)]"
                            : "shadow-[inset_0_0_0_1px_var(--color-border)] hover:shadow-[inset_0_0_0_1px_var(--color-primary-text)]",
                        )}
                      >
                        {/* Pembungkus `sr-only`: radio 20 px keluar dari alur, logo tetap di tengah. */}
                        <span className="sr-only">
                          <RadioGroupItem value={b} id={id} aria-label={BANK_BRAND[b]?.name ?? b} />
                        </span>
                        <BankPlate bank={b} />
                      </label>
                    );
                  })}
                </RadioGroup>
              )}
              <DeadBankList
                banks={unavailableBanks}
                label={CHECKOUT_COPY.unavailableBadge}
                badge={CHECKOUT_COPY.unavailableBadge}
                badgeTone="neutral"
              />
              {unavailableBanks.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {unavailableText(bankOptionOf(unavailableBanks[0]) ?? {})}
                </p>
              )}
              <DeadBankList
                banks={comingSoonBanks}
                label={CHECKOUT_COPY.bankComingSoonListLabel}
                badge={CHECKOUT_COPY.bankComingSoonLabel}
                badgeTone="coming-soon"
              />
            </div>
          )}

        {hasBreakdown && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            {ch !== "BANK_TRANSFER" && p.rate !== null && (
              <FeeRow label={CHECKOUT_COPY.rateLabel} value={CHECKOUT_COPY.perUsdx(formatRate(p.rate))} />
            )}
            <FeeRow label={CHECKOUT_COPY.usdxValueLabel} value={formatIDR(p.subtotal!)} />
            <FeeRow
              label={
                mintFeePct
                  ? `${CHECKOUT_COPY.mintFeeLabel} (${mintFeePct}%)`
                  : CHECKOUT_COPY.mintFeeLabel
              }
              value={formatIDR(p.mintFee!)}
            />
            <FeeRow
              label={CHECKOUT_COPY.serviceFeeLabel}
              value={
                p.pgFee === null ? "—" : feeVaries ? `mulai ${formatIDR(p.pgFee)}` : formatIDR(p.pgFee)
              }
            />
            {p.total !== null && (
              <FeeRow
                label={TOTAL_LABEL}
                value={feeVaries ? `mulai ${formatIDR(p.total)}` : formatIDR(p.total)}
                strong
              />
            )}
            {ch === "BANK_TRANSFER" && (
              <p className="text-xs text-muted-foreground">{CHECKOUT_COPY.uniqueCodeEstimateNote}</p>
            )}
            {/* `channels[]` hanya estimasi: `/pay` membaca ulang kurs lalu mengunci (D25-d). */}
            <p className="text-xs text-muted-foreground">{CHECKOUT_COPY.estimateNote}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">{CHECKOUT_COPY.methodGroupLabel}</p>

        <RadioGroup
          value={selectedChannel ?? ""}
          onValueChange={(v) => pickChannel(v as PaymentChannel)}
          aria-label={CHECKOUT_COPY.methodGroupLabel}
          className="gap-2"
        >
          {channels.map((opt) => {
            const ch = opt.channel;
            const available = isAvailable(opt);
            const total = priceOf(opt, legacy).total;
            const isOpen = selectedChannel === ch;
            return (
              <div key={ch} className="flex flex-col gap-2">
                <CardChoice
                  value={ch}
                  id={`metode-${ch}`}
                  title={channelTitle(ch)}
                  // Opsi aktif yang tidak bisa dipakai UNTUK ORDER INI tampil non-aktif beserta
                  // alasannya (rev-17) — disembunyikan, orang mengira metodenya tidak ada.
                  description={available ? undefined : unavailableText(opt)}
                  disabled={!available}
                  icon={channelIcon(ch)}
                  trailing={
                    <span className="flex flex-col items-end gap-1">
                      <span className="text-sm font-semibold whitespace-nowrap text-foreground tabular-nums">
                        {!available
                          ? CHECKOUT_COPY.unavailableBadge
                          : total === null
                            ? "—"
                            : bankFeesVary(opt)
                              ? `mulai ${formatIDR(total)}`
                              : formatIDR(total)}
                      </span>
                      {cheapest === ch && (
                        <Badge tone="success">{CHECKOUT_COPY.cheapestBadge}</Badge>
                      )}
                    </span>
                  }
                />
                {isOpen && detail(opt)}
              </div>
            );
          })}
        </RadioGroup>

        {nothingSelectable && (
          <p className="text-xs text-muted-foreground">{CHECKOUT_COPY.noMethodAvailable}</p>
        )}
      </div>

      {countdown && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{CHECKOUT_COPY.countdownBeforeMethod}</span>
          <span className="flex items-center gap-1.5 text-foreground">
            <Lock aria-hidden className="size-3.5 text-muted-foreground" />
            <span className="font-semibold tabular-nums">{countdown}</span>
          </span>
        </div>
      )}

      {payError && (
        <p role="alert" className="text-sm text-destructive-text">
          {payError}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col-reverse gap-3 min-[400px]:flex-row">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-[400px]:flex-1"
            onClick={onCancel}
            disabled={isPaying}
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="brand"
            size="lg"
            className="min-[400px]:flex-[2]"
            disabled={!canPay}
            loading={isPaying}
            loadingLabel="Memproses…"
            // Transfer BNI: `bank` WAJIB `BNI` (`api/mint.yaml` PayMintOrderRequest, D25).
            // QRIS: tanpa bank. VA: bank yang dipilih.
            onClick={() =>
              selectedChannel &&
              onPay(
                selectedChannel,
                selectedChannel === "BANK_TRANSFER" ? "BNI" : selectedChannel === "VA" ? effectiveBank : null,
              )
            }
          >
            {payLabel}
          </Button>
        </div>

        {needsBank && (
          <p className="text-center text-xs text-muted-foreground">
            {noBankSelectable ? CHECKOUT_COPY.noBankAvailableHint : CHECKOUT_COPY.pickBankHint}
          </p>
        )}
      </div>
    </div>
  );
}
