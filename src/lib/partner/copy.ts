// Teks halaman checkout partner (USDX-548) — satu tempat, dua presentasi.
//
// SUMBER: Figma `TXzbmT9lo27cse6IwqSuEP`, halaman `Checkout — Neutral` (frame N01–N08, baris
// LIGHT + DARK) dan `Checkout — USDX Brand` (baris REDESAIN + REDESAIN · DARK). Baris berlabel
// "SEKARANG" di halaman brand adalah clone lama dan BUKAN acuan — yang diikuti baris REDESAIN.
// String di bawah dikutip dari node teks desain, bukan dikarang ulang.
//
// Frame N09 sengaja TIDAK diimplementasikan: itu layar aplikasi partner sendiri. Desainnya
// menyatakannya terang-terangan — "Layar ini milik partner — USDX tidak mengaturnya. Yang kita
// kirim hanya pengalihan ke return_url."
//
// ── DUA ATURAN YANG MEMBENTUK ISI BERKAS INI ─────────────────────────────────────────────────
//
// 1. KAMI TIDAK MENGHUBUNGI CUSTOMER PARTNER (keputusan Wisnu). Desain sepakat dan menuliskannya
//    eksplisit di N04: "Kami beri tahu partner-mu begitu token terkirim." Yang kami beri tahu
//    adalah PARTNER-nya, lewat webhook. Jadi tidak satu pun kalimat di sini menjanjikan email
//    atau notifikasi KEPADA CUSTOMER.
//
// 2. PRESENTASI `NEUTRAL` = TANPA KOIN & LOCKUP USDX, warna partner — TAPI BUKAN penyensoran
//    kata "USDX". Ini koreksi terhadap tafsir pertama saya, yang melarang kata "USDX" sama
//    sekali. Desain netral menampilkan ticker aset ("60,606060 USDX"), penyebut kurs ("/ USDX"),
//    dan SATU baris pemroses di footer N01. Catatan baris desainnya sendiri berbunyi:
//    "Tanpa koin dan lockup USDX; tombol dan aksen pakai warna partner. Nama pemroses tetap
//    disebut kecil di footer — itu keputusan yang perlu dikonfirmasi."
//    Jadi baris footer itu memang ada di desain DAN memang ditandai belum final oleh desainernya.
//    Lihat § Decisions Needed di deskripsi PR.

import type { CheckoutPresentation } from "./types";

/**
 * Baris pemroses di footer ringkasan pesanan.
 *
 * Badan hukum penerbit, bukan nama produk — karena inilah yang punya arti saat customer perlu
 * tahu siapa yang benar-benar memproses uangnya. Dikutip dari desain apa adanya; kalau badan
 * hukumnya berganti, ini satu-satunya tempat yang perlu diubah.
 */
export const PROCESSOR_DISCLOSURE = "Diproses oleh USDX · PT Macan Asia Finance";

export interface PartnerCopy {
  /** `document.title`. */
  documentTitle: string;
  /** Judul di top bar. */
  title: string;
  /** Baris nama partner di bawah top bar (khusus ringkasan pesanan). */
  partnerLine: string;

  // N01 · Ringkasan pesanan
  rateLockedLabel: string;
  rateUnit: string;
  orderNoLabel: string;
  youReceiveLabel: string;
  subtotalLabel: string;
  mintFeeLabel: string;
  vaFeeLabel: string;
  totalLabel: string;
  walletLabel: string;
  irreversibleWarning: string;
  continueCta: string;

  // N02 · Pilih metode
  countdownLabel: string;
  chooseBankHeading: string;
  vaMethodLabel: string;
  bankListNote: string;
  totalPlusFeeLabel: string;
  payNowCta: string;

  // N03 · Instruksi bayar
  vaCardTitle: string;
  vaNumberLabel: string;
  copyCta: string;
  howToPayHeading: string;
  howToPaySteps: (bank: string | null) => string[];
  selfUpdatingNote: string;

