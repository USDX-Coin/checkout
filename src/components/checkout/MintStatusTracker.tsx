"use client";

// Status tracker 3 dimensi (USDX-224, port USDX-202): Pembayaran → Proses on-chain →
// Selesai, diturunkan dari paymentStatus + status overall order (conventions.md § Status
// Enums). Di-poll checkout via GET /v2/mint/{id}.

import { Check, Clock, Loader2, X } from "lucide-react";
import type { MintOrderDetail } from "@/types";
import { cn } from "@/lib/utils";

// `activeHint` tampil HANYA saat langkahnya berjalan. "Proses on-chain" praktiknya = menunggu
// tanda tangan multisig Safe — bisa menit, bisa jam, tergantung penandatangan. Sengaja TANPA
// estimasi waktu: kita tak menguasai kapan penandatangan membuka antrean.
//
// `spinWhenActive` memisahkan dua jenis "sedang berjalan" yang rasanya beda buat user:
//  - Pembayaran → SPINNER. User memang duduk di halaman ini menunggu transfernya terdeteksi;
//    lingkaran berputar itu jujur, dan berhentinya jadi penanda.
//  - Proses on-chain → JAM DIAM. Spinner di sini berbohong: ia berkata "tunggu sebentar lagi"
//    tepat di sebelah kalimat "halaman ini boleh ditutup", dan mata orang lebih percaya
//    spinner daripada teks — jadi user menunggui halaman yang tak perlu ditunggui.
const STEPS: { label: string; activeHint: string | null; spinWhenActive: boolean }[] = [
  { label: "Pembayaran", activeHint: null, spinWhenActive: true },
  {
    label: "Proses on-chain",
    activeHint:
      "Pesanan sedang diproses & menunggu persetujuan. Token akan otomatis masuk ke wallet setelah selesai — halaman ini boleh ditutup.",
    spinWhenActive: false,
  },
  { label: "Selesai", activeHint: null, spinWhenActive: true },
];

type StepState = "done" | "active" | "pending" | "failed";

// Keterangan langkah yang gagal — dan LANGKAH MANA yang gagal berbeda antara dua jalur, karena
// nasib uangnya berbeda (`sot/conventions.md § Status Enums`, `sot/bni-integration.md §6`):
//
//   PAID + FAILED   Pembayaran BERHASIL, mint ditolak multisig sesudahnya → langkah 2 yang gagal.
//                   Tanpa ini, satu-satunya keterangan adalah spanduk merah datar yang menyuruh
//                   mulai ulang — tanpa menyebut bahwa uangnya sampai.
//   HELD + FAILED   Ops menolak kreditnya; pembayarannya sendiri tak pernah dicocokkan ke pesanan
//                   ini → langkah 1 yang gagal, dan refundnya manual.
const FAILED_HINT = {
  onChain: "Pengiriman dibatalkan saat persetujuan. Pembayaran kamu tetap tercatat.",
  payment: "Pembayaran ditolak saat ditinjau. Dananya dikembalikan manual oleh tim kami.",
} as const;

function stepStates(order: MintOrderDetail): StepState[] {
  const paid = order.paymentStatus === "PAID";
  // On-chain "berhasil"/"Selesai" HANYA saat order COMPLETED DAN onChainTxHash terbukti
  // terisi (USDX-293). PAID/WAITING_FOR_APPROVAL (Safe masih PENDING_APPROVAL, txHash
  // kosong) = "sedang diproses", BUKAN berhasil — cegah user dikira sudah punya token.
  const onChainDone = order.status === "COMPLETED" && Boolean(order.onChainTxHash);
  // Gagal SETELAH uang masuk: pembayaran tetap "done", yang gagal langkah berikutnya.
  if (paid && order.status === "FAILED") return ["done", "failed", "pending"];
  // Kredit ditahan lalu DITOLAK: yang gagal langkah pembayarannya sendiri.
  if (order.paymentStatus === "HELD" && order.status === "FAILED")
    return ["failed", "pending", "pending"];
  return [
    paid ? "done" : "active", // pembayaran
    !paid ? "pending" : onChainDone ? "done" : "active", // on-chain
    onChainDone ? "done" : "pending", // selesai
  ];
}

