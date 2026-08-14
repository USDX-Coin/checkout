"use client";

// Logika checkout (USDX-224, port dari app USDX-202): poll GET /v2/mint/{id} untuk order
// + status tracker, jalankan mutation POST /v2/mint/{id}/pay, dan turunkan countdown.
// Polling berhenti saat order terminal (COMPLETED/FAILED) atau countdown habis (job
// Expiry BE belum live, jadi FE menganggap `expiresAt` lampau = expired secara klien).
//
// Auth (USDX-378): saat halaman dibuka, tukar one-time `#code=` handoff → raw session
// token via POST /api/v2/auth/checkout-token/exchange SEBELUM GET pertama (gating), lalu
// pakai token itu sebagai bearer. Code invalid/kedaluwarsa/terpakai (401) → sesi tak valid
// → redirect balik ke `app`. Refresh dalam tab pakai token tersimpan (sessionStorage).
//
// DEMO mode (env.demoAutocomplete): simulasikan HANYA konfirmasi pembayaran
// (paymentStatus → PAID, status → WAITING_FOR_APPROVAL "menunggu approval") supaya demo
// lokal lanjut tanpa provider bayar real. TIDAK memalsukan COMPLETED/on-chain — sejak W4
// pipeline Safe real (Auto-Propose → sign → execute) jalan di dev; "on-chain berhasil"
// HANYA dari backend real (status=COMPLETED + onChainTxHash). Override TAMPILAN saja.
// Dua pagar, keduanya di kode (bukan disiplin env):
//  1. MATI di production — `env.demoAutocomplete` baru bernilai true kalau backend yang
//     dituju terbukti non-prod (lihat `@/lib/env`). Env sendirian tidak cukup.
//  2. HANYA MAJU — simulasi tak pernah menahan keadaan nyata yang sudah lebih maju. Begitu
//     backend bilang COMPLETED/EXECUTED/HELD/EXPIRED, yang nyata yang tampil (lihat
//     `demoMayAdvance`). Dulu override mengunci `status` selamanya, jadi order yang sudah
//     selesai on-chain tetap terlihat "Proses on-chain" sampai halaman di-refresh.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMintOrder, payMintOrder } from "@/lib/api/mint";
import { exchangeHandoffCode } from "@/lib/api/auth";
import { isApiError, isValidationError, isRateLimited, getRateLimitSeconds } from "@/lib/api/errors";
import { readHandoffCodeFromHash, getToken, setToken } from "@/lib/auth/token";
import { redirectToApp } from "@/lib/auth/redirect";
import { env } from "@/lib/env";
import type { MintOrderDetail, PaymentChannel, VaBank } from "@/types";

const POLL_MS = 3000; // jauh di bawah throttle 5 req/detik (conventions.md § Rate Limiting)
const DEMO_STEP_MS = 4000; // jeda tiap tahap saat demo auto-complete
const TERMINAL = new Set(["COMPLETED", "FAILED"]);

// Satu-satunya keadaan yang boleh dikarang mode demo: "sudah dibayar, menunggu approval".
const DEMO_TARGET = {
  paymentStatus: "PAID",
  status: "WAITING_FOR_APPROVAL",
  safeStatus: "PENDING_APPROVAL",
} as const;

// Tipe sengaja `number | undefined`: nilai enum di luar daftar (backend lebih baru dari FE)
// HARUS terbaca sebagai "tak dikenal", bukan diam-diam jadi rank 0 yang gampang ditimpa demo.
type RankMap = Record<string, number | undefined>;

