"use client";

// Logika checkout (USDX-224, port dari app USDX-202): poll GET /v2/mint/{id} untuk order
// + status tracker, jalankan mutation POST /v2/mint/{id}/pay, dan turunkan countdown.
// Polling berhenti saat order terminal (COMPLETED/FAILED) atau countdown habis (job
// Expiry BE belum live, jadi FE menganggap `expiresAt` lampau = expired secara klien).
//
// DEMO mode (env.demoAutocomplete, dev/preview only): simulasikan HANYA konfirmasi
// pembayaran (paymentStatus → PAID, status → WAITING_FOR_APPROVAL "menunggu approval")
// supaya demo lanjut tanpa provider bayar real. TIDAK memalsukan COMPLETED/on-chain — sejak
// W4 pipeline Safe real (Auto-Propose → sign → execute) jalan di dev; "on-chain berhasil"
// HANYA dari backend real (status=COMPLETED + onChainTxHash). Override TAMPILAN saja; OFF di
// prod (USDX-293: dulu demo maju paksa ke COMPLETED → user dikira sudah mint padahal belum).

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMintOrder, payMintOrder } from "@/lib/api/mint";
import { isApiError, isValidationError, isRateLimited, getRateLimitSeconds } from "@/lib/api/errors";
import { captureTokenFromHash } from "@/lib/auth/token";
import { redirectToApp } from "@/lib/auth/redirect";
import { env } from "@/lib/env";
import type { MintOrderDetail, PaymentChannel, VaBank } from "@/types";

const POLL_MS = 3000; // jauh di bawah throttle 5 req/detik (conventions.md § Rate Limiting)
const DEMO_STEP_MS = 4000; // jeda tiap tahap saat demo auto-complete
const TERMINAL = new Set(["COMPLETED", "FAILED"]);

// Pesan error /pay dalam Bahasa Indonesia (checkout internal, single-locale).
function payErrorMessage(error: unknown): string | null {
  if (!error) return null;
  // 429 RATE_LIMITED → toast throttle global (Providers, USDX-252); jangan
  // tampilkan error inline (akan kebaca sebagai kegagalan generic).
  if (isRateLimited(error)) return null;
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

  // Capture token handoff dari URL hash SEBELUM fetch pertama (anti-race, ref USDX-58).
  // useState lazy-init jalan sekali saat render pertama (sebelum effect & sebelum queryFn
  // React Query), jadi `getToken()` sudah terisi ketika GET pertama jalan. Idempoten +
  // SSR-safe (lihat token.ts).
  useState(() => {
    captureTokenFromHash();
    return true;
  });

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
      const polling = o.paymentStatus === "WAITING_FOR_PAYMENT" || o.status === "WAITING_FOR_APPROVAL";
      if (!polling) return false;
      // Mundur ke Retry-After saat 429 RATE_LIMITED (≥1s) — jangan hammer throttle
      // (USDX-252). `retry: false` di bawah sudah cegah retry-storm per tick.
      if (isRateLimited(q.state.error)) {
        return Math.max(1, getRateLimitSeconds(q.state.error) ?? 1) * 1000;
      }
      return POLL_MS;
    },
  });

  const fetched = query.data ?? null;

  // 401 (token absen / kedaluwarsa) → balik ke `app` untuk re-auth (USDX-239). Kalau
  // `appUrl` tak di-set (mis. localhost) → redirectToApp() no-op, UI tampilkan state
  // error + tombol Kembali.
  const isUnauthorized = isApiError(query.error) && query.error.status === 401;
  useEffect(() => {
    if (isUnauthorized) redirectToApp();
  }, [isUnauthorized]);

  // ── DEMO: simulasi konfirmasi bayar saja (env-gated, dev/preview) ───────────
  // Setelah order ter-bayar (paymentStatus != REQUESTED), majukan TAMPILAN ke PAID /
  // "menunggu approval" lalu BERHENTI. Settlement on-chain (COMPLETED + onChainTxHash)
  // datang dari pipeline Safe real — demo tak lagi memalsukannya (USDX-293). Deps [paidish]
  // stabil `true` setelah bayar → timer aman dari cleanup tiap poll.
  const [demoPaid, setDemoPaid] = useState(false);
  const paidish = fetched !== null && fetched.paymentStatus !== "REQUESTED";
  useEffect(() => {
    if (!env.demoAutocomplete || !paidish) return;
    const t = setTimeout(() => setDemoPaid(true), DEMO_STEP_MS);
    return () => clearTimeout(t);
  }, [paidish]);

  const order = useMemo<MintOrderDetail | null>(() => {
    if (!fetched || !env.demoAutocomplete || !demoPaid) return fetched;
    // "Menunggu approval" per conventions.md § Status Enums → Mint Order.
    return {
      ...fetched,
      paymentStatus: "PAID",
      status: "WAITING_FOR_APPROVAL",
      safeStatus: "PENDING_APPROVAL",
    };
  }, [fetched, demoPaid]);

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
    isUnauthorized,
    pay: (channel: PaymentChannel, bank?: VaBank | null) =>
      payMutation.mutateAsync({ channel, bank }),
    isPaying: payMutation.isPending,
    payError: payErrorMessage(payMutation.error),
    secondsLeft,
    isExpired,
    isTerminal,
  };
}
