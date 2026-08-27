// Teks halaman checkout partner (USDX-548) — satu tempat, dua presentasi.
//
// Dua aturan mengikat yang membentuk hampir seluruh isi berkas ini:
//
// 1. KAMI TIDAK MENGHUBUNGI CUSTOMER PARTNER (keputusan Wisnu). Tidak ada email, tidak ada
//    notifikasi, tidak ada akun. Jadi tidak satu pun kalimat di sini boleh menjanjikan kabar
//    DARI KAMI. Yang boleh dikatakan: kelanjutannya diberitahukan oleh partnernya — itu memang
//    yang terjadi (partner menerima webhook `mint.completed`).
//
// 2. PRESENTASI `NEUTRAL` TIDAK MENYEBUT KAMI SAMA SEKALI. Bukan cuma logo: tidak ada nama
//    USDX, tidak ada tautan usdx.co.id, dan tidak ada istilah yang hanya hidup di dalam tim —
//    "mint", "multisig", "on-chain", "Safe", "wallet", "token". Customer partner sedang membayar
//    tagihan; ia tidak sedang mengoperasikan produk kripto, dan kata-kata itu cuma membuatnya
//    ragu apakah ia salah membuka halaman.
//
// Presentasi `USDX` memakai chrome kami (nama + tautan + dukungan), tapi ISI kalimat statusnya
// sama — karena kenyataannya sama: customer-nya tetap tidak punya akun di sisi kami.

import type { CheckoutPresentation } from "./types";

export interface PartnerCopy {
  /** `document.title`. NEUTRAL wajib tanpa nama kami — judul tab ikut terbaca. */
  documentTitle: string;
  payHeading: string;
  chooseBankHeading: string;
  chooseBankHint: string;
  amountLabel: string;
  vaNumberLabel: string;
  countdownPrefix: string;
  howToPayHeading: string;
  paidHeading: string;
  /** Konfirmasi + siapa yang memberi kabar. TIDAK PERNAH menjanjikan kabar dari kami. */
  paidBody: string;
  /** Uang MASUK tapi pesanannya gagal. Konfirmasi uangnya tetap wajib disebut lebih dulu. */
  paidButFailedHeading: string;
  paidButFailedBody: string;
  heldHeading: string;
  heldBody: string;
  completedHeading: string;
  completedBody: string;
  failedHeading: string;
  failedBody: string;
  expiredHeading: string;
  expiredBody: string;
  /** Tombol jalan keluar ke `return_url`. */
  returnCta: string;
  /** Ditampilkan saat `return_url` tidak lolos validasi → tak ada tombol. */
  noReturnUrlNote: string;
  refreshCta: string;
  pollStoppedNote: string;
}

/** Nama yang dipakai menyebut penerima kabar. Tanpa branding → sebutan generik, bukan "USDX". */
function partnerLabel(displayName: string | null | undefined): string {
  const name = displayName?.trim();
  return name && name.length > 0 ? name : "penyedia layanan kamu";
}

export function partnerCopy(
  presentation: CheckoutPresentation,
  displayName: string | null | undefined,
): PartnerCopy {
  const partner = partnerLabel(displayName);

  // Sama untuk kedua presentasi: yang berbeda hanya chrome (logo, warna, footer), bukan
  // kebenaran tentang siapa yang menghubungi customer.
  const paidBody = `Tidak perlu transfer lagi. Kelanjutan pesanan kamu diberitahukan oleh ${partner}.`;
  const heldBody = `Transfer kamu sudah masuk tapi belum cocok otomatis dengan pesanan ini, dan sedang diperiksa. Jangan transfer lagi — hubungi ${partner} kalau butuh bantuan.`;

  const shared: Omit<PartnerCopy, "documentTitle"> = {
    payHeading: "Pembayaran",
    chooseBankHeading: "Pilih bank untuk transfer",
    chooseBankHint: "Nomor Virtual Account akan muncul setelah bank dipilih.",
    amountLabel: "Total pembayaran",
    vaNumberLabel: "Nomor Virtual Account",
    countdownPrefix: "Selesaikan pembayaran dalam",
    howToPayHeading: "Cara pembayaran",
    paidHeading: "Pembayaran diterima",
    paidBody,
    paidButFailedHeading: "Pembayaran diterima",
    paidButFailedBody: `Pembayaran kamu tercatat, tapi pesanan ini tidak bisa dilanjutkan. Jangan transfer lagi — hubungi ${partner}.`,
    heldHeading: "Pembayaran sedang ditinjau",
    heldBody,
    completedHeading: "Pembayaran selesai",
    completedBody: `Pesanan kamu sudah diselesaikan. Rincian selanjutnya ada di ${partner}.`,
    failedHeading: "Pembayaran tidak dapat diselesaikan",
    failedBody: `Pesanan ini tidak bisa dilanjutkan. Silakan ulangi dari ${partner}.`,
    expiredHeading: "Waktu pembayaran habis",
    expiredBody: `Nomor Virtual Account pesanan ini sudah tidak berlaku. Silakan buat pesanan baru dari ${partner}.`,
    returnCta: `Kembali ke ${partner}`,
    noReturnUrlNote: `Tutup halaman ini dan kembali ke ${partner}.`,
    refreshCta: "Perbarui status",
    pollStoppedNote:
      "Halaman berhenti memeriksa otomatis. Tekan Perbarui status kalau kamu sudah transfer.",
  };

  return presentation === "USDX"
    ? { ...shared, documentTitle: "Pembayaran USDX" }
    : // NEUTRAL: judul memakai nama partner kalau ada; kalau tidak, kata generik. Tidak pernah
      // nama kami.
      {
        ...shared,
        documentTitle:
          displayName?.trim() ? `Pembayaran — ${displayName.trim()}` : "Pembayaran",
      };
}
