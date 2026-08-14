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
import { CheckCircle2, ChevronDown, Copy, Download, Loader2, QrCode } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import { useCheckout } from "@/hooks/useCheckout";
import { PaymentMethodSelector } from "@/components/checkout/PaymentMethodSelector";
import { MintStatusTracker } from "@/components/checkout/MintStatusTracker";
import { BANK_BRAND, QRIS_RED, VA_BANKS } from "@/lib/constants";
import { formatIDR, formatCountdown, formatWibDateTime, truncateAddress } from "@/lib/utils";
import type { MintChannelOption, MintOrderDetail, PaymentChannel, VaBank } from "@/types";

// Kelompokkan digit per 4 biar nomor VA gampang dibaca (8878 4716 9037 8849).
function groupDigits(s: string): string {
  return s.replace(/(\d{4})(?=\d)/g, "$1 ");
}

// Link block explorer per chain (Phase 2 = Polygon). Mock: hash palsu, link tetap render.
function txExplorerUrl(chain: string, hash: string): string | null {
  return chain === "polygon" ? `https://polygonscan.com/tx/${hash}` : null;
}

// GET bisa tak menyertakan channels[] (backend lama) — fallback ke daftar statis.
function resolveChannels(order: MintOrderDetail): MintChannelOption[] {
  if (order.channels && order.channels.length) return order.channels;
  return [
    { channel: "VA", pgFeeIdr: "", banks: [...VA_BANKS] as VaBank[] },
    { channel: "QRIS", pgFeeIdr: "", banks: null },
  ];
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

function BackButton({ onClick, label = "Kembali" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[42px] items-center justify-center rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
    >
      {label}
    </button>
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
      <button
        type="button"
        onClick={download}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
      >
        <Download className="size-3.5" /> Unduh QR Code
      </button>
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
                className="flex h-6 w-9 items-center justify-center rounded text-[10px] font-extrabold tracking-tight"
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
          <button
            type="button"
            onClick={() => order.virtualAccountNo && onCopy(order.virtualAccountNo)}
            aria-label="Salin"
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Copy className="size-4" />
          </button>
        </div>
      </div>

      {order.totalPayIdr && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Jumlah yang harus dibayar</p>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-muted p-3">
            <span className="text-base font-semibold text-foreground">
              {formatIDR(Number(order.totalPayIdr))}
            </span>
            <button
              type="button"
              onClick={() => order.totalPayIdr && onCopy(order.totalPayIdr)}
              aria-label="Salin"
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Copy className="size-4" />
            </button>
          </div>
          <p className="mt-1.5 text-xs text-warning">
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
  const pgFee = Number(order.pgFeeIdr ?? 0);
  const total = Number(order.totalPayIdr);
  if (![subtotal, mintFee, pgFee, total].every(Number.isFinite)) return null;
  const residual = Math.round(total - subtotal - mintFee - pgFee);

  return (
    <Accordion title="Rincian biaya">
      <DetailRow label="Nilai USDX">{formatIDR(subtotal)}</DetailRow>
      <DetailRow label={`Biaya mint (${order.mintFeePct}%)`}>{formatIDR(mintFee)}</DetailRow>
      <DetailRow label="Biaya layanan pembayaran">{formatIDR(pgFee)}</DetailRow>
      {/* Provider yang memakai kode unik (BNI) menempelkannya ke total — tanpa baris ini
          rincian tidak menjumlah ke angka yang benar-benar ditagih. */}
      {residual !== 0 && <DetailRow label="Kode unik">{formatIDR(residual)}</DetailRow>}
      <div className="mt-1 border-t border-border pt-1">
        <DetailRow label="Total yang dibayar">{formatIDR(total)}</DetailRow>
      </div>
    </Accordion>
  );
}

// Sudah dibayar, belum selesai on-chain (menunggu persetujuan multisig — bisa lama). Instruksi
// transfer TIDAK boleh tetap dominan di sini: nomor VA + "Jumlah yang harus dibayar" membuat user
// yang sudah transfer membaca tagihan yang sama dan berpotensi bayar dua kali. Nomor VA tetap
// tersedia sebagai rujukan, tapi dilipat dan tanpa satu pun kalimat perintah bayar.
function PaidState({ order, onCopy }: { order: MintOrderDetail; onCopy: (text: string) => void }) {
  const paidAt = formatWibDateTime(order.paidAt);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1.5 rounded-xl bg-success/10 p-4 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="size-6" />
        </span>
        <p className="text-sm font-semibold text-foreground">Pembayaran diterima</p>
        {order.totalPayIdr && (
          <p className="text-lg font-semibold text-foreground">
            {formatIDR(Number(order.totalPayIdr))}
          </p>
        )}
        {paidAt && <p className="text-xs text-muted-foreground">{paidAt}</p>}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Tidak perlu transfer lagi. Pesanan kamu sedang diproses.
        </p>
      </div>

      <MintStatusTracker order={order} />

      <Accordion title="Detail pembayaran">
        {order.paymentChannel === "QRIS" ? (
          <DetailRow label="Metode">QRIS</DetailRow>
        ) : (
          <>
            <DetailRow label="Metode">
              Virtual Account{order.paymentBank ? ` ${order.paymentBank}` : ""}
            </DetailRow>
            {order.virtualAccountNo && (
              <DetailRow label="Nomor Virtual Account">
                <span className="font-mono">{groupDigits(order.virtualAccountNo)}</span>
                <button
                  type="button"
                  onClick={() => onCopy(order.virtualAccountNo!)}
                  aria-label="Salin nomor Virtual Account"
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Copy className="size-3.5" />
                </button>
              </DetailRow>
            )}
          </>
        )}
        <DetailRow label="Nomor pesanan">{order.orderNumber}</DetailRow>
        {paidAt && <DetailRow label="Waktu pembayaran">{paidAt}</DetailRow>}
      </Accordion>
    </div>
  );
}

function SuccessState({ order, onBack }: { order: MintOrderDetail; onBack: () => void }) {
  const explorer = order.onChainTxHash ? txExplorerUrl(order.chain, order.onChainTxHash) : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
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
            className="font-mono text-xs text-primary-700 hover:underline"
          >
            {truncateAddress(order.onChainTxHash, 6)}
          </a>
        </Row>
      )}

      <button
        type="button"
        onClick={onBack}
        className="brand-gradient flex h-[42px] items-center justify-center rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        Kembali ke app
      </button>
    </div>
  );
}

