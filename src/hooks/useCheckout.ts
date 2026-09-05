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
// TIDAK ADA mode demo/simulasi di sini. Dulu ada `NEXT_PUBLIC_DEMO_AUTOCOMPLETE` yang memaksa
// tampilan jadi "Pembayaran diterima" 4 detik setelah user pilih bank, tanpa satu rupiah pun
// berpindah — dan itu nyala di dev & staging, persis lingkungan tempat UAT DurianPay sandbox
// dijalankan, sehingga layar bukti pembayaran tak bisa dibedakan dari yang sungguhan.
// Alasannya sudah hilang: DurianPay SNAP sandbox jalan di dev dan punya simulator bayar
// sendiri, jadi PAID yang sungguhan bisa dipicu tanpa memalsukan apa pun.

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMintOrder, payMintOrder } from "@/lib/api/mint";
import { exchangeHandoffCode } from "@/lib/api/auth";
import { isApiError, isValidationError, isRateLimited, getRateLimitSeconds } from "@/lib/api/errors";
import { isOrderIdWellFormed } from "@/lib/checkout/order-id";
import { readHandoffCodeFromHash, setToken, clearToken } from "@/lib/auth/token";
import { redirectToApp } from "@/lib/auth/redirect";
import type { MintOrderDetail, PaymentChannel, VaBank } from "@/types";

const POLL_MS = 3000; // jauh di bawah throttle 5 req/detik (conventions.md § Rate Limiting)
const TERMINAL = new Set(["COMPLETED", "FAILED"]);

/**
 * Kenapa GET order gagal — dipakai halaman untuk memilih layar, bukan sekadar "error" (B5).
 *
 *   `malformed-id`  URL-nya tidak memuat nomor pesanan berbentuk UUID. Bukan soal server.
 *   `not-found`     404: pesanan memang tidak ada / bukan milik user. Mengulang tak menolong.
 *   `unavailable`   5xx, jaringan mati, apa pun yang bukan dua di atas. Pesanan MUNGKIN ada dan
 *                   pembayaran tidak terpengaruh — di sinilah tombol "Coba lagi" berguna, dan
 *                   di sinilah "Pesanan tidak ditemukan" jadi kebohongan yang menyuruh menyerah.
 */
export type CheckoutErrorKind = "malformed-id" | "not-found" | "unavailable";

