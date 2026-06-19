"use client";

// Status tracker 3 dimensi (USDX-224, port USDX-202): Pembayaran → Proses on-chain →
// Selesai, diturunkan dari paymentStatus + status overall order (conventions.md § Status
// Enums). Di-poll checkout via GET /v2/mint/{id}.

import { Check, Loader2, X } from "lucide-react";
import type { MintOrderDetail } from "@/types";
import { cn } from "@/lib/utils";

const STEPS = ["Pembayaran", "Proses on-chain", "Selesai"];

type StepState = "done" | "active" | "pending";

function stepStates(order: MintOrderDetail): StepState[] {
  const paid = order.paymentStatus === "PAID";
  const completed = order.status === "COMPLETED";
  return [
    paid ? "done" : "active", // pembayaran
    !paid ? "pending" : completed ? "done" : "active", // on-chain
    completed ? "done" : "pending", // selesai
  ];
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done")
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-primary text-white">
        <Check className="size-3.5" />
      </span>
    );
  if (state === "active")
    return (
      <span className="flex size-6 items-center justify-center rounded-full border border-primary text-primary">
        <Loader2 className="size-3.5 animate-spin" />
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
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2.5">
            <StepIcon state={states[i]} />
            <span
              className={cn(
                "text-sm",
                states[i] === "pending" ? "text-muted-foreground" : "font-medium text-foreground",
              )}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