  // N04 · Pembayaran diterima
  paidBanner: string;
  awaitingDeliveryLabel: string;
  stepperLabel: string;
  stepPaymentLabel: string;
  stepPaymentDetail: (amount: string, time: string) => string;
  stepOnChainLabel: string;
  stepOnChainDetail: string;
  stepDoneLabel: string;
  destinationLabel: string;
  approvalNote: string;
  /** Catatan di bawah tombol: siapa yang diberi tahu, dan bahwa menunggu tak perlu. */
  noWaitingNote: string;

  // N05 · Selesai
  successHeading: string;
  successSubtitle: string;
  creditedToLabel: string;
  totalPaidLabel: string;
  onChainProofLabel: string;

  // N06 · Kedaluwarsa
  expiredBanner: string;
  expiredHeading: string;
  expiredBody: string;
  expiredVaLabel: string;
  valueLabel: string;
  statusLabel: string;
  newOrderCta: string;

  // N07 · Gagal
  failedHeading: string;
  failedBody: string;
  /** Gagal SEBELUM uang masuk — tak boleh berkata pembayaran sudah diterima. */
  failedNoPaymentBody: string;
  failedHelpNote: string;
  retryOrderCta: string;

  // N08 · Gagal muat
  loadFailedHeading: string;
  loadFailedBody: string;
  loadFailedReassurance: string;
  codeLabel: string;
  retryCta: string;

  // Jalan keluar
  returnCta: string;
  /** Saat `return_url` tidak lolos validasi → tak ada tombol, tapi tetap ada arahan. */
  noReturnUrlNote: string;

  // Keadaan lain
  rejectedHeading: string;
  loadingLabel: string;
  methodUnavailable: string;
  pollStoppedNote: string;
  refreshStatusCta: string;
}

/** Nama partner untuk disebut dalam kalimat. Tanpa branding → sebutan generik, bukan "USDX". */
function partnerLabel(displayName: string | null | undefined): string {
  const name = displayName?.trim();
  return name && name.length > 0 ? name : "penyedia layanan kamu";
}

