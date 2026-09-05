"use client";

// Status tracker 3 dimensi (USDX-224, port USDX-202): Pembayaran → Proses on-chain →
// Selesai, diturunkan dari paymentStatus + status overall order (conventions.md § Status
// Enums). Di-poll checkout via GET /v2/mint/{id}.
//
// Tata letak, garis penghubung, dan ikonnya milik `ui/steps` — komponen `Steps (23)` di Figma
// yang juga dipakai jalur partner. Yang tersisa di berkas ini cuma yang memang khas mint:
// PETA dari tiga dimensi status order ke keadaan tiap langkah.

import { X } from "lucide-react";
import { Steps, type StepItem } from "@/components/ui/steps";
import type { MintOrderDetail } from "@/types";

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

type StepState = StepItem["state"];

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
  const steps: StepItem[] = STEPS.map(({ label, activeHint, spinWhenActive }, i) => ({
    label,
    state: states[i],
    spinWhenActive,
    detail:
      states[i] === "failed"
        ? i === 0
          ? FAILED_HINT.payment
          : FAILED_HINT.onChain
        : activeHint && states[i] === "active"
          ? activeHint
          : null,
  }));

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-foreground">Status transaksi</p>
      <Steps steps={steps} />
    </div>
  );
}