function errorKindOf(error: unknown, malformedId: boolean): CheckoutErrorKind {
  if (malformedId) return "malformed-id";
  if (isApiError(error)) {
    if (error.status === 404) return "not-found";
    // 400/422 dari pipe validasi = id yang tak lolos bentuknya di sisi server. Sama artinya
    // dengan `malformed-id`, cuma yang memutuskan backend.
    if (error.status === 400 || error.status === 422) return "malformed-id";
  }
  return "unavailable";
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

  // `/checkout/bukan-uuid` (USDX-audit B14). Request tetap dijalankan seperti biasa — ini hanya
  // menentukan PESAN dan mematikan redirect otomatis, supaya URL yang salah ketik dijawab
  // kalimat yang jelas, bukan dilempar diam-diam ke halaman login `app`.
  const malformedId = Boolean(id) && !isOrderIdWellFormed(id);

  // Baca one-time handoff `#code=` dari URL hash SEKALI saat render pertama (lazy
  // useState jalan sebelum effect & sebelum queryFn React Query) + STRIP dari URL
  // (anti-replay dari history/Referer). SSR-safe (lihat token.ts).
  const [handoffCode] = useState<string | null>(() => {
    const code = readHandoffCodeFromHash();
    // `code` di URL adalah pernyataan eksplisit dari `app`: ini sesi checkout BARU.
    // Token sisa di sessionStorage milik pesanan SEBELUMNYA, dan ia harus dibuang di
    // sini — sebelum satu pun query sempat membacanya.
    //
    // Versi lama menukar code hanya kalau belum ada token (`&& !alreadyAuthed`).
    // Akibatnya begitu satu sesi rusak, token basinya menghalangi penukaran code baru,
    // GET dijawab 401, dan SETIAP pesanan berikutnya di tab yang sama ikut gagal dengan
    // "Sesi checkout kedaluwarsa" — pesanannya terbuat di `app`, checkoutnya tak pernah
    // terbuka. Token lama tidak pernah lebih benar daripada code yang baru saja
    // diberikan; kalau ada code, code yang menang.
    if (code) clearToken();
    return code;
  });

  // Tukar `code` → raw session token (public/pre-auth), simpan sbg bearer SEBELUM GET
  // pertama (anti-race). `retry: false` — code sekali-pakai; percobaan ke-2 pasti 401.
  // `staleTime: Infinity` — jangan refetch (code sudah di-strip dari URL).
  //
  // Tanpa `code` (mis. refresh setelah code di-strip) exchange tidak jalan dan GET
  // memakai token yang sudah tersimpan — itulah yang membuat refresh tetap bekerja.
  const needsExchange = Boolean(handoffCode);
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
      // `HELD` ikut dikecualikan bersama `PAID`: order jadi HELD justru lewat transfer TELAT
      // (pasca-`EXPIRED`, `sot/bni-integration.md §6`), jadi batas bayarnya memang sudah lewat.
      // Menghentikan polling di situ membuat layarnya basi selamanya.
      if (o.paymentStatus !== "PAID" && o.paymentStatus !== "HELD" && new Date(o.expiresAt).getTime() <= Date.now())
        return false;
      // Poll selama menunggu konfirmasi pembayaran / settlement on-chain / putusan ops atas
      // kredit yang ditahan. HELD menunggu MANUSIA (antrean "Mint Bermasalah"), dan hasilnya —
      // accept → WAITING_FOR_APPROVAL, reject → FAILED — mengubah layar sepenuhnya.
      const polling =
        o.paymentStatus === "WAITING_FOR_PAYMENT" ||
        o.paymentStatus === "HELD" ||
        o.status === "WAITING_FOR_APPROVAL";
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
    // Nomor pesanan yang bentuknya sudah salah TIDAK dilempar ke `app`: tanpa sesi apa pun,
    // GET-nya memang 401 (guard auth jalan duluan), dan redirect-nya membuat user yang salah
    // ketik URL mendarat di halaman login tanpa satu kalimat pun penjelasan (B14).
    if (isUnauthorized && !malformedId) redirectToApp();
  }, [isUnauthorized, malformedId]);

  // Tak ada lagi lapisan simulasi di sini: apa yang tampil = apa yang dikatakan backend.
  const order = fetched;

  // AKAR temuan F2 (countdown melompat 11:07 → 59:52): `expiresAt` bukan satu tenggat. Sebelum
  // metode dipilih ia batas hidup ORDER; POST /pay menerbitkan VA dan mengembalikan order yang
  // sama dengan `expiresAt` BARU — batas hidup VA, biasanya jauh lebih panjang. Bukan pembulatan
  // dan bukan jam klien: sumber waktunya yang berganti, di slot tampilan yang sama.
  //
  // Yang bisa dilakukan halaman tanpa mengubah kontrak API: menamai kedua tenggat itu berbeda
  // (lihat `CHECKOUT_COPY.countdown*`) dan MENGAKUI lompatannya kepada orang yang menyaksikannya.
  // Ref, bukan state: nilainya cuma dibaca saat render berikutnya, tak perlu memicu render.
  const lastDeadline = useRef<number | null>(null);
  const [deadlineExtended, setDeadlineExtended] = useState(false);
  useEffect(() => {
    if (!order) return;
    const next = new Date(order.expiresAt).getTime();
    if (!Number.isFinite(next)) return;
    const prev = lastDeadline.current;
    lastDeadline.current = next;
    // Ambang 1 detik: pembaruan poll yang mengembalikan tenggat sama persis tak boleh terbaca
    // sebagai perpanjangan.
    if (prev !== null && next - prev > 1000) setDeadlineExtended(true);
  }, [order]);

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
    // Exchange in-flight juga = "memuat" (GET mint belum boleh jalan). Id yang bentuknya sudah
    // salah tak perlu spinner: jawabannya sudah pasti sebelum jaringan menjawab.
    isLoading: !malformedId && (waitingForExchange || query.isLoading),
    isError: query.isError || malformedId,
    // Kenapa gagal — halaman memilih layar dari sini, bukan menebak (B5/B14).
    errorKind: errorKindOf(query.error, malformedId),
    isUnauthorized: isUnauthorized && !malformedId,
    // Muat ulang pesanan tanpa reload halaman. Dipakai layar "gangguan sementara".
    retry: () => {
      void query.refetch();
    },
    isRetrying: query.isFetching,
    pay: (channel: PaymentChannel, bank?: VaBank | null) =>
      payMutation.mutateAsync({ channel, bank }),
    isPaying: payMutation.isPending,
    payError: payErrorMessage(payMutation.error),
    secondsLeft,
    isExpired,
    isTerminal,
    deadlineExtended,
  };
}
