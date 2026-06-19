"use client";

// Logika checkout (USDX-224, port dari app USDX-202): poll GET /v2/mint/{id} untuk order
// + status tracker, jalankan mutation POST /v2/mint/{id}/pay, dan turunkan countdown.
// Polling berhenti saat order terminal (COMPLETED/FAILED) atau countdown habis (job
// Expiry BE belum live, jadi FE menganggap `expiresAt` lampau = expired secara klien).
//
// DEMO mode (env.demoAutocomplete, dev/preview only): pipeline on-chain real
// (Auto-Propose → Safe → COMPLETED) belum jalan di dev, jadi setelah bayar status tracker
// DISIMULASIKAN maju PAID → COMPLETED tiap 2 detik. Override TAMPILAN saja (order di
// backend tak berubah); OFF di prod.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMintOrder, payMintOrder } from "@/lib/api/mint";
import { isApiError, isValidationError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import type { MintOrderDetail, PaymentChannel, VaBank } from "@/types";

const POLL_MS = 3000;
const DEMO_STEP_MS = 4000; // jeda tiap tahap saat demo auto-complete
const TERMINAL = new Set(["COMPLETED", "FAILED"]);

// Pesan error /pay dalam Bahasa Indonesia (checkout internal, single-locale).
function payErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (isApiError(error)) {
    if (error.code === "INVALID_ORDER_STATE")
      return "Pesanan tidak lagi bisa memilih metode. Tunggu kedaluwarsa, lalu mulai ulang dari /mint.";
    if (isValidationError(error)) return "Data pembayaran tidak valid. Periksa pilihan metode.";
    if (error.code === "MINT_DISABLED") return "Mint belum dibuka di environment ini.";
  }
  return "Gagal memproses pembayaran. Silakan coba lagi.";
}

export function useCheckout(id: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["mint-order", id],
    queryFn: () => getMintOrder(id),
    enabled: Boolean(id),
    retry: false,
    refetchInterval: (q) => {
      const o = q.state.data;
      if (!o || TERMINAL.has(o.status)) return false;
      if (new Date(o.expiresAt).getTime() <= Date.now()) return false; // expired → stop
      // Poll selama menunggu konfirmasi pembayaran / settlement on-chain.
      return o.paymentStatus === "WAITING_FOR_PAYMENT" || o.status === "WAITING_FOR_APPROVAL"
        ? POLL_MS
        : false;
    },
  });

  const fetched = query.data ?? null;

  // ── DEMO auto-complete (env-gated, dev/preview) ────────────────────────────
  // Begitu order ter-bayar (paymentStatus != REQUESTED): fase 1 (2s) → PAID
  // (Pembayaran ✓, Proses on-chain aktif), fase 2 (4s) → COMPLETED (Selesai ✓).
  const [demoPhase, setDemoPhase] = useState<0 | 1 | 2>(0);
  const paidish = fetched !== null && fetched.paymentStatus !== "REQUESTED";
  // Deps HANYA [paidish] (BUKAN demoPhase): polling refetch tiap 3s bikin re-render, dan
  // kalau demoPhase masuk deps, cleanup-nya keburu clear timer fase 2 → mentok di "Proses
  // on-chain", nggak pernah "Selesai". paidish stabil `true` setelah bayar → timer aman.
  useEffect(() => {
    if (!env.demoAutocomplete || !paidish) return;
    const t1 = setTimeout(() => setDemoPhase(1), DEMO_STEP_MS);
    const t2 = setTimeout(() => setDemoPhase(2), DEMO_STEP_MS * 2);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [paidish]);

  const order = useMemo<MintOrderDetail | null>(() => {
    if (!fetched || !env.demoAutocomplete || demoPhase === 0) return fetched;
    if (demoPhase === 1) {
      return { ...fetched, paymentStatus: "PAID", status: "WAITING_FOR_APPROVAL" };
    }
    return { ...fetched, paymentStatus: "PAID", safeStatus: "EXECUTED", status: "COMPLETED" };
  }, [fetched, demoPhase]);

  // Tick 1 detik menggerakkan tampilan countdown.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const isTerminal = order ? TERMINAL.has(order.status) : false;
  const secondsLeft = order
    ? Math.max(0, Math.floor((new Date(order.expiresAt).getTime() - now) / 1000))
    : 0;
  const isExpired = Boolean(order) && !isTerminal && secondsLeft <= 0;

  const payMutation = useMutation({
    mutationFn: (vars: { channel: PaymentChannel; bank?: VaBank | null }) => payMintOrder(id, vars),
    onSuccess: (updated) => {
      queryClient.setQueryData(["mint-order", id], updated);
    },
  });

  return {
    order,
    isLoading: query.isLoading,
    isError: query.isError,
    pay: (channel: PaymentChannel, bank?: VaBank | null) =>
      payMutation.mutateAsync({ channel, bank }),
    isPaying: payMutation.isPending,
    payError: payErrorMessage(payMutation.error),
    secondsLeft,
    isExpired,
    isTerminal,
  };
}
