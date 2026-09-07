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
import { Badge } from "@/components/ui/badge";
import { BANK_BRAND, QRIS_RED, sortVaBanks } from "@/lib/constants";
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
  const banks = sortVaBanks(option.banks ?? []);
  return banks.length > 0
    ? banks.map((b) => BANK_BRAND[b]?.name ?? b).join(" · ")
    : CHECKOUT_COPY.vaDescriptionFallback;
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
  // TIDAK ADA yang dipilih sebelum orangnya memilih — persis Figma A1a (`2639:31807`:
  // "default (belum dipilih, tidak dipra-pilih)"), di dua lapisnya sekaligus.
  //
  // Sebelumnya di sini ada aturan F6 "metode/bank tunggal dipilih dari awal". Aturan itu
  // dicabut, karena premisnya sudah tidak ada dan akibatnya nyata:
  //  1. Premis "cuma satu pilihan". Backend dev memang mengirim satu channel, tapi layar ini
  //     selalu punya DUA kartu — kartu kedua "Transfer bank BNI" digambar permanen. Jadi
  //     `channels.length === 1` tidak lagi berarti "tidak ada yang bisa dipilih".
  //  2. Akibatnya. Dengan satu channel, layar terbuka dengan Virtual Account sudah tercentang
  //     dan langkah "pilih metode" terlewat sama sekali — layar A1a tidak pernah terlihat.
  //     Yang tersisa cuma tulisan "Pilih bank dulu untuk lanjut" di bawah kartu yang entah
  //     kenapa sudah menyala.
  //  3. Bank pun tidak lagi dipra-pilih walau cuma satu: ini rekening tujuan uang. Kalau
  //     tombol bayar hidup tanpa satu ketukan pun, tidak ada momen di mana orangnya
  //     menyatakan "ya, ke bank ini".
  const [channel, setChannel] = useState<PaymentChannel | null>(null);
  const [bank, setBank] = useState<VaBank | null>(null);

  function pickChannel(next: PaymentChannel) {
    setChannel(next);
    setBank(null);
  }

  const selected = channels.find((c) => c.channel === channel) ?? null;

  // Dua daftar, dua nasib (USDX-622). `banks` bisa dipilih; `disabledBanks` cuma ditampilkan.
  // Diurutkan lewat sortVaBanks yang sama supaya bank tidak berpindah tempat antar poll GET —
  // alasan urutan itu dipatok di FE sejak awal.
  //
  // Yang mati MENANG atas yang hidup kalau backend mengirim bank yang sama di kedua daftar.
  // Tanpa pengurangan ini, satu bank tampil dua kali dengan dua nasib di layar yang sama, dan
  // yang menang adalah salinan yang bisa diklik — persis bank yang kita tahu akan gagal di
  // `create-va`. Menolak sesuatu yang mestinya boleh cuma merepotkan; menerima sesuatu yang
  // mestinya ditolak memakan uang orang.
  const comingSoonBanks = sortVaBanks(selected?.disabledBanks ?? []);
  const comingSoonSet = new Set<VaBank>(comingSoonBanks);
  const activeBanks = sortVaBanks(selected?.banks ?? []).filter((b) => !comingSoonSet.has(b));

  // Pilihan bank direkonsiliasi tiap render, bukan cuma di-reset saat metode berganti.
  // `channels[]` datang dari GET yang bisa dimuat ulang: bank yang tadi hidup bisa berpindah ke
  // `disabledBanks` sesudah user memilihnya. Ubinnya lenyap dari layar tapi `bank` tetap
  // memegangnya, tombol bayar tetap hidup, dan `onPay` mengirim bank yang sudah mati tanpa
  // seorang pun melihatnya.
  const effectiveBank = bank !== null && activeBanks.includes(bank) ? bank : null;

  // VA yang tak menyisakan satu bank pun yang bisa dipilih bukan "belum memilih" — tak ada yang
  // bisa dipilih. Menyuruh orang "Pilih bank dulu untuk lanjut" di layar tanpa satu pun bank
  // adalah perintah yang mustahil dituruti.
  const noBankSelectable = channel === "VA" && activeBanks.length === 0;
  const needsBank = channel === "VA" && effectiveBank === null;
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
  // `>= 0`, BUKAN `> 0`. Biaya mint nol adalah nilai yang SAH — artinya gratis, bukan
  // artinya datanya belum ada. Dengan `> 0`, backend dev yang mengirim `mintFeePct: 0`
  // membuat SELURUH tabel rincian hilang: kurs terkunci beserta hitung mundurnya, nilai
  // USDX, biaya, semuanya — dan yang tersisa di layar tempat orang memutuskan membayar
  // cuma satu angka "Total bayar" tanpa penjelasan. Yang menentukan tabel ini layak
  // tampil adalah angkanya ADA dan masuk akal, bukan angkanya kebetulan positif.
  const hasBreakdown = [subtotal, mintFee].every((n) => Number.isFinite(n) && n >= 0) && subtotal > 0;

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

          {/* Kartu kedua Figma A1a/A1b (`2639:31820`), tanpa keterangan — badge-nya sudah
              menjelaskan. Sengaja TIDAK berasal dari `channels[]`: transfer bank langsung
              belum ada di backend, jadi tidak akan pernah muncul di sana, dan justru itu
              yang diberitahukan kartunya. Menyembunyikannya sampai backend siap berarti
              orang tetap bertanya-tanya apakah bisa transfer manual — pertanyaan yang
              sekarang dijawab di tempat pertanyaannya muncul.

              Mati beneran, bukan cuma pudar: `disabled` diteruskan ke `RadioGroupItem`, jadi
              Radix menandainya `data-disabled`, melepasnya dari roving focus, dan
              `RadioGroup` di repo ini menyaring `:not([disabled])` saat panah ditekan.
              Namanya untuk pembaca layar tetap lengkap — "Transfer bank BNI, Segera hadir" —
              karena teks badge ikut terbaca sebagai bagian dari label. */}
          <CardChoice
            value="TRANSFER_MANUAL"
            id="metode-transfer-manual"
            title={CHECKOUT_COPY.directTransferTitle}
            badge={CHECKOUT_COPY.comingSoonBadge}
            disabled
          />
        </RadioGroup>

        {/* Grup kedua, bukan grup bersarang. Ubinnya seperti desain (logo di atas plat putih,
            tepi brand + wash saat terpilih); radionya sendiri disembunyikan secara visual, dan
            yang membawa cincin fokus adalah ubinnya lewat `has-[...]`. Tanpa itu, fokus
            keyboard mendarat di lingkaran yang tak terlihat. */}
        {selected?.channel === "VA" && (activeBanks.length > 0 || comingSoonBanks.length > 0) && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {noBankSelectable ? CHECKOUT_COPY.noBankAvailableLabel : CHECKOUT_COPY.chooseBankLabel}
            </p>
            {/* Radiogroup tanpa satu pun opsi tetap diumumkan pembaca layar sebagai grup yang
                bisa dipilih. Kalau tak ada yang bisa dipilih, grupnya tidak dirender sama
                sekali — yang tersisa cuma daftar "segera hadir" di bawahnya, yang memang
                menjelaskan keadaannya. */}
            {activeBanks.length > 0 && (
            <RadioGroup
              value={effectiveBank ?? ""}
              onValueChange={(v) => setBank(v as VaBank)}
              aria-label={CHECKOUT_COPY.chooseBankLabel}
              className="grid-cols-3 gap-2"
            >
              {activeBanks.map((b) => {
                const brand = BANK_BRAND[b];
                const isSel = effectiveBank === b;
                const id = `bank-${b}`;
                return (
                  <label
                    key={b}
                    htmlFor={id}
                    className={cn(
                      // Ubin 64 · plat inset 8 · plat 48 (Figma `2639:32218`/`2639:32219`).
                      //
                      // Tepinya digambar sebagai bayangan INSET, bukan `border`. Border ikut
                      // menghitung tinggi: 64 − 8 − 8 − 1 − 1 menyisakan 46 untuk plat yang
                      // seharusnya 48, dan plat itu — flex item tanpa `shrink-0` — lalu
                      // menyusut mengikuti logonya (terukur 27,98 px) alih-alih melebihi
                      // kotaknya. Bayangan tidak memakan ruang, jadi 8 + 48 + 8 = 64 persis,
                      // dan tebalnya boleh berubah 1 → 2 saat terpilih tanpa menggeser apa pun.
                      "relative flex h-16 cursor-pointer items-center justify-center rounded-lg bg-card p-2 transition-control",
                      "has-[[data-slot=radio-group-item]:focus-visible]:ring-2 has-[[data-slot=radio-group-item]:focus-visible]:ring-focus-ring has-[[data-slot=radio-group-item]:focus-visible]:ring-offset-2 has-[[data-slot=radio-group-item]:focus-visible]:ring-offset-background",
                      isSel
                        // `primary-text`, bukan `primary`: maroon #800000 di atas kartu gelap
                        // #1a1a1a cuma 1,59:1 (SC 1.4.11 minta 3:1), dan radio ubin bank
                        // tersembunyi sehingga tepi + wash ini satu-satunya penanda bank
                        // terpilih. Wash 5 % mengikuti `Card/Pilihan` supaya dua lapis pilihan
                        // di layar yang sama memakai bahasa "terpilih" yang sama.
                        ? "bg-primary-text/5 shadow-[inset_0_0_0_2px_var(--color-primary-text)]"
                        : "shadow-[inset_0_0_0_1px_var(--color-border)] hover:shadow-[inset_0_0_0_1px_var(--color-primary-text)]",
                    )}
                  >
                    {/* Pembungkus `sr-only`, bukan `className="sr-only"` di itemnya.
                        `RadioGroupItem` membawa `relative size-5` di kelas dasarnya, dan
                        `sr-only` tidak menang atas keduanya (tailwind-merge menganggapnya grup
                        lain, lalu urutan CSS yang memutuskan). Akibatnya radio 20 px itu tetap
                        ikut tata letak dan mendorong logo 11 px ke bawah dari pusat ubin —
                        persis "logo nggak pas tengah kotak". Span pembungkus tak punya kelas
                        yang bertabrakan, jadi ia benar-benar keluar dari alur. */}
                    <span className="sr-only">
                      <RadioGroupItem value={b} id={id} aria-label={brand?.name ?? b} />
                    </span>
                    {brand?.logo ? (
                      <span className="flex h-12 w-full shrink-0 items-center justify-center rounded-md bg-white px-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={brand.logo!}
                          alt={brand?.name ?? b}
                          // 24 px, tinggi logo di Figma (`2639:32220`), di tengah plat 48.
                          className="max-h-6 w-auto max-w-full object-contain"
                        />
                      </span>
                    ) : (
                      <span className="flex h-12 w-full shrink-0 items-center justify-center rounded-md bg-white px-2">
                        <span
                          className="text-sm font-extrabold tracking-tight"
                          style={{ color: brand?.bg }}
                        >
                          {brand?.mark ?? b}
                        </span>
                      </span>
                    )}
                  </label>
                );
              })}
            </RadioGroup>
            )}

            {/* Bank yang belum diaktifkan penyedia (USDX-622). Ditampilkan, bukan disembunyikan:
                disembunyikan, pemegang rekening BNI/Mandiri/BRI mengira banknya tidak dilayani
                dan pergi — padahal Nobu open-loop dan bisa dibayar dari bank mana pun, dan
                ketiganya sedang dalam proses aktivasi.

                Grid terpisah, bukan ubin mati di dalam RadioGroup: radio yang tak bisa dipilih
                tetap ikut urutan panah keyboard dan tetap dibacakan sebagai pilihan. Sebagai
                daftar biasa, ia terbaca apa adanya — keterangan, bukan pilihan. */}
            {comingSoonBanks.length > 0 && (
              <ul className="grid grid-cols-3 gap-2" aria-label={CHECKOUT_COPY.bankComingSoonListLabel}>
                {comingSoonBanks.map((b) => {
                  const brand = BANK_BRAND[b];
                  return (
                    <li key={b} className="flex flex-col items-center gap-1">
                      <div
                        aria-hidden="true"
                        className="relative flex h-16 w-full items-center justify-center rounded-lg bg-card p-2 opacity-50 shadow-[inset_0_0_0_1px_var(--color-border)]"
                      >
                        <span className="flex h-12 w-full shrink-0 items-center justify-center rounded-md bg-white px-2">
                          {brand?.logo ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={brand.logo}
                              alt=""
                              className="max-h-6 w-auto max-w-full object-contain grayscale"
                            />
                          ) : (
                            <span
                              className="text-sm font-extrabold tracking-tight"
                              style={{ color: brand?.bg }}
                            >
                              {brand?.mark ?? b}
                            </span>
                          )}
                        </span>
                      </div>
                      {/* Nama banknya ikut dibacakan di sini, bukan cuma di gambar yang
                          `aria-hidden`, supaya pembaca layar tetap tahu bank apa yang belum ada.
                          Badge `coming-soon` yang sama dengan tombol Bridge/Send — satu bunyi
                          untuk "belum sekarang, tapi akan ada" di seluruh produk. */}
                      <span className="flex flex-col items-center gap-1">
                        <span className="text-[11px] leading-none text-muted-foreground">
                          {brand?.name ?? b}
                        </span>
                        <Badge tone="coming-soon">{CHECKOUT_COPY.bankComingSoonLabel}</Badge>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
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

      {/* gap 16, bukan 8: Figma menaruh baris tombol (`2639:31852`, berakhir di y 581) dan teks
          bantunya (`2639:31862`, y 597) pada irama 16 yang sama dengan seluruh isi kartu. */}
      <div className="flex flex-col gap-4">
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
            onClick={() => channel && onPay(channel, effectiveBank)}
          >
            {CHECKOUT_COPY.payCta}
          </Button>
        </div>

        {/* Di BAWAH tombol, rata tengah (Figma `2639:31862`). Di atas tombol dan rata kiri, ia
            terbaca sebagai keterangan tabel biaya di atasnya, bukan sebagai alasan tombol yang
            di bawahnya mati. */}
        {(needsBank || channel === null) && (
          <p className="text-center text-xs text-muted-foreground">
            {noBankSelectable
              ? CHECKOUT_COPY.noBankAvailableHint
              : needsBank
                ? CHECKOUT_COPY.pickBankHint
                : CHECKOUT_COPY.pickMethodHint}
          </p>
        )}
      </div>
    </div>
  );
}