export function CheckoutContent() {
  const router = useRouter();
  const params = useParams<{ orderId: string }>();
  const id = params.orderId;
  const { order, isLoading, isError, isUnauthorized, pay, isPaying, payError, secondsLeft, isExpired } =
    useCheckout(id);

  function copy(text: string) {
    navigator.clipboard?.writeText(text);
    toast.success("Disalin");
  }

  // "Mint Berhasil" HANYA saat order COMPLETED DAN tx on-chain terbukti (onChainTxHash) —
  // PAID/WAITING_FOR_APPROVAL tetap tampil "sedang diproses" (USDX-293).
  const isCompleted = order?.status === "COMPLETED" && Boolean(order?.onChainTxHash);
  // Sudah dibayar, on-chain belum tuntas → keadaan menengah (jangan tampilkan tagihan lagi).
  const isPaid = order?.paymentStatus === "PAID" && !isCompleted;
  // Countdown = sisa waktu BAYAR. Setelah lunas ia tak punya arti dan cuma bikin cemas.
  const showCountdown =
    Boolean(order) &&
    !isExpired &&
    !isPaid &&
    order!.status !== "COMPLETED" &&
    order!.status !== "FAILED";
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
            <p className="text-sm font-medium text-destructive">Sesi checkout kedaluwarsa</p>
            <p className="text-sm text-muted-foreground">
              Buka ulang halaman ini dari aplikasi USDX untuk melanjutkan.
            </p>
            <BackButton onClick={() => router.back()} />
          </div>
        </Card>
      ) : isError || !order ? (
        <Card>
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Pesanan tidak ditemukan atau sesi tidak valid.
            </p>
            <BackButton onClick={() => router.back()} />
          </div>
        </Card>
      ) : (
        <>
          {showCountdown && (
            <div className="rounded-lg bg-primary/5 px-4 py-2.5 text-center text-sm text-foreground">
              Pembayaran berakhir dalam{" "}
              <span className="font-semibold tabular-nums">{formatCountdown(secondsLeft)}</span>
            </div>
          )}

          <Card>
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-medium text-foreground">Minting USDX</h2>
              <p className="text-xs text-muted-foreground">Pesanan #{order.orderNumber}</p>
            </div>

            {/* Dua angka, dua nama berbeda: "Nilai pesanan" (sebelum biaya layanan PG) vs
                "Total yang dibayar" (yang benar-benar ditagih). Dulu keduanya sama-sama disebut
                "pembayaran" dengan angka berbeda — pemicu ragu tepat di layar bayar. */}
            <Row label="Nilai pesanan">{formatIDR(Number(order.totalBeforePgFeeIdr))}</Row>
            {order.totalPayIdr && (
              <>
                <Row label="Total yang dibayar">{formatIDR(Number(order.totalPayIdr))}</Row>
                <FeeBreakdown order={order} />
              </>
            )}
            <div className="border-t border-border" />
            <Row label="Nama Lengkap">{order.customerName}</Row>
            <Row label="Wallet Tujuan">
              <span className="font-mono text-xs">
                {order.chain} · {truncateAddress(order.userAddress)}
              </span>
              <button
                type="button"
                onClick={() => copy(order.userAddress)}
                aria-label="Salin"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <Copy className="size-3.5" />
              </button>
            </Row>

            <div className="border-t border-border" />

            {isExpired ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <p className="text-sm font-medium text-destructive">Pesanan kedaluwarsa.</p>
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
            ) : isCompleted ? (
              <SuccessState order={order} onBack={() => router.back()} />
            ) : isPaid ? (
              <PaidState order={order} onCopy={copy} />
            ) : (
              <div className="flex flex-col gap-4">
                <PaymentInstructions order={order} onCopy={copy} />
                <HowToPay channel={order.paymentChannel} isSimulation={isSimulation} />
                <div className="border-t border-border" />
                <MintStatusTracker order={order} />
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
