"use client";

// Checkout own-hosted refresh-safe (USDX-224 + UI selaras IDRX USDX-237). Render dari
// GET /v2/mint/{id}: countdown, order/pelanggan/wallet, pilih metode (REQUESTED) → POST
// /pay → instruksi bayar (VA grouped + warning / QRIS QR asli + unduh) + accordion cara
// bayar + status tracker; saat COMPLETED → layar sukses (jumlah USDX + tx on-chain + CTA).
// Standalone: "Kembali" pakai router.back() (user tiba via redirect dari app).
//
// Tugas 6 (catatan/TUGAS-6-PERBAIKI-CHECKOUT.md) menambah dua aturan yang menyangkut uang:
//  1. Banner "Mode simulasi" HANYA saat backend bilang paymentMode === "SIMULATION". Dulu
//     hardcoded — di dev (DurianPay SNAP sandbox) sudah salah, di prod ia akan memberi tahu
//     user yang mau transfer sungguhan bahwa uangnya tidak diproses.
//  2. PAID (belum COMPLETED) punya layarnya sendiri: konfirmasi "Pembayaran diterima", BUKAN
//     nomor VA + "Jumlah yang harus dibayar" — order menunggu multisig dan bisa lama, user
//     yang membaca tagihan lama itu bisa transfer dua kali.

import { useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Download,
  Loader2,
  QrCode,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import { useCheckout } from "@/hooks/useCheckout";
import { returnToApp } from "@/lib/auth/redirect";
import { PaymentMethodSelector } from "@/components/checkout/PaymentMethodSelector";
import { MintStatusTracker } from "@/components/checkout/MintStatusTracker";
import { BANK_BRAND, QRIS_RED } from "@/lib/constants";
import { CHECKOUT_COPY, TOTAL_LABEL } from "@/lib/checkout/copy";
import { Button } from "@/components/ui/button";
import { formatIDR, formatCountdown, formatWibDateTime, truncateAddress } from "@/lib/utils";
import type { MintChannelOption, MintOrderDetail, PaymentChannel } from "@/types";

// Kelompokkan digit per 4 biar nomor VA gampang dibaca (8878 4716 9037 8849).
function groupDigits(s: string): string {
  return s.replace(/(\d{4})(?=\d)/g, "$1 ");
}

// Link block explorer per chain (Phase 2 = Polygon). Mock: hash palsu, link tetap render.
function txExplorerUrl(chain: string, hash: string): string | null {
  return chain === "polygon" ? `https://polygonscan.com/tx/${hash}` : null;
}

// Metode bayar HANYA dari backend — ia yang tahu adapter aktif menerima apa. Dulu ada fallback
// daftar statis 9 bank + QRIS di sini; di bawah DurianPay SNAP (VA BNI/MANDIRI/BRI saja) itu
// menawarkan 7 pilihan yang pasti ditolak. Daftar kosong → suruh muat ulang, jangan menebak.
function resolveChannels(order: MintOrderDetail): MintChannelOption[] {
  return order.channels ?? [];
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-4 rounded-xl border border-border bg-card p-5">
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 font-medium text-foreground">{children}</span>
    </div>
  );
}

// Dua pembungkus tipis di atas `ui/button` — bukan gaya sendiri. Yang hilang bersama tombol
// mentah bukan kerapian, melainkan indikator fokus keyboard (temuan C2): tak satu pun dari 20
// tombol mentah di repo ini punya `focus-visible`, dan di halaman yang memindahkan uang, orang
// yang kehilangan jejak posisi kursornya bisa menekan tombol yang salah.
function BackButton({ onClick, label = "Kembali" }: { onClick: () => void; label?: string }) {
  return (
    <Button type="button" variant="outline" onClick={onClick}>
      {label}
    </Button>
  );
}

function PrimaryButton({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Button type="button" variant="brand" onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}

// Accordion ringan pakai <details> native — aksesibel, tanpa state.
function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-medium text-foreground">
        {title}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        {children}
      </div>
    </details>
  );
}