export function partnerCopy(
  presentation: CheckoutPresentation,
  displayName: string | null | undefined,
): PartnerCopy {
  const partner = partnerLabel(displayName);
  const isUsdx = presentation === "USDX";
  const name = displayName?.trim();

  return {
    documentTitle: isUsdx ? "Pembayaran USDX" : name ? `Pembayaran — ${name}` : "Pembayaran",
    // Judul top bar: desain memakai "Bayar dengan USDX" di presentasi brand dan "Pembayaran"
    // polos di presentasi netral.
    title: isUsdx ? "Bayar dengan USDX" : "Pembayaran",
    partnerLine: isUsdx ? `Pesanan dari ${partner}` : partner,

    rateLockedLabel: "Kurs terkunci",
    rateUnit: "/ USDX",
    orderNoLabel: "No. pesanan",
    youReceiveLabel: "Kamu terima",
    subtotalLabel: "Subtotal",
    mintFeeLabel: "Biaya mint",
    vaFeeLabel: "Biaya virtual account",
    totalLabel: "Total bayar",
    walletLabel: "Wallet customer",
    irreversibleWarning:
      "Transaksi on-chain tidak bisa dibatalkan. Pastikan alamat tujuan benar.",
    continueCta: "Lanjut ke pembayaran",

    countdownLabel: "Selesaikan pembayaran dalam",
    chooseBankHeading: "Pilih bank untuk virtual account",
    vaMethodLabel: "Transfer bank (virtual account)",
    bankListNote: "Hanya bank di atas yang tersedia. Daftarnya diambil saat halaman dibuka.",
    totalPlusFeeLabel: "Total + biaya",
    payNowCta: "Bayar sekarang",

    vaCardTitle: "Virtual Account",
    vaNumberLabel: "No. Virtual Account",
    copyCta: "Salin",
    howToPayHeading: "Cara bayar",
    // Langkah 1 menyebut bank yang benar-benar dipilih — desain menuliskan "Buka aplikasi
    // Mandiri atau internet banking" pada contoh Mandiri. Tanpa bank yang diketahui, kalimatnya
    // digeneralisasi alih-alih menyebut bank yang salah.
    howToPaySteps: (bank: string | null) => [
      bank
        ? `1. Buka aplikasi ${bank} atau internet banking`
        : "1. Buka aplikasi bank kamu atau internet banking",
      "2. Pilih Bayar → Virtual Account",
      "3. Masukkan nomor di atas, pastikan nominalnya sama persis",
    ],
    selfUpdatingNote:
      "Halaman ini memperbarui sendiri setelah pembayaran masuk. Kamu tidak perlu menekan apa pun.",

    paidBanner: "Pembayaran diterima. Transaksimu aman.",
    awaitingDeliveryLabel: "Menunggu pengiriman",
    stepperLabel: "Langkah 2 dari 3 · menunggu persetujuan",
    stepPaymentLabel: "Pembayaran",
    stepPaymentDetail: (amount: string, time: string) =>
      time ? `${amount} diterima ${time}` : `${amount} diterima`,
    stepOnChainLabel: "Proses on-chain",
    stepOnChainDetail:
      "Menunggu persetujuan internal sebelum token dikirim. Bisa memakan waktu beberapa jam.",
    stepDoneLabel: "Selesai",
    destinationLabel: "Tujuan",
    approvalNote:
      "Pengiriman token menunggu persetujuan internal dan bisa berjalan beberapa jam. Tidak ada lagi yang perlu kamu lakukan — silakan kembali ke aplikasi.",
    noWaitingNote:
      "Kamu tidak perlu menunggu di halaman ini. Kami beri tahu partner-mu begitu token terkirim.",

    // Desain memakai judul berbeda per presentasi: netral bicara soal PEMBELIAN, brand bicara
    // soal asetnya.
    successHeading: isUsdx ? "USDX sudah masuk" : "Pembelian berhasil",
    successSubtitle: "Terkirim ke wallet customer",
    creditedToLabel: "Masuk ke wallet",
    totalPaidLabel: "Total dibayar",
    onChainProofLabel: "Bukti on-chain",

    expiredBanner: "Waktu pembayaran habis",
    expiredHeading: "Pesanan kedaluwarsa",
    expiredBody: "Nomor virtual account di atas sudah tidak berlaku.",
    expiredVaLabel: "No. Virtual Account (tidak berlaku)",
    valueLabel: "Nilai",
    statusLabel: "Status",
    newOrderCta: "Buat pesanan baru",

    failedHeading: "Pesanan gagal",
    failedBody: "Pembayaran sudah kami terima, tapi pengiriman token gagal.",
    failedNoPaymentBody: "Pesanan ini tidak bisa dilanjutkan.",
    failedHelpNote: `Butuh bantuan? Sebutkan nomor pesanan di atas saat menghubungi ${partner}.`,
    retryOrderCta: "Coba pesan lagi",

    loadFailedHeading: "Halaman gagal dimuat",
    loadFailedBody: "Kami tidak bisa mengambil data pesanan ini sekarang.",
    loadFailedReassurance:
      "Kalau kamu sudah transfer, dana tetap aman. Pembayaranmu tercatat di sisi bank dan akan kami cocokkan otomatis.",
    codeLabel: "Kode",
    retryCta: "Coba lagi",

    returnCta: `Kembali ke ${partner}`,
    noReturnUrlNote: `Tutup halaman ini dan kembali ke ${partner}.`,

    rejectedHeading: "Tautan tidak berlaku",
    loadingLabel: "Memuat pembayaran…",
    methodUnavailable: "Metode pembayaran belum tersedia. Coba beberapa saat lagi.",
    pollStoppedNote:
      "Halaman berhenti memeriksa otomatis. Tekan Perbarui status kalau kamu sudah transfer.",
    refreshStatusCta: "Perbarui status",
  };
}
