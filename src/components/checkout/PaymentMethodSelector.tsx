"use client";

// Pemilih metode pembayaran checkout (USDX-224, port USDX-202): VA (dengan lapis bank) / QRIS,
// lalu tabel rincian biaya, lalu tombol. Konfirmasi → POST /v2/mint/{id}/pay.
//
// Bentuknya mengikuti Figma `TXzbmT9lo27cse6IwqSuEP`, board `50 · Checkout`, state A1a
// (`2639:31770`) dan A1b (`2639:32156`). Tiga hal yang berubah dari versi sebelumnya, dan
// alasannya:
//
//  1. Kartu metode memakai `ui/card-choice` (Figma "Card/Pilihan"), bukan `<label>` buatan
//     tangan. Komponennya sudah ada di repo sejak PR 2 dan tingginya persis angka Figma —
//     70 px dengan keterangan, 52 px tanpa — sementara versi tangan `p-3` memberi 66 px,
//     menaruh badge ikon KOTAK BIRU TUA di kiri (Figma: ikon muted di kanan), dan menandai
//     kartu terpilih dengan border 1 px alih-alih 2 px + wash 5 %. Melahirkan versi kedua dari
//     komponen yang sudah ada persis temuan C12 yang sedang diberantas.
//
//  2. Rincian biaya SELALU TERBUKA di atas tombol (Figma `kelompok ringkasan · 06f Opsi 3`:
//     kurs → biaya → total → tombol, lima baris h 20 jarak 8). Sebelumnya kelimanya terkunci
//     di dalam `<details>` tertutup berjudul "Rincian biaya" di kelompok ringkasan atas, jadi
//     di layar tempat orang memutuskan membayar satu-satunya angka yang terbaca adalah
//     totalnya. Rincian yang harus diklik dulu bukan rincian yang dibaca.
//
//  3. Dua grup radio bersaudara, bukan bersarang — dua RovingFocusGroup Radix yang bersarang
//     akan berebut tombol panah. Desain juga menaruh bank sebagai baris sendiri berlabel
//     "Pilih bank" di bawah daftar metode.

import { useState } from "react";
import { Landmark, Lock, QrCode } from "lucide-react";
import type { MintChannelOption, PaymentChannel, VaBank } from "@/types";
import { BANK_BRAND, QRIS_RED } from "@/lib/constants";
import { CHECKOUT_COPY, TOTAL_LABEL } from "@/lib/checkout/copy";
import { Button } from "@/components/ui/button";
import { CardChoice } from "@/components/ui/card-choice";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatIDR, cn } from "@/lib/utils";

function feeOf(option: MintChannelOption): number | null {
  const n = Number(option.pgFeeIdr);
  return option.pgFeeIdr && Number.isFinite(n) ? n : null;
}