function QrisInstruction({ order }: { order: MintOrderDetail }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  function download() {
    const canvas = wrapRef.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qris-${order.orderNumber}.png`;
    a.click();
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-5 text-center">
      <div className="flex items-center gap-2">
        <span
          className="flex size-7 items-center justify-center rounded-md"
          style={{ backgroundColor: QRIS_RED }}
        >
          <QrCode className="size-4 text-white" />
        </span>
        <span className="text-sm font-extrabold tracking-tight text-foreground">QRIS</span>
      </div>
      <div ref={wrapRef} className="rounded-lg border border-border bg-white p-3">
        <QRCodeCanvas value={order.paymentUrl ?? order.orderNumber} size={180} level="M" />
      </div>
      {order.totalPayIdr && (
        <span className="text-lg font-semibold text-foreground">
          {formatIDR(Number(order.totalPayIdr))}
        </span>
      )}
      <span className="text-xs text-muted-foreground">
        Scan QR ini di aplikasi bank / e-wallet kamu.
      </span>
      <Button type="button" variant="outline" size="sm" onClick={download}>
        <Download /> Unduh QR Code
      </Button>
    </div>
  );
}

function PaymentInstructions({
  order,
  onCopy,
}: {
  order: MintOrderDetail;
  onCopy: (text: string) => void;
}) {
  if (order.paymentChannel === "QRIS") return <QrisInstruction order={order} />;

  const bankBrand = order.paymentBank ? BANK_BRAND[order.paymentBank] : null;
  return (
    <div className="flex flex-col gap-3">
      {/* Logo bank sudah memuat nama banknya sendiri — menuliskannya lagi bikin "BCA BCA".
          Nama tetap ada untuk pembaca layar lewat alt. Badge singkatan (tanpa logo) TIDAK
          selalu terbaca ("MDR", "PRM"), jadi di jalur itu namanya tetap ditulis. */}
      {order.paymentBank && bankBrand && (
        <Row label="Virtual Account">
          {bankBrand.logo ? (
            <span className="flex h-6 items-center justify-center rounded bg-white px-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bankBrand.logo}
                alt={order.paymentBank}
                className="max-h-4 w-auto object-contain"
              />
            </span>
          ) : (
            <>
              <span
                className="flex h-6 w-9 items-center justify-center rounded text-xs font-extrabold tracking-tight"
                style={{ backgroundColor: bankBrand.bg, color: bankBrand.fg }}
              >
                {bankBrand.mark}
              </span>
              {order.paymentBank}
            </>
          )}
        </Row>
      )}

      <div>
        <p className="mb-1 text-xs text-muted-foreground">Nomor Virtual Account</p>
        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted p-3">
          <span className="font-mono text-base font-semibold tracking-wider text-foreground">
            {order.virtualAccountNo ? groupDigits(order.virtualAccountNo) : "—"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => order.virtualAccountNo && onCopy(order.virtualAccountNo)}
            aria-label="Salin"
            className="text-muted-foreground"
          >
            <Copy />
          </Button>
        </div>
      </div>

      {order.totalPayIdr && (
        <div>
          {/* Satu nama untuk angka yang sama (D5). Ringkasan di atas menyembunyikan barisnya
              selama layar ini tampil, jadi "Total bayar" hanya terbaca sekali. */}
          <p className="mb-1 text-xs text-muted-foreground">{TOTAL_LABEL}</p>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-muted p-3">
            <span className="text-base font-semibold text-foreground">
              {formatIDR(Number(order.totalPayIdr))}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => order.totalPayIdr && onCopy(order.totalPayIdr)}
              aria-label="Salin"
              className="text-muted-foreground"
            >
              <Copy />
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-warning-text">
            Transfer nominal <span className="font-semibold">persis</span> seperti di atas. Kurang
            atau lebih akan ditandai underpaid/overpaid dan mint ditahan untuk review.
          </p>
        </div>
      )}
    </div>
  );
}

function HowToPay({
  channel,
  isSimulation,
}: {
  channel: PaymentChannel | null;
  isSimulation: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-foreground">Cara pembayaran</p>
      {channel === "QRIS" ? (
        <Accordion title="Cara bayar dengan QRIS">
          <ol className="list-decimal space-y-1 pl-4">
            <li>Buka aplikasi bank / e-wallet yang mendukung QRIS.</li>
            <li>Pilih menu Scan / Bayar, lalu scan QR di atas.</li>
            <li>Pastikan nominal sesuai, lalu konfirmasi pembayaran.</li>
          </ol>
        </Accordion>
      ) : (
        <>
          <Accordion title="Transfer dari bank lain (antar bank)">
            <ol className="list-decimal space-y-1 pl-4">
              <li>Pilih menu Transfer → Antar Bank / Virtual Account.</li>
              <li>Masukkan nomor Virtual Account di atas.</li>
              <li>Pastikan nama &amp; nominal sesuai, lalu konfirmasi.</li>
            </ol>
          </Accordion>
          <Accordion title="ATM / Mobile Banking">
            <ol className="list-decimal space-y-1 pl-4">
              <li>Pilih menu Bayar / Pembelian → Virtual Account.</li>
              <li>Masukkan nomor Virtual Account, cek nominal, lalu konfirmasi.</li>
            </ol>
          </Accordion>
        </>
      )}
      <Accordion title="Catatan penting">
        <ul className="list-disc space-y-1 pl-4">
          <li>Pastikan nama rekening sama dengan nama di akun USDX.</li>
          <li>Transfer nominal persis seperti tertera.</li>
          <li>Saldo USDX masuk otomatis setelah pembayaran terkonfirmasi.</li>
          {isSimulation && <li>Mode simulasi — pembayaran tidak diproses ke bank sungguhan.</li>}
        </ul>
      </Accordion>
    </div>
  );
}

// Baris ringkas di dalam accordion (bukan <Row>: teksnya kecil & tak boleh menyaingi
// konfirmasi pembayaran di atasnya).
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span>{label}</span>
      <span className="flex items-center gap-1.5 font-medium text-foreground">{children}</span>
    </div>
  );
}

// Rincian dari "Nilai pesanan" ke "Total yang dibayar" — dua angka itu tampil bersebelahan di
// ringkasan dan selisihnya (biaya layanan PG, plus kode unik pada provider yang memakainya)
// harus bisa ditelusuri, bukan bikin user menebak. Sisa dihitung dari selisih supaya baris-
// barisnya selalu menjumlah ke total yang benar-benar ditagih.
function FeeBreakdown({ order }: { order: MintOrderDetail }) {
  const subtotal = Number(order.subtotalIdr);
  const mintFee = Number(order.mintFeeIdr);
  const total = Number(order.totalPayIdr);
  // pgFeeIdr null = biaya layanannya BELUM diketahui, bukan nol. Menampilkannya sebagai "Rp 0"
  // lalu melempar selisihnya ke baris "Kode unik" akan salah melabeli biaya PG — lebih baik
  // barisnya tidak ditampilkan sama sekali dan sisanya diberi label netral.
  const pgFeeKnown = order.pgFeeIdr !== null && Number.isFinite(Number(order.pgFeeIdr));
  const pgFee = pgFeeKnown ? Number(order.pgFeeIdr) : 0;
  if (![subtotal, mintFee, total].every(Number.isFinite)) return null;
  const residual = Math.round(total - subtotal - mintFee - pgFee);

  return (
    <Accordion title="Rincian biaya">
      <DetailRow label="Nilai USDX">{formatIDR(subtotal)}</DetailRow>
      <DetailRow label={`Biaya mint (${order.mintFeePct}%)`}>{formatIDR(mintFee)}</DetailRow>
      {pgFeeKnown && (
        <DetailRow label="Biaya layanan pembayaran">{formatIDR(pgFee)}</DetailRow>
      )}
      {/* Provider yang memakai kode unik (BNI) menempelkannya ke total — tanpa baris ini
          rincian tidak menjumlah ke angka yang benar-benar ditagih. Sisa NEGATIF mustahil
          sebagai kode unik, jadi labelnya netral: kami tak mengarang sebabnya. */}
      {residual !== 0 && (
        <DetailRow label={pgFeeKnown && residual > 0 ? "Kode unik" : "Penyesuaian"}>
          {formatIDR(residual)}
        </DetailRow>
      )}
      <div className="mt-1 border-t border-border pt-1">
        <DetailRow label={TOTAL_LABEL}>{formatIDR(total)}</DetailRow>
      </div>
    </Accordion>
  );
}

// Sudah dibayar, belum selesai on-chain (menunggu persetujuan multisig — bisa lama). Instruksi
// transfer TIDAK boleh tetap dominan di sini: nomor VA + "Jumlah yang harus dibayar" membuat user
// yang sudah transfer membaca tagihan yang sama dan berpotensi bayar dua kali. Nomor VA tetap
// tersedia sebagai rujukan, tapi dilipat dan tanpa satu pun kalimat perintah bayar.
// Rujukan pasca-bayar — dilipat, tanpa satu pun kalimat perintah bayar. Dipakai bersama oleh
// keadaan "diterima" dan "ditinjau".
function PaymentDetails({
  order,
  onCopy,
}: {
  order: MintOrderDetail;
  onCopy: (text: string) => void;
}) {
  const paidAt = formatWibDateTime(order.paidAt);
  return (
    <Accordion title="Detail pembayaran">
      {order.paymentChannel === "QRIS" ? (
        <DetailRow label="Metode">QRIS</DetailRow>
      ) : (
        // paymentChannel bisa null pada data lama/aneh — jangan mengarang "Virtual Account".
        <>
          {order.paymentChannel === "VA" && (
            <DetailRow label="Metode">
              Virtual Account{order.paymentBank ? ` ${order.paymentBank}` : ""}
            </DetailRow>
          )}
          {order.virtualAccountNo && (
            <DetailRow label="Nomor Virtual Account">
              <span className="font-mono">{groupDigits(order.virtualAccountNo)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onCopy(order.virtualAccountNo!)}
                aria-label="Salin nomor Virtual Account"
                className="text-muted-foreground"
              >
                <Copy />
              </Button>
            </DetailRow>
          )}
        </>
      )}
      <DetailRow label="Nomor pesanan">{order.orderNumber}</DetailRow>
      {paidAt && <DetailRow label="Waktu pembayaran">{paidAt}</DetailRow>}
    </Accordion>
  );
}

// Teks di dalam blok hero BERTINT tidak boleh memakai `--muted-foreground`: tint 10 % sudah
// menggelapkan latarnya tanpa menggelapkan teksnya, dan hasilnya 4,25:1 — di bawah AA, tepat
// pada kalimat yang menyangkut uang. Token solid `foreground` dipakai — BUKAN `foreground/80`: nilai ber-alpha keluar sebagai
// `color-mix()`, dan itu menyulitkan pengukuran ulang di kemudian hari tanpa memberi manfaat.
function PaidState({
  order,
  onCopy,
  onBack,
}: {
  order: MintOrderDetail;
  onCopy: (text: string) => void;
  onBack: () => void;
}) {
  // Mint yang gagal SETELAH uang masuk (multisig REJECTED) tidak lagi lewat sini: ia punya
  // layarnya sendiri, `FailedPaidState` (B4). Dulu keadaan itu ditampung di sini dengan satu
  // kalimat yang berbeda di bawah judul hijau yang sama — dan judul yang menang dibaca.
  const paidAt = formatWibDateTime(order.paidAt);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1.5 rounded-xl bg-success/10 p-4 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-success/15 text-success-text">
          <CheckCircle2 className="size-6" />
        </span>
        <p className="text-sm font-semibold text-foreground">Pembayaran diterima</p>
        {order.totalPayIdr && (
          <p className="text-lg font-semibold text-foreground">
            {formatIDR(Number(order.totalPayIdr))}
          </p>
        )}
        {paidAt && <p className="text-xs text-foreground">{paidAt}</p>}
        <p className="text-xs leading-relaxed text-foreground">
          Tidak perlu transfer lagi. Pesanan kamu sedang diproses.
        </p>
      </div>

      <MintStatusTracker order={order} />

      <PaymentDetails order={order} onCopy={onCopy} />

      {/* Layar ini bilang "halaman boleh ditutup" — tanpa tombol ini user disuruh pulang tanpa
          diberi jalan pulang. Proses on-chain menunggu multisig dan bisa berjam-jam, jadi tempat
          menunggunya di app (yang punya notifikasi), bukan di tab checkout yang dibiarkan terbuka. */}
      <Button type="button" variant="brand" onClick={onBack}>
        {CHECKOUT_COPY.backToAppCta}
      </Button>
    </div>
  );
}

/**
 * Nomor pesanan sebagai RUJUKAN yang bisa disalin.
 *
 * Ini yang menggantikan tombol "Hubungi dukungan" pada desain layar gagal (Figma `50` blok C).
 * Salurannya belum ada di kode — tidak ada alamat email dukungan, tidak ada tautan chat, tidak
 * ada nomor telepon. Tombol yang tidak menuju ke mana-mana di layar tempat uang user tertahan
 * bukan sekadar mati: ia janji palsu. Yang benar-benar bisa dipakai user hari ini adalah nomor
 * pesanannya — lewat kanal apa pun yang nanti dia temukan.
 */
function OrderReference({ order, onCopy }: { order: MintOrderDetail; onCopy: (t: string) => void }) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{CHECKOUT_COPY.orderReferenceLabel}</p>
      <div className="flex items-center justify-between gap-2 rounded-lg bg-muted p-3">
        <span className="font-mono text-sm font-semibold text-foreground">{order.orderNumber}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onCopy(order.orderNumber)}
          aria-label={CHECKOUT_COPY.copyAriaLabel}
          className="text-muted-foreground"
        >
          <Copy />
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{CHECKOUT_COPY.orderReferenceNote}</p>
    </div>
  );
}

/**
 * Uang SUDAH masuk, pesanannya GAGAL. Temuan audit B4, dan yang paling berbahaya dari semuanya.
 *
 * DUA jalan sampai ke sini, dan nasib uangnya berbeda — jadi kalimatnya juga (`sot/conventions.md
 * § Status Enums`, `sot/bni-integration.md §6`):
 *
 *   PAID + FAILED   Pembayaran cocok, mint ditolak multisig sesudahnya. Dana ada di kami dan
 *                   ditangani lewat jalur pesanan ini.
 *   HELD + FAILED   Ops MENOLAK kredit yang ditahan; `payment_status` tetap `HELD` karena enum-nya
 *                   tak punya `FAILED` dan uangnya memang masuk. Refund IDR **manual** oleh
 *                   treasury — tak ada auto-refund. Ini yang dulu keliru dirender sebagai
 *                   "sedang ditinjau": reviewnya sudah selesai, dan hasilnya tolak.
 *
 * Dulu keadaan ini jatuh ke `PaidState` dan berbunyi "Pembayaran diterima" di atas blok hijau —
 * PERSIS sama dengan pesanan sehat, dengan satu kalimat kecil yang berbeda. Orang membaca warna
 * dan judul, bukan kalimat keempat; hasilnya user mengira pesanannya aman padahal sudah mati.
 *
 * Tiga hal yang membedakannya sekarang, mengikuti Figma `50` blok C: judul menyebut yang gagal
 * ("Pengiriman USDX gagal"), nadanya destructive bukan success, dan nasib uangnya dinyatakan
 * terang-terangan — sudah diterima, tercatat, jangan transfer lagi.
 */
function FailedPaidState({
  order,
  onCopy,
  onBack,
}: {
  order: MintOrderDetail;
  onCopy: (text: string) => void;
  onBack: () => void;
}) {
  const paidAt = formatWibDateTime(order.paidAt);
  // Kredit yang ditolak ops: nominal yang benar-benar masuk TIDAK dikirim ke FE (justru
  // ketidakcocokannya yang menyeret order ke HELD), jadi tak ada angka yang boleh diklaim.
  const rejectedHeld = order.paymentStatus === "HELD";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1.5 rounded-xl bg-destructive/10 p-4 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-destructive/15 text-destructive-text">
          <XCircle className="size-6" />
        </span>
        <p className="text-sm font-semibold text-destructive-text">
          {rejectedHeld ? CHECKOUT_COPY.heldRejectedHeading : CHECKOUT_COPY.failedPaidHeading}
        </p>
        {!rejectedHeld && order.totalPayIdr && (
          <p className="text-lg font-semibold text-foreground">
            {CHECKOUT_COPY.failedPaidAmount(formatIDR(Number(order.totalPayIdr)))}
          </p>
        )}
        {paidAt && <p className="text-xs text-foreground">{paidAt}</p>}
        <p className="text-xs leading-relaxed text-foreground">
          {rejectedHeld ? CHECKOUT_COPY.heldRejectedBodyLead : CHECKOUT_COPY.failedPaidBodyLead}{" "}
          <span className="font-semibold text-foreground">
            {rejectedHeld
              ? CHECKOUT_COPY.heldRejectedBodyWarning
              : CHECKOUT_COPY.failedPaidBodyWarning}
          </span>{" "}
          {rejectedHeld ? CHECKOUT_COPY.heldRejectedBodyTail : CHECKOUT_COPY.failedPaidBodyTail}
        </p>
      </div>

      <MintStatusTracker order={order} />

      <OrderReference order={order} onCopy={onCopy} />

      <PaymentDetails order={order} onCopy={onCopy} />

      <BackButton onClick={onBack} label={CHECKOUT_COPY.backToAppCta} />
    </div>
  );
}

// paymentStatus HELD — transfer SUDAH masuk tapi tak bisa dicocokkan otomatis (nominal kurang/
// lebih, telat, atau dobel; sot/bni-integration.md §6). Ini justru populasi paling rawan transfer
// ulang, jadi tagihan wajib hilang. Alasan penahanan (held_reason) tidak dikirim ke FE, jadi
// teksnya sengaja tidak menebak-nebak sebabnya.
function HeldState({
  order,
  onCopy,
  onBack,
}: {
  order: MintOrderDetail;
  onCopy: (text: string) => void;
  onBack: () => void;
}) {
  const paidAt = formatWibDateTime(order.paidAt);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1.5 rounded-xl bg-warning/10 p-4 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-warning/15 text-warning-text">
          <Clock className="size-6" />
        </span>
        <p className="text-sm font-semibold text-foreground">Pembayaran sedang ditinjau</p>
        {paidAt && <p className="text-xs text-foreground">{paidAt}</p>}
        <p className="text-xs leading-relaxed text-foreground">
          Transfer kamu sudah kami terima, tapi belum cocok otomatis dengan pesanan ini. Tim kami
          sedang memeriksanya. <span className="font-semibold">Jangan transfer lagi.</span>
        </p>
      </div>

      {/* Sama seperti layar gagal: nomor pesanan sebagai rujukan, BUKAN "hubungi dukungan" yang
          salurannya belum ada di kode. */}
      <OrderReference order={order} onCopy={onCopy} />

      <PaymentDetails order={order} onCopy={onCopy} />

      <BackButton onClick={onBack} label={CHECKOUT_COPY.backToAppCta} />
    </div>
  );
}

// Order sudah mati sebelum uang masuk: jendela bayar habis, atau backend menutupnya. VA-nya tak
// berlaku lagi — layar ini menggantikan tagihan supaya tak ada yang transfer ke nomor mati.
function DeadState({ order, onBack }: { order: MintOrderDetail; onBack: () => void }) {
  // Dua sebab yang bisa dibedakan user: kehabisan waktu bayar, atau order digagalkan backend
  // karena hal lain. paymentStatus EXPIRED = sebab pertama; timer klien yang habis juga (status
  // di backend belum sempat berubah).
  const gagalBukanKedaluwarsa = order.status === "FAILED" && order.paymentStatus !== "EXPIRED";
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <p className="text-sm font-medium text-destructive-text">
        {gagalBukanKedaluwarsa ? "Transaksi gagal." : "Pesanan kedaluwarsa."}
      </p>
      <p className="text-xs text-muted-foreground">
        Nomor Virtual Account pesanan ini sudah tidak berlaku. Mulai pesanan baru dari aplikasi
        USDX.
      </p>
      <BackButton onClick={onBack} />
    </div>
  );
}

/**
 * Pesanan tak bisa ditampilkan — dan SEBABNYA menentukan apa yang boleh dikatakan (B5, B14).
 *
 * Dulu 404, 500, jaringan mati, dan URL salah ketik sama-sama berbunyi "Pesanan tidak ditemukan
 * atau sesi tidak valid" tanpa satu tombol pun. Untuk 500 kalimat itu bukan cuma tidak membantu,
 * ia salah: pesanannya mungkin ada, uangnya mungkin sudah bergerak, dan yang dibutuhkan user
 * cuma memuat ulang.
 */
function LoadFailedState({
  kind,
  onRetry,
  isRetrying,
  onBack,
}: {
  kind: "malformed-id" | "not-found" | "unavailable";
  onRetry: () => void;
  isRetrying: boolean;
  /** Pulang ke `app` — mendarat di Riwayat, tempat pesanannya benar-benar terlihat. */
  onBack: () => void;
}) {
  if (kind === "unavailable") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive-text">
          <AlertCircle className="size-6" />
        </span>
        <p className="text-sm font-semibold text-foreground">
          {CHECKOUT_COPY.unavailableHeading}
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {CHECKOUT_COPY.unavailableBody}
        </p>
        <PrimaryButton onClick={onRetry} disabled={isRetrying}>
          <RefreshCw className={isRetrying ? "size-4 animate-spin" : "size-4"} />
          {isRetrying ? CHECKOUT_COPY.retryingCta : CHECKOUT_COPY.retryCta}
        </PrimaryButton>
        <Button type="button" variant="link" onClick={onBack}>
          {CHECKOUT_COPY.backToAppCta}
        </Button>
      </div>
    );
  }

  const notFound = kind === "not-found";
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive-text">
        <XCircle className="size-6" />
      </span>
      <p className="text-sm font-semibold text-foreground">
        {notFound ? CHECKOUT_COPY.notFoundHeading : CHECKOUT_COPY.malformedIdHeading}
      </p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {notFound ? CHECKOUT_COPY.notFoundBody : CHECKOUT_COPY.malformedIdBody}
      </p>
      <BackButton onClick={onBack} label={CHECKOUT_COPY.openHistoryCta} />
    </div>
  );
}

function SuccessState({ order, onBack }: { order: MintOrderDetail; onBack: () => void }) {
  const explorer = order.onChainTxHash ? txExplorerUrl(order.chain, order.onChainTxHash) : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-success/10 text-success-text">
          <CheckCircle2 className="size-8" />
        </span>
        <p className="text-base font-semibold text-foreground">Mint Berhasil</p>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{Number(order.amount)} USDX</span> sudah
          dikirim ke wallet kamu.
        </p>
      </div>

      <MintStatusTracker order={order} />

      {explorer && order.onChainTxHash && (
        <Row label="Tx on-chain">
          <a
            href={explorer}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-primary-text hover:underline"
          >
            {truncateAddress(order.onChainTxHash, 6)}
          </a>
        </Row>
      )}

      <Button type="button" variant="brand" onClick={onBack}>
        {CHECKOUT_COPY.backToAppCta}
      </Button>
    </div>
  );
}

export function CheckoutContent() {
  const router = useRouter();
  const params = useParams<{ orderId: string }>();
  const id = params.orderId;
  const {
    order,
    isLoading,
    isError,
    errorKind,
    isUnauthorized,
    retry,
    isRetrying,
    pay,
    isPaying,
    payError,
    secondsLeft,
    isExpired,
    deadlineExtended,
  } = useCheckout(id);

  function copy(text: string) {
    navigator.clipboard?.writeText(text);
    toast.success("Disalin");
  }

  // Keluar dari checkout setelah pesanan tak lagi menunggu tindakan user. Navigasi PENUH ke app
  // (lihat returnToApp) — `router.back()` memulihkan tab app apa adanya, termasuk modal
  // "Ringkasan Transaksi" yang masih terbuka, sehingga user yang sudah bayar disodori tombol
  // "Lanjut Pembayaran" lagi. `router.back()` disisakan untuk lingkungan tanpa NEXT_PUBLIC_APP_URL.
  function backToApp() {
    if (!returnToApp()) router.back();
  }

  // "Mint Berhasil" HANYA saat order COMPLETED DAN tx on-chain terbukti (onChainTxHash) —
  // PAID/WAITING_FOR_APPROVAL tetap tampil "sedang diproses" (USDX-293).
  const isCompleted = order?.status === "COMPLETED" && Boolean(order?.onChainTxHash);
  // Uang user SUDAH bergerak. PAID = cocok; HELD = masuk tapi ditahan untuk ditinjau (nominal
  // tak cocok / telat / dobel). Dua-duanya haram menampilkan tagihan lagi — justru populasi HELD
  // yang paling rawan transfer ulang.
  const moneyIn = order?.paymentStatus === "PAID" || order?.paymentStatus === "HELD";
  // Order sudah mati: timer klien habis, ATAU backend menutupnya (Expiry Handler menulis
  // paymentStatus=EXPIRED + status=FAILED sekaligus, jadi `isExpired` yang di-guard !isTerminal
  // tak pernah menyala untuk kasus itu). VA-nya tak berlaku lagi — jangan tampilkan tagihan.
  // `status === "COMPLETED"` MENGGUGURKAN "mati": order yang sudah selesai tapi jendela bayarnya
  // lewat (`paymentStatus=EXPIRED`) bukan pesanan kedaluwarsa — dan menyebutnya begitu membuat
  // orang mengira pesanan yang sudah jadi itu hangus.
  const isDead =
    Boolean(order) &&
    order!.status !== "COMPLETED" &&
    (isExpired || order!.status === "FAILED" || order!.paymentStatus === "EXPIRED");
  // Uang masuk TAPI pesanannya gagal (B4). Dicabut dari `moneyIn` supaya tidak lagi memakai layar
  // hijau "Pembayaran diterima" yang identik dengan pesanan sehat.
  //
  // HELD ikut, dan itu bukan kelonggaran: `sot/conventions.md § Status Enums` + `bni-integration.md
  // §6` menyatakan ops yang MENOLAK kredit menulis `status=FAILED` sementara `payment_status`
  // TETAP `HELD`. Memeriksa `PAID` saja membuat keadaan itu jatuh ke layar "sedang ditinjau" —
  // padahal reviewnya sudah selesai, hasilnya tolak, dan dananya menunggu refund manual.
  const failedAfterMoneyIn = Boolean(moneyIn) && order?.status === "FAILED";
  // Satu-satunya keadaan yang boleh menampilkan tagihan. Enum baru dari backend TIDAK boleh
  // jatuh ke sini (temuan validator no. 4): menyuruh transfer untuk keadaan yang tak kita pahami
  // adalah fallback termahal yang bisa dipilih.
  const awaitingPayment = order?.paymentStatus === "WAITING_FOR_PAYMENT";
  // Countdown = sisa waktu BAYAR. Setelah uang masuk / order mati ia tak punya arti.
  const showCountdown =
    Boolean(order) &&
    !moneyIn &&
    !isDead &&
    order!.status !== "COMPLETED" &&
    (awaitingPayment || order!.paymentStatus === "REQUESTED");
  // Sebelum metode dipilih, `expiresAt` = batas hidup ORDER. Sesudah /pay ia diganti batas hidup
  // instrumen bayar (VA/QRIS) yang jauh lebih panjang — satu label untuk dua tenggat itulah yang
  // membuat angkanya terlihat melompat (F2). Jadi labelnya ikut berganti bersama artinya.
  const beforeMethod = order?.paymentStatus === "REQUESTED";
  // Instruksi bayar sedang tampil → di situ "Total bayar" sudah tercetak besar; barisnya di
  // ringkasan disembunyikan supaya satu angka tidak muncul dua kali dengan dua nama (D5).
  const showInstructions =
    Boolean(order) && !isCompleted && !moneyIn && !isDead && Boolean(awaitingPayment);
  // Perbandingan ketat: field absen (backend lama) atau nilai tak dikenal → diperlakukan LIVE,
  // banner simulasi TIDAK tampil. Salah tampil di dev cuma bikin bingung; salah tampil di prod
  // memberi tahu user bahwa transfer sungguhannya tidak diproses.
  const isSimulation = order?.paymentMode === "SIMULATION";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col gap-4 px-4 py-8">
      {isLoading ? (
        <Card>
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" /> Memuat pesanan…
          </div>
        </Card>
      ) : isUnauthorized ? (
        // Sesi checkout kedaluwarsa (code handoff invalid/kedaluwarsa/terpakai, atau
        // token sesi dicabut). Prod: hook sudah redirect ke `app`; layar ini muncul
        // saat redirect no-op (mis. localhost tanpa NEXT_PUBLIC_APP_URL). USDX-378.
        <Card>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm font-medium text-destructive-text">Sesi checkout kedaluwarsa</p>
            <p className="text-sm text-muted-foreground">
              Buka ulang halaman ini dari aplikasi USDX untuk melanjutkan.
            </p>
            <BackButton onClick={() => router.back()} />
          </div>
        </Card>
      ) : isError || !order ? (
        <Card>
          <LoadFailedState
            kind={errorKind}
            onRetry={retry}
            isRetrying={isRetrying}
            onBack={backToApp}
          />
        </Card>
      ) : (
        <>
          {showCountdown && (
            <div className="flex flex-col gap-1 rounded-lg bg-primary/5 px-4 py-2.5 text-center text-sm text-foreground">
              <span>
                {beforeMethod
                  ? CHECKOUT_COPY.countdownBeforeMethod
                  : CHECKOUT_COPY.countdownAfterMethod(order.paymentChannel)}{" "}
                <span className="font-semibold tabular-nums">{formatCountdown(secondsLeft)}</span>
              </span>
              {/* Lompatan angkanya diakui, bukan disembunyikan — dan hanya kepada orang yang
                  benar-benar menyaksikannya di tab ini (F2). */}
              {!beforeMethod && deadlineExtended && (
                <span className="text-xs text-muted-foreground">
                  {CHECKOUT_COPY.countdownExtendedNote(order.paymentChannel)}
                </span>
              )}
            </div>
          )}

          <Card>
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-medium text-foreground">Minting USDX</h2>
              <p className="text-xs text-muted-foreground">Pesanan #{order.orderNumber}</p>
            </div>

            {/* Dua angka, dua nama berbeda: "Nilai pesanan" (sebelum biaya layanan PG) vs
                "Total bayar" (yang benar-benar ditagih). Dulu keduanya sama-sama disebut
                "pembayaran" dengan angka berbeda — pemicu ragu tepat di layar bayar. */}
            <Row label="Nilai pesanan">{formatIDR(Number(order.totalBeforePgFeeIdr))}</Row>
            {order.totalPayIdr && (
              <>
                {!showInstructions && (
                  <Row label={TOTAL_LABEL}>{formatIDR(Number(order.totalPayIdr))}</Row>
                )}
                <FeeBreakdown order={order} />
              </>
            )}
            <div className="border-t border-border" />
            <Row label="Nama Lengkap">{order.customerName}</Row>
            <Row label="Wallet Tujuan">
              <span className="font-mono text-xs">
                {order.chain} · {truncateAddress(order.userAddress)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => copy(order.userAddress)}
                aria-label="Salin"
                className="text-muted-foreground"
              >
                <Copy />
              </Button>
            </Row>

            <div className="border-t border-border" />

            {/* Urutan cabang mengikuti "di mana uangnya", bukan sekadar enum: sudah selesai →
                uang masuk tapi pesanan gagal → uang sudah masuk → order mati → belum pilih
                metode → sisanya menunggu bayar.
                `moneyIn` sengaja MENDAHULUI `isDead`: order PAID yang mint-nya gagal tetap harus
                menampilkan bahwa uangnya diterima, bukan "Pesanan kedaluwarsa" yang bikin user
                mengira uangnya hangus. Yang berubah (B4): keadaan itu tidak lagi memakai layar
                hijau yang sama dengan pesanan sehat, melainkan layarnya sendiri. */}
            {isCompleted ? (
              <SuccessState order={order} onBack={backToApp} />
            ) : failedAfterMoneyIn ? (
              <FailedPaidState order={order} onCopy={copy} onBack={backToApp} />
            ) : moneyIn ? (
              order.paymentStatus === "HELD" ? (
                <HeldState order={order} onCopy={copy} onBack={backToApp} />
              ) : (
                <PaidState order={order} onCopy={copy} onBack={backToApp} />
              )
            ) : isDead ? (
              <DeadState order={order} onBack={backToApp} />
            ) : order.paymentStatus === "REQUESTED" && resolveChannels(order).length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Metode pembayaran belum tersedia. Muat ulang halaman ini sebentar lagi.
                </p>
                <BackButton onClick={() => router.back()} />
              </div>
            ) : order.paymentStatus === "REQUESTED" ? (
              <PaymentMethodSelector
                channels={resolveChannels(order)}
                totalBeforePgFeeIdr={order.totalBeforePgFeeIdr}
                isPaying={isPaying}
                payError={payError}
                onPay={(channel, bank) => {
                  pay(channel, bank).catch(() => {});
                }}
                onCancel={() => router.back()}
              />
            ) : !awaitingPayment ? (
              // Fallback aman untuk keadaan yang tak dikenal (enum baru, kombinasi kontradiktif).
              // Yang penting di sini adalah apa yang TIDAK dirender: tanpa nomor VA, tanpa
              // "Total bayar", tanpa countdown, tanpa satu pun kalimat yang menyuruh transfer.
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <AlertCircle className="size-6" />
                </span>
                <p className="text-sm font-semibold text-foreground">
                  {CHECKOUT_COPY.unknownStateHeading}
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {CHECKOUT_COPY.unknownStateBody}
                </p>
                <OrderReference order={order} onCopy={copy} />
                <BackButton onClick={backToApp} label={CHECKOUT_COPY.openHistoryCta} />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <PaymentInstructions order={order} onCopy={copy} />
                <HowToPay channel={order.paymentChannel} isSimulation={isSimulation} />
                <div className="border-t border-border" />
                <MintStatusTracker order={order} />
                {/* Temuan F1: ini satu-satunya layar yang dulu tak punya jalan pulang. Tombol
                    "Batal" hilang bersama pemilih metode, dan tidak ada penggantinya — justru di
                    layar tempat orang paling mungkin berpikir ulang. Nomor VA tidak hangus karena
                    halamannya ditutup, dan kalimat di bawah tombol yang memastikan itu. */}
                <div className="border-t border-border" />
                <BackButton onClick={backToApp} label={CHECKOUT_COPY.backToAppCta} />
                <p className="-mt-2 text-center text-xs text-muted-foreground">
                  {CHECKOUT_COPY.leaveNote(order.paymentChannel)}
                </p>
              </div>
            )}

            {isSimulation && !isCompleted && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Mode simulasi: pembayaran tidak diproses ke bank sungguhan; status pesanan
                diselesaikan otomatis oleh sistem (mock payment provider).
              </p>
            )}
          </Card>
        </>
      )}
    </main>
  );
}
