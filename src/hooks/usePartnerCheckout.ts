"use client";

// Logika checkout jalur partner (USDX-548). SENGAJA terpisah dari `useCheckout`.
//
// Bukan karena duplikasi itu bagus, tapi karena dua jalur ini punya siklus hidup yang berbeda
// di tiga hal yang semuanya menyangkut uang, dan menyatukannya berarti setiap perubahan di satu
// jalur menanggung risiko diam-diam mengubah jalur satunya:
//
//   1. Kredensial — aplikasi memakai sesi hasil handoff `#code=` di slot `usdx_checkout_token`;
//      partner memakai sesi hasil resolve tautan, di slot sendiri.
//   2. Kapan berhenti menunggu — aplikasi BOLEH menunggui `WAITING_FOR_APPROVAL` sampai selesai,
//      karena penunggunya punya aplikasi USDX yang akan memberitahunya. Customer partner TIDAK
//      punya apa pun dari kami: tak ada akun, tak ada notifikasi (keputusan Wisnu). Menahannya
//      di tab kami sampai multisig cair — "bisa berjam-jam" — berarti menahan orang di halaman
//      milik pihak yang bahkan tidak dia kenal.
//   3. Umur sesi — sesi partner dibatasi MIN(umur sesi, umur order); jalur aplikasi hanya punya
//      umur order.
//
// `useCheckout` TIDAK disentuh sama sekali oleh tiket ini. Itu bukan kebetulan, itu syaratnya.

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMintOrder, payMintOrder } from "@/lib/api/mint";
import { isApiError, isRateLimited, isValidationError, getRateLimitSeconds } from "@/lib/api/errors";
import { isPartnerSessionExpired, secondsUntilEffectiveExpiry } from "@/lib/partner/expiry";
import type { PartnerCheckoutSession } from "@/lib/partner/types";
import type { MintOrderDetail, VaBank } from "@/types";

const POLL_MS = 5000;

// Anggaran polling. Setelah ini halaman BERHENTI memanggil sendiri dan menyodorkan tombol
// "Perbarui status". Batasnya ada supaya tab yang ditinggalkan terbuka semalaman tidak terus
// memukuli backend — dan supaya "jangan polling tanpa batas" jadi angka, bukan niat.
export const MAX_POLL_WINDOW_MS = 15 * 60 * 1000;

// Status yang berarti customer TIDAK lagi punya tindakan di halaman ini. Begitu salah satunya
// muncul, polling berhenti dan halaman menawarkan jalan keluar.
const NO_LONGER_WAITING_ON_CUSTOMER = new Set([
  "WAITING_FOR_APPROVAL",
  "COMPLETED",
  "FAILED",
  "HELD",
]);

// HTTP status yang semuanya berarti hal yang sama bagi customer: tautan ini tidak membuka apa
// pun. Diratakan agar pesannya tidak membocorkan apakah ordernya ada.
const SESSION_INVALID_STATUSES = new Set([401, 403, 404, 410]);

function payErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (isRateLimited(error)) return null;
  if (isApiError(error)) {
    if (error.code === "INVALID_ORDER_STATE")
      return "Pesanan ini tidak lagi bisa memilih metode pembayaran.";
    if (isValidationError(error)) return "Pilihan pembayaran tidak valid. Coba pilih bank lain.";
  }
  return "Gagal memproses pembayaran. Silakan coba lagi.";
}

export interface PartnerCheckoutState {
  order: MintOrderDetail | null;
  isLoading: boolean;
  isError: boolean;
  /** Sesi tak berlaku lagi (401/403 di tengah jalan, atau batas efektif terlampaui). */
  isSessionInvalid: boolean;
  /** Uang sudah masuk / order tak lagi menunggu tindakan customer → tampilkan jalan keluar. */
  isDoneWaiting: boolean;
  /** Anggaran polling habis; halaman berhenti memanggil sendiri. */
  isPollBudgetSpent: boolean;
  secondsLeft: number;
  pay: (bank: VaBank) => Promise<MintOrderDetail>;
  isPaying: boolean;
  payError: string | null;
  refresh: () => void;
}