// Urutan kemajuan tiap dimensi status (conventions.md § Status Enums → Mint Order). Dipakai
// HANYA untuk memastikan simulasi demo tak pernah menahan keadaan nyata yang sudah lebih
// maju. Keadaan akhir (HELD/EXPIRED/COMPLETED/FAILED/EXECUTED/REJECTED) diberi rank
// tertinggi — bukan berarti "lebih sukses", tapi "lebih jauh dari yang boleh dikarang demo":
// mengecat "Pembayaran diterima" di atas order yang ditahan, kedaluwarsa, atau gagal sama
// bohongnya dengan menutupi order yang sudah selesai.
const PAYMENT_RANK: RankMap = {
  REQUESTED: 0,
  WAITING_FOR_PAYMENT: 1,
  PAID: 2,
  HELD: 3,
  EXPIRED: 3,
};
const ORDER_RANK: RankMap = {
  WAITING_FOR_PAYMENT: 0,
  WAITING_FOR_APPROVAL: 1,
  HELD: 2,
  COMPLETED: 3,
  FAILED: 3,
};
const SAFE_RANK: RankMap = {
  NONE: 0,
  PENDING_APPROVAL: 1,
  APPROVED: 2,
  EXECUTED: 3,
  REJECTED: 3,
};

// Selisih rank simulasi − nyata. `null` = salah satu nilainya tak dikenal (drift enum dari
// backend) → penelepon WAJIB membacanya sebagai "jangan timpa" (fail-closed).
function rankDelta(map: RankMap, sim: string, real: string): number | null {
  const s = map[sim];
  const r = map[real];
  return s === undefined || r === undefined ? null : s - r;
}