// Ikon merek per channel. Figma menaruhnya di KANAN kartu sebagai lingkaran ber-latar muted;
// `ui/card-choice` menyediakan bingkai `size-8` di posisi itu, jadi yang dikirim ke sana cukup
// isinya. QRIS memakai merah mereknya sendiri — QRIS adalah merek, bukan status.
function channelIcon(channel: PaymentChannel) {
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

// Keterangan kartu. Untuk VA, Figma menuliskan daftar banknya ("Mandiri · BRI · BNI") alih-alih
// kalimat generik — daftar itu yang benar-benar menjawab "bisa transfer dari mana".
function channelDescription(option: MintChannelOption): string {
  if (option.channel === "QRIS") return CHECKOUT_COPY.qrisDescription;
  const banks = option.banks ?? [];
  return banks.length > 0 ? banks.join(" · ") : CHECKOUT_COPY.vaDescriptionFallback;
}

// Satu baris tabel rincian. `strong` untuk baris total: Figma menebalkan LABEL dan NILAI-nya,
// tanpa garis pemisah di atasnya — garis itu memecah tabel jadi dua tabel kecil.
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
          "flex flex-wrap items-center justify-end gap-x-1.5 text-right whitespace-nowrap",
          strong ? "font-semibold text-foreground" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

interface PaymentMethodSelectorProps {
  channels: MintChannelOption[];
  totalBeforePgFeeIdr: string;
  isPaying: boolean;
  payError: string | null;
  onPay: (channel: PaymentChannel, bank: VaBank | null) => void;
  onCancel: () => void;
  /** Kurs yang benar-benar dipakai menghitung `subtotalIdr` — lihat catatan di `FeeTable`. */
  effectiveRate?: string;
  subtotalIdr?: string;
  mintFeePct?: string;
  mintFeeIdr?: string;
  /** Sisa waktu memilih metode, sudah terformat. Tampil di baris "Kurs terkunci". */
  countdown?: React.ReactNode;
}

export function PaymentMethodSelector({
  channels,
  totalBeforePgFeeIdr,
  isPaying,
  payError,
  onPay,
  onCancel,
  effectiveRate,
  subtotalIdr,
  mintFeePct,
  mintFeeIdr,
  countdown,
}: PaymentMethodSelectorProps) {
  // Temuan F6: satu-satunya metode yang ditawarkan tetap harus diklik manual sebelum tombol
  // bayar hidup — pilihan yang tidak punya alternatif bukan pilihan, cuma rintangan.
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
    setBank(opt?.channel === "VA" && opt.banks?.length === 1 ? opt.banks[0] : null);
  }

  const selected = channels.find((c) => c.channel === channel) ?? null;
  const needsBank = channel === "VA" && !bank;
  const canPay = channel !== null && !needsBank && !isPaying;

  // Temuan D4: angka yang benar-benar harus dibayar dulu baru muncul SETELAH kartu metode
  // diklik — di halaman pembayaran, itu terlambat. Total dihitung sejak awal dari `channels[]`,
  // yang memang sudah membawa `pgFeeIdr` per metode (USDX-216).
  //
  // Kalau biaya antar-metode BERBEDA, totalnya belum satu angka — dan mengarang satu angka
  // (mis. memakai yang termurah tanpa bilang) menyesatkan tepat di tempat yang mahal. Jadi yang
  // ditampilkan rentangnya, dengan catatan bahwa pilihan metode yang menentukan.
  const base = Number(totalBeforePgFeeIdr);
  const selectedFee = selected ? feeOf(selected) : null;
  const knownFees = channels.map(feeOf).filter((f): f is number => f !== null);
  const allFeesKnown = knownFees.length === channels.length && knownFees.length > 0;
  const feeMin = allFeesKnown ? Math.min(...knownFees) : null;
  const feeMax = allFeesKnown ? Math.max(...knownFees) : null;
  const fixedFee = selectedFee ?? (feeMin !== null && feeMin === feeMax ? feeMin : null);
  const grandTotal = fixedFee != null && Number.isFinite(base) ? base + fixedFee : null;
  const totalRange =
    grandTotal == null && feeMin !== null && feeMax !== null && Number.isFinite(base)
      ? { min: base + feeMin, max: base + feeMax }
      : null;

  // Rincian penuh hanya bisa digambar kalau ketiga angka penyusunnya ada. Backend lama yang
  // tidak mengirimnya jatuh ke tabel satu baris (total saja) — lebih baik kurang baris daripada
  // baris yang isinya tebakan.
  const subtotal = Number(subtotalIdr);
  const mintFee = Number(mintFeeIdr);
  const rate = Number(effectiveRate);
  const hasBreakdown = [subtotal, mintFee].every((n) => Number.isFinite(n) && n > 0);

  // Figma menghapus biaya layanan dari kartu metode karena di desain cuma ada satu metode
  // hidup — perbandingannya tak pernah terjadi. Di produksi `channels[]` membawa VA dan QRIS
  // dengan selisih yang bisa 7×, jadi barisnya menampilkan RENTANG selama belum ada yang
  // dipilih, lalu mengunci ke angka metode terpilih. Bentuk Figma tetap, angkanya tidak hilang.
  const feeValue =
    selectedFee != null
      ? formatIDR(selectedFee)
      : feeMin != null && feeMax != null
        ? feeMin === feeMax
          ? formatIDR(feeMin)
          : `${formatIDR(feeMin)} – ${formatIDR(feeMax)}`
        : "—";
  const feeLabelText = selected
    ? `${CHECKOUT_COPY.serviceFeeLabel} (${selected.channel === "VA" ? "Virtual Account" : "QRIS"})`
    : CHECKOUT_COPY.serviceFeeLabel;

  const showTotal = grandTotal != null || totalRange != null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">{CHECKOUT_COPY.methodGroupLabel}</p>

        <RadioGroup
          value={channel ?? ""}
          onValueChange={(v) => pickChannel(v as PaymentChannel)}
          aria-label="Metode pembayaran"
          className="gap-2"
        >
          {channels.map((opt) => (
            <CardChoice
              key={opt.channel}
              value={opt.channel}
              id={`metode-${opt.channel}`}
              title={opt.channel === "VA" ? "Virtual Account" : "QRIS"}
              description={channelDescription(opt)}
              icon={channelIcon(opt.channel)}
            />
          ))}
        </RadioGroup>

        {/* Grup kedua, bukan grup bersarang. Ubinnya seperti desain (logo di atas plat putih,
            tepi brand + wash saat terpilih); radionya sendiri disembunyikan secara visual, dan
            yang membawa cincin fokus adalah ubinnya lewat `has-[...]`. Tanpa itu, fokus
            keyboard mendarat di lingkaran yang tak terlihat. */}
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
                      // h-16 + p-2 + plat h-12 = angka Figma (`2639:32218`: ubin 64, plat inset
                      // 8, tinggi 48). Plat `h-9` yang dipakai sebelumnya menyisakan 12 px
                      // kosong dan membuat logonya mengambang kekecilan.
                      "flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border bg-card p-2 transition-control",
                      "has-[[data-slot=radio-group-item]:focus-visible]:ring-2 has-[[data-slot=radio-group-item]:focus-visible]:ring-focus-ring has-[[data-slot=radio-group-item]:focus-visible]:ring-offset-2 has-[[data-slot=radio-group-item]:focus-visible]:ring-offset-background",
                      isSel
                        // `primary-text`, bukan `primary`: maroon #800000 di atas kartu gelap
                        // #1a1a1a cuma 1,59:1 (SC 1.4.11 minta 3:1), dan radio ubin bank
                        // `sr-only` sehingga tepi + wash ini satu-satunya penanda bank terpilih.
                        // Wash 5 % mengikuti `Card/Pilihan` supaya dua lapis pilihan di layar
                        // yang sama memakai bahasa "terpilih" yang sama.
                        ? "border-2 border-primary-text bg-primary-text/5"
                        : "border-border hover:border-primary-text/40",
                    )}
                  >
                    <RadioGroupItem value={b} id={id} aria-label={b} className="sr-only" />
                    {brand.logo ? (
                      <span className="flex h-12 w-full items-center justify-center rounded-md bg-white px-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={brand.logo}
                          alt={b}
                          className="max-h-7 w-auto max-w-full object-contain"
                        />
                      </span>
                    ) : (
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
      </div>

      {/* Tabel rincian — selalu terbuka, tepat di atas tombol (Figma `2639:32255`). */}
      {(showTotal || hasBreakdown) && (
        <div className="flex flex-col gap-2">
          {hasBreakdown && Number.isFinite(rate) && rate > 0 && (
            // "Kurs terkunci" memakai `effectiveRate` (kurs dasar + spread), BUKAN `baseRate`:
            // itu angka yang benar-benar dipakai menghitung `subtotalIdr`. Countdown menempel di
            // sini karena inilah yang sebenarnya kedaluwarsa sebelum metode dipilih — kursnya.
            <FeeRow
              label={CHECKOUT_COPY.lockedRateLabel}
              value={
                <>
                  <span>{CHECKOUT_COPY.perUsdx(formatIDR(rate))}</span>
                  {countdown && (
                    <>
                      <Lock aria-hidden className="size-3.5 text-muted-foreground" />
                      {/* Figma tidak menuliskan label tenggatnya di sini — baris "Kurs terkunci"
                          sudah menyatakan apa yang habis. Tapi angka telanjang di samping ikon
                          gembok tidak terbaca pembaca layar sebagai tenggat apa pun, dan temuan
                          F2 lahir justru dari countdown yang tak jelas menghitung apa. Jadi
                          labelnya ada, cuma tidak memakan ruang. */}
                      <span className="sr-only">{CHECKOUT_COPY.countdownBeforeMethod}</span>
                      <span className="font-semibold tabular-nums">{countdown}</span>
                    </>
                  )}
                </>
              }
            />
          )}
          {hasBreakdown && (
            <>
              <FeeRow label={CHECKOUT_COPY.usdxValueLabel} value={formatIDR(subtotal)} />
              <FeeRow
                label={
                  mintFeePct
                    ? `${CHECKOUT_COPY.mintFeeLabel} (${mintFeePct}%)`
                    : CHECKOUT_COPY.mintFeeLabel
                }
                value={formatIDR(mintFee)}
              />
              <FeeRow label={feeLabelText} value={feeValue} />
            </>
          )}
          {showTotal && (
            <FeeRow
              label={TOTAL_LABEL}
              strong
              value={
                grandTotal != null
                  ? formatIDR(grandTotal)
                  : `${formatIDR(totalRange!.min)} – ${formatIDR(totalRange!.max)}`
              }
            />
          )}
          {showTotal && grandTotal == null && (
            <p className="text-xs text-muted-foreground">
              {CHECKOUT_COPY.totalDependsOnMethodNote}
            </p>
          )}
        </div>
      )}

      {payError && (
        <p role="alert" className="text-sm text-destructive-text">
          {payError}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
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
            size="lg"
            className="flex-1"
            disabled={!canPay}
            loading={isPaying}
            loadingLabel="Memproses…"
            onClick={() => channel && onPay(channel, bank)}
          >
            {CHECKOUT_COPY.payCta}
          </Button>
        </div>

        {/* Di BAWAH tombol, rata tengah (Figma `2639:31862`). Di atas tombol dan rata kiri, ia
            terbaca sebagai keterangan tabel biaya di atasnya, bukan sebagai alasan tombol yang
            di bawahnya mati. */}
        {(needsBank || channel === null) && (
          <p className="text-center text-xs text-muted-foreground">
            {needsBank ? CHECKOUT_COPY.pickBankHint : CHECKOUT_COPY.pickMethodHint}
          </p>
        )}
      </div>
    </div>
  );
}