export function usePartnerCheckout(session: PartnerCheckoutSession | null): PartnerCheckoutState {
  const queryClient = useQueryClient();
  const orderId = session?.orderId ?? "";
  const bearer = session?.sessionToken;

  // Jam dinding untuk countdown DAN untuk mengevaluasi ulang kedaluwarsa efektif.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Awal jendela polling. State (bukan ref) karena nilainya IKUT menentukan apa yang dirender —
  // begitu anggarannya habis, tombol "Perbarui status" muncul. Tombol itu membuka jendela baru.
  const [pollWindowStart, setPollWindowStart] = useState(() => Date.now());
  const [pollWindowEpoch, setPollWindowEpoch] = useState(0);

  const query = useQuery({
    queryKey: ["partner-mint-order", orderId, pollWindowEpoch],
    queryFn: () => getMintOrder(orderId, bearer),
    enabled: Boolean(orderId && bearer),
    retry: false,
    refetchInterval: (q) => {
      const order = q.state.data;
      if (!order) return false;

      // Selesai menunggu customer → berhenti. Ini poin utama tiket: `WAITING_FOR_APPROVAL`
      // adalah keadaan TERLAMA, dan menungguinya di halaman ini tidak menghasilkan apa pun
      // bagi customer yang tak akan kami hubungi.
      if (NO_LONGER_WAITING_ON_CUSTOMER.has(order.status)) return false;
      if (order.paymentStatus === "PAID" || order.paymentStatus === "HELD") return false;
      if (order.paymentStatus === "EXPIRED") return false;

      // Sesi/order sudah lewat batas efektif → tak ada gunanya bertanya lagi.
      if (isPartnerSessionExpired(session?.expiresAt, order.expiresAt)) return false;

      // Anggaran polling habis → serahkan ke tombol.
      if (Date.now() - pollWindowStart >= MAX_POLL_WINDOW_MS) return false;

      if (isRateLimited(q.state.error)) {
        return Math.max(1, getRateLimitSeconds(q.state.error) ?? 1) * 1000;
      }
      return POLL_MS;
    },
  });

  const order = query.data ?? null;

  // Sesi tak berlaku lagi. 401/403/404/410 diratakan jadi SATU keadaan, dan itu disengaja:
  // membedakan "tak berhak" dari "tidak ada" memberi tahu pemegang tautan acak apakah suatu
  // pesanan ADA. Halaman ini tidak punya kepentingan membedakannya di depan customer.
  //
  // TIDAK ada redirect ke `app` di sini: customer partner tak punya akun di sana, melemparnya
  // ke layar login USDX adalah jalan buntu yang membingungkan.
  const unauthorized =
    isApiError(query.error) && SESSION_INVALID_STATUSES.has(query.error.status);

  // Batas efektif = MIN(sesi, order). Tanpa order (belum termuat) pakai batas sesi saja.
  const expired = isPartnerSessionExpired(session?.expiresAt, order?.expiresAt ?? null, now);
  const moneyIn = order?.paymentStatus === "PAID" || order?.paymentStatus === "HELD";

  // Sesi kedaluwarsa TIDAK menutup halaman kalau uangnya sudah masuk: customer yang sudah
  // transfer berhak melihat konfirmasinya, bukan layar "tautan tidak berlaku" yang bikin panik.
  const isSessionInvalid = unauthorized || (expired && !moneyIn);

  const isDoneWaiting = Boolean(
    order && (moneyIn || NO_LONGER_WAITING_ON_CUSTOMER.has(order.status)),
  );

  const isPollBudgetSpent =
    Boolean(order) && !isDoneWaiting && !expired && now - pollWindowStart >= MAX_POLL_WINDOW_MS;

  const payMutation = useMutation({
    mutationFn: (bank: VaBank) => payMintOrder(orderId, { channel: "VA", bank }, bearer),
    onSuccess: (updated) => {
      queryClient.setQueryData(["partner-mint-order", orderId, pollWindowEpoch], updated);
    },
  });

  // Buka jendela polling baru + ambil sekali sekarang.
  const refresh = useCallback(() => {
    setPollWindowStart(Date.now());
    setPollWindowEpoch((e) => e + 1);
  }, []);

  return {
    order,
    isLoading: query.isLoading,
    isError: query.isError && !unauthorized,
    isSessionInvalid,
    isDoneWaiting,
    isPollBudgetSpent,
    secondsLeft: secondsUntilEffectiveExpiry(session?.expiresAt, order?.expiresAt ?? null, now),
    pay: (bank: VaBank) => payMutation.mutateAsync(bank),
    isPaying: payMutation.isPending,
    payError: payErrorMessage(payMutation.error),
    refresh,
  };
}
