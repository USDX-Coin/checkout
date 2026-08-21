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

type StepState = "done" | "active" | "pending";

function stepStates(order: MintOrderDetail): StepState[] {
  const paid = order.paymentStatus === "PAID";
  // On-chain "berhasil"/"Selesai" HANYA saat order COMPLETED DAN onChainTxHash terbukti
  // terisi (USDX-293). PAID/WAITING_FOR_APPROVAL (Safe masih PENDING_APPROVAL, txHash
  // kosong) = "sedang diproses", BUKAN berhasil — cegah user dikira sudah punya token.
  const onChainDone = order.status === "COMPLETED" && Boolean(order.onChainTxHash);
  return [
    paid ? "done" : "active", // pembayaran
    !paid ? "pending" : onChainDone ? "done" : "active", // on-chain
    onChainDone ? "done" : "pending", // selesai
  ];
}

function StepIcon({ state, spin }: { state: StepState; spin: boolean }) {
  if (state === "done")
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-primary text-white">
        <Check className="size-3.5" />
      </span>
    );
  if (state === "active")
    return (
      <span className="flex size-6 items-center justify-center rounded-full border border-primary text-primary">
        {spin ? <Loader2 className="size-3.5 animate-spin" /> : <Clock className="size-3.5" />}
      </span>
    );
  return (
    <span className="flex size-6 items-center justify-center rounded-full border border-border" />
  );
}

export function MintStatusTracker({ order }: { order: MintOrderDetail }) {
  if (order.status === "FAILED") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
        <X className="size-4" /> Transaksi gagal. Silakan mulai lagi dari /mint.
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
                  states[i] === "pending" ? "text-muted-foreground" : "font-medium text-foreground",
                )}
              >
                {label}
              </span>
              {activeHint && states[i] === "active" && (
                <span className="text-xs leading-relaxed text-muted-foreground">{activeHint}</span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