function StepIcon({ state, spin }: { state: StepState; spin: boolean }) {
  // Langkah selesai memakai `--success`, BUKAN `--primary`. Dua alasan, dan yang kedua yang
  // menentukan:
  //  1. Di layar FAILED + PAID ikon "selesai" dan ikon "gagal" muncul BERSEBELAHAN. `--primary`
  //     di tema gelap adalah maroon (#800000) dan `--destructive` merah muda (#f87171) — dua
  //     lingkaran kemerahan bertumpuk di satu-satunya layar yang paling butuh dibaca sekilas.
  //  2. Maroon adalah warna MEREK, bukan warna status. Memakainya untuk menyatakan "berhasil"
  //     persis yang melahirkan temuan audit C8 (warna sukses berbeda antara app dan checkout).
  //     `PartnerProgressStepper` sudah memakai `bg-success` untuk langkah yang sama; ini
  //     menyamakan keduanya alih-alih menambah versi ketiga.
  //
  // Glifnya `text-card`, bukan `text-white` — dan ini bukan detail. Hijau dan merah tema gelap
  // sama-sama TERANG: #22c55e lawan #f87171 cuma berbeda 1,21:1 dalam luminansi (diukur di
  // layar FAILED + PAID). Artinya kedua status itu dibedakan oleh HUE saja, dan mata yang tak
  // bisa mengandalkan hue harus bersandar pada BENTUK glifnya — centang lawan silang. Justru
  // glif itu yang paling lemah dengan `text-white` di atas isian terang: 2,28:1 (selesai) dan
  // 2,77:1 (gagal). Dilubangi dengan warna permukaan kartu keduanya jadi 7,64:1 dan 6,29:1 di
  // gelap, sementara di terang tetap 3,30:1 dan 3,76:1 seperti sebelumnya — naik tanpa menukar
  // satu tema dengan tema lain.
  if (state === "done")
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-success text-card">
        <Check className="size-3.5" />
      </span>
    );
  if (state === "failed")
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-destructive text-card">
        <X className="size-3.5" />
      </span>
    );
  if (state === "active")
    return (
      // `primary-text`, bukan `primary`: maroon #800000 di atas kartu gelap hanya
      // 1,59:1, dan ikon inilah satu-satunya penanda langkah yang sedang berjalan.
      <span className="flex size-6 items-center justify-center rounded-full border border-primary-text text-primary-text">
        {spin ? <Loader2 className="size-3.5 animate-spin" /> : <Clock className="size-3.5" />}
      </span>
    );
  return (
    <span className="flex size-6 items-center justify-center rounded-full border border-border" />
  );
}

export function MintStatusTracker({ order }: { order: MintOrderDetail }) {
  // Gagal SEBELUM uang masuk: tak ada langkah yang perlu dirinci — pesanannya memang tidak
  // pernah berjalan. Gagal SESUDAH uang masuk dirender sebagai langkah (lihat `stepStates`).
  if (order.status === "FAILED" && order.paymentStatus !== "PAID" && order.paymentStatus !== "HELD") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive-text">
        <X className="size-4" /> Transaksi gagal. Silakan mulai lagi dari aplikasi USDX.
      </div>
    );
  }

  const states = stepStates(order);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-foreground">Status transaksi</p>
      <ol className="flex flex-col gap-2.5">
        {STEPS.map(({ label, activeHint, spinWhenActive }, i) => (
          <li key={label} className="flex items-start gap-2.5">
            <StepIcon state={states[i]} spin={spinWhenActive} />
            <div className="flex flex-col gap-0.5 pt-0.5">
              <span
                className={cn(
                  "text-sm",
                  states[i] === "pending" && "text-muted-foreground",
                  states[i] === "failed" && "font-medium text-destructive-text",
                  states[i] !== "pending" && states[i] !== "failed" && "font-medium text-foreground",
                )}
              >
                {label}
              </span>
              {activeHint && states[i] === "active" && (
                <span className="text-xs leading-relaxed text-muted-foreground">{activeHint}</span>
              )}
              {states[i] === "failed" && (
                <span className="text-xs leading-relaxed text-destructive-text">
                  {i === 0 ? FAILED_HINT.payment : FAILED_HINT.onChain}
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