// Simulasi boleh dipakai hanya bila ia MEMAJUKAN tampilan: tidak tertinggal di satu dimensi
// pun, dan benar-benar maju di minimal satu (kalau semua sama ia cuma menyalin keadaan nyata
// — tak ada yang dipalsukan, jadi tak perlu dilabeli DEMO). Semua-atau-tidak sama sekali:
// menggabung per-field bisa melahirkan kombinasi mustahil (mis. EXPIRED + menunggu approval).
function demoMayAdvance(real: MintOrderDetail): boolean {
  const deltas = [
    rankDelta(PAYMENT_RANK, DEMO_TARGET.paymentStatus, real.paymentStatus),
    rankDelta(ORDER_RANK, DEMO_TARGET.status, real.status),
    rankDelta(SAFE_RANK, DEMO_TARGET.safeStatus, real.safeStatus),
  ];
  if (deltas.some((d) => d === null || d < 0)) return false;
  return deltas.some((d) => d !== null && d > 0);
}

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

  // Baca one-time handoff `#code=` dari URL hash SEKALI saat render pertama (lazy
  // useState jalan sebelum effect & sebelum queryFn React Query) + STRIP dari URL
  // (anti-replay dari history/Referer). SSR-safe (lihat token.ts).
  const [handoffCode] = useState<string | null>(() => readHandoffCodeFromHash());
  // Sesi hasil handoff sebelumnya (refresh dalam tab) sudah tersimpan → tak perlu
  // tukar lagi. Dibaca sekali agar tidak berubah antar-render.
  const [alreadyAuthed] = useState<boolean>(() => getToken() !== null);

  // Tukar `code` → raw session token (public/pre-auth), simpan sbg bearer SEBELUM GET
  // pertama (anti-race). Jalan hanya bila ada `code` DAN belum punya token.
  // `retry: false` — code sekali-pakai; kalau di-retry, percobaan ke-2 pasti 401
  // (sudah terpakai). `staleTime: Infinity` — jangan refetch (code sudah di-strip).
  const needsExchange = Boolean(handoffCode) && !alreadyAuthed;
  const exchange = useQuery({
    queryKey: ["checkout-token-exchange", id],
    queryFn: async () => {
      const token = await exchangeHandoffCode(handoffCode!);
      // Simpan di dalam queryFn (sebelum status `success`) supaya token pasti sudah
      // ada di sessionStorage saat GET mint di-enable — tidak bergantung urutan effect.
      setToken(token);
      return token;
    },
    enabled: needsExchange,
    retry: false,
    staleTime: Infinity,
  });

  // Selama exchange masih jalan, tunda GET mint. Kalau exchange gagal (code invalid/
  // kedaluwarsa/terpakai → 401 INVALID_HANDOFF_CODE), jangan GET sama sekali — sesi
  // tak valid, langsung ke jalur redirect.
  const waitingForExchange = needsExchange && exchange.isPending;
  const exchangeFailed = needsExchange && exchange.isError;

  const query = useQuery({
    queryKey: ["mint-order", id],
    queryFn: () => getMintOrder(id),
    enabled: Boolean(id) && !waitingForExchange && !exchangeFailed,
    retry: false,
    refetchInterval: (q) => {
      const o = q.state.data;
      if (!o || TERMINAL.has(o.status)) return false;
      // `expiresAt` = batas jendela BAYAR. Order yang sudah PAID lewat batas itu bukan expired —
      // ia sedang menunggu persetujuan multisig yang bisa berjam-jam. Kalau polling ikut berhenti
      // di situ, halaman tak akan pernah tahu order sudah COMPLETED (Tugas 6 poin 2/3).
      if (o.paymentStatus !== "PAID" && new Date(o.expiresAt).getTime() <= Date.now()) return false;
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

  // Sesi checkout tak valid → balik ke `app` untuk re-auth (USDX-378). Dua sumber:
  //  - exchange 401 INVALID_HANDOFF_CODE (code salah/kedaluwarsa/terpakai), atau
  //  - GET mint 401 (token hasil exchange kedaluwarsa/dicabut di tengah sesi).
  // Kalau `appUrl` tak di-set (mis. localhost) → redirectToApp() no-op, UI tampilkan
  // pesan "sesi checkout kedaluwarsa" + tombol Kembali (lihat CheckoutContent).
  const isUnauthorized =
    exchangeFailed || (isApiError(query.error) && query.error.status === 401);
  useEffect(() => {
    if (isUnauthorized) redirectToApp();
  }, [isUnauthorized]);

  // ── DEMO: simulasi konfirmasi bayar saja (env + host non-prod) ──────────────
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

  // Apakah `order` yang dikembalikan sedang DIPALSUKAN mode demo. Wajib diteruskan ke UI:
  // demo memaksa paymentStatus=PAID tanpa satu rupiah pun berpindah, dan layar "Pembayaran
  // diterima" tak bisa dibedakan dari yang sungguhan. Justru berbahaya di dev — di situ UAT
  // DurianPay sandbox dijalankan.
  //
  // `demoMayAdvance` bikin override ini MUNDUR SENDIRI begitu backend melaporkan keadaan
  // yang sama atau lebih maju (COMPLETED/EXECUTED, HELD, EXPIRED/FAILED). `demoPaid` tetap
  // true, tapi ia tak lagi menimpa apa pun — hasil poll berikutnya langsung tampil, tanpa
  // perlu refresh halaman.
  const isDemoOverride =
    env.demoAutocomplete && demoPaid && fetched !== null && demoMayAdvance(fetched);

  const order = useMemo<MintOrderDetail | null>(
    // "Menunggu approval" per conventions.md § Status Enums → Mint Order.
    () => (fetched && isDemoOverride ? { ...fetched, ...DEMO_TARGET } : fetched),
    [fetched, isDemoOverride],
  );

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
  // Sudah dibayar = jendela bayar tak berlaku lagi; layar "Pesanan kedaluwarsa" untuk user yang
  // sudah transfer adalah kebohongan yang bikin panik. Selain itu, hormati juga EXPIRED dari
  // backend walau timer klien belum habis (jam klien bisa mundur).
  const isPaid = order?.paymentStatus === "PAID";
  const isExpired =
    Boolean(order) &&
    !isTerminal &&
    !isPaid &&
    (order!.paymentStatus === "EXPIRED" || secondsLeft <= 0);

  const payMutation = useMutation({
    mutationFn: (vars: { channel: PaymentChannel; bank?: VaBank | null }) => payMintOrder(id, vars),
    onSuccess: (updated) => {
      queryClient.setQueryData(["mint-order", id], updated);
    },
  });

  return {
    order,
    isDemoOverride,
    // Exchange in-flight juga = "memuat" (GET mint belum boleh jalan).
    isLoading: waitingForExchange || query.isLoading,
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
