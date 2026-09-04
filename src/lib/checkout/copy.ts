// Teks halaman checkout jalur aplikasi (`/checkout/{orderId}`).
//
// Repo ini single-locale (Bahasa Indonesia) dan TIDAK memakai pustaka i18n. Konvensi yang sudah
// ada untuk teks layar adalah modul copy tersendiri — lihat `@/lib/partner/copy` untuk jalur
// partner. Berkas ini pasangannya untuk jalur aplikasi: string yang lahir/berubah karena audit
// UI 3 September 2026 ditaruh di sini supaya kalimat yang menyangkut uang bisa dibaca sekali
// jalan, bukan diburu di tengah JSX.
//
// SUMBER: Figma `TXzbmT9lo27cse6IwqSuEP`, page `DS · Standar 2026-09`, section `50` (blok A
// state A1/A2, blok B state B4a/B4b, blok C state C1). Dikutip dari node teksnya, dengan DUA
// penyimpangan yang disengaja:
//
//  1. Sapaan. Desain section `50` menulis "Anda"; seluruh checkout yang sudah jalan menulis
//     "kamu" (dan temuan D6 memutuskan "kamu"). Satu layar yang tiba-tiba ber-"Anda" di tengah
//     halaman ber-"kamu" lebih terasa salah daripada menyimpang dari desain.
//  2. Tombol "Hubungi dukungan" di layar FAILED + PAID (blok C) TIDAK dipasang. Salurannya
//     belum ada di kode — tombol itu akan jadi janji palsu tepat di layar tempat orang paling
//     butuh ditepati. Gantinya nomor pesanan yang bisa disalin sebagai rujukan.

/** Satu nama untuk angka yang benar-benar ditagih (temuan D5). Dulu "Total yang dibayar" di
 *  ringkasan dan "Jumlah yang harus dibayar" di instruksi VA — dua label, satu angka. */
export const TOTAL_LABEL = "Total bayar";

export const CHECKOUT_COPY = {
  // ── Countdown (temuan F2) ──────────────────────────────────────────────────────────────────
  // `expiresAt` berganti ARTI setelah POST /pay: sebelum metode dipilih ia batas hidup ORDER
  // (±15 menit), sesudahnya batas hidup VA (±60 menit). Satu label untuk dua tenggat itulah yang
  // membuat angkanya terlihat melompat 11:07 → 59:52. Jadi tenggatnya diberi nama masing-masing,
  // dan lompatannya diakui secara eksplisit kepada orang yang menyaksikannya.
  countdownBeforeMethod: "Batas memilih metode",
  countdownAfterMethod: (channel: string | null): string =>
    channel === "QRIS"
      ? "Batas bayar QRIS"
      : channel === "VA"
        ? "Batas bayar Virtual Account"
        : "Batas bayar",
  countdownExtendedNote: (channel: string | null): string =>
    channel === "QRIS"
      ? "Waktu bayar diperpanjang untuk QRIS ini."
      : "Waktu bayar diperpanjang untuk VA ini.",

  // ── Gagal memuat pesanan (temuan B5 & B14) ─────────────────────────────────────────────────
  // 404 dan 500 dulu sama-sama berbunyi "Pesanan tidak ditemukan atau sesi tidak valid" — yang
  // pertama benar, yang kedua menyuruh user menyerah atas pesanan yang sebenarnya ada.
  notFoundHeading: "Pesanan tidak ditemukan",
  notFoundBody:
    "Tautan ini tidak mengarah ke pesanan mana pun di akun kamu. Periksa Riwayat di aplikasi USDX.",
  malformedIdHeading: "Nomor pesanan tidak valid",
  malformedIdBody:
    "Alamat halaman ini tidak memuat nomor pesanan yang benar. Buka lagi pesanannya dari aplikasi USDX.",
  unavailableHeading: "Gagal memuat pesanan",
  unavailableBody:
    "Ada gangguan di sisi kami. Pesanan dan pembayaran kamu tidak terpengaruh — coba lagi sebentar.",
  retryCta: "Coba lagi",
  retryingCta: "Memuat…",
  openHistoryCta: "Buka Riwayat di app",
  backToAppCta: "Kembali ke app",

  // ── FAILED + PAID (temuan B4) ──────────────────────────────────────────────────────────────
  // Keadaan paling berbahaya di seluruh audit: uang sudah bergerak, pesanannya gagal, dan
  // layarnya dulu identik dengan pesanan sehat ("Pembayaran diterima — sedang diproses").
  failedPaidHeading: "Pengiriman USDX gagal",
  failedPaidAmount: (amount: string): string => `${amount} sudah diterima`,
  failedPaidBodyLead: "Uang kamu sudah masuk dan tercatat di pesanan ini, tapi USDX tidak jadi terkirim ke wallet.",
  failedPaidBodyWarning: "Jangan transfer lagi.",
  failedPaidBodyTail: "Pembayarannya tetap tercatat dan sedang ditangani tim kami.",
  // ── HELD + FAILED · ops menolak kredit (temuan validator, kelas B4) ────────────────────────
  // `sot/conventions.md § Status Enums` dan `sot/bni-integration.md §6`: ops menolak → order
  // `status=FAILED` sementara `payment_status` TETAP `HELD` (enum-nya tak punya `FAILED`, dan
  // uangnya memang masuk), refund IDR **manual** oleh treasury — tak ada auto-refund.
  //
  // Layar "sedang ditinjau" untuk keadaan ini adalah kebohongan waktu: reviewnya SUDAH selesai
  // dan hasilnya tolak. Dan karena tak ada auto-refund, orang yang tidak diberi tahu akan
  // menunggu dana yang tak akan datang sendiri.
  heldRejectedHeading: "Pesanan gagal, dana dikembalikan",
  heldRejectedBodyLead:
    "Transfer kamu masuk, tapi tidak jadi dicocokkan ke pesanan ini dan pesanannya ditutup.",
  heldRejectedBodyWarning: "Jangan transfer lagi.",
  // Nominal yang benar-benar masuk tidak dikirim ke FE untuk order HELD (justru ketidakcocokan
  // nominal itu yang menyeretnya ke HELD), jadi tak ada angka yang boleh diklaim di sini.
  heldRejectedBodyTail:
    "Pengembalian dana diproses manual oleh tim kami, bukan otomatis — jadi tidak instan. Simpan nomor pesanan di bawah sebagai rujukan.",

  // Pengganti tombol "Hubungi dukungan" di desain: rujukan yang bisa dipakai user, bukan
  // saluran yang belum ada.
  orderReferenceLabel: "Nomor pesanan",
  orderReferenceNote: "Simpan nomor ini sebagai rujukan kalau kamu perlu menanyakan pesanan ini.",
  copyAriaLabel: "Salin nomor pesanan",

  // ── Status yang tidak kita pahami (temuan validator no. 4) ─────────────────────────────────
  // Enum baru dari backend dulu mendarat di cabang terakhir: instruksi bayar lengkap dengan
  // nomor VA, "Total bayar", dan countdown. Dari semua fallback yang mungkin, itu yang paling
  // mahal — menyuruh orang mentransfer uang untuk keadaan yang kita sendiri tidak paham.
  unknownStateHeading: "Status pesanan belum bisa ditampilkan",
  unknownStateBody:
    "Kami belum bisa membaca keadaan pesanan ini dengan pasti. Jangan transfer apa pun dulu — cek pesanannya di Riwayat aplikasi USDX, atau muat ulang halaman ini.",

  // ── Instruksi bayar (temuan F1) ────────────────────────────────────────────────────────────
  // Layar VA dulu satu-satunya layar tanpa jalan pulang — justru layar tempat orang paling
  // mungkin berpikir ulang.
  leaveNote: (channel: string | null): string =>
    channel === "QRIS"
      ? "QR ini tetap berlaku sampai waktu habis. Pesanan ini ada di Riwayat aplikasi USDX."
      : "VA tetap berlaku sampai waktu habis. Pesanan ini ada di Riwayat aplikasi USDX.",

  // ── Pilih metode (temuan D4) ───────────────────────────────────────────────────────────────
  // Angka yang benar-benar harus dibayar dulu baru muncul SETELAH metode diklik.
  totalDependsOnMethodNote: "Angka pastinya mengikuti metode yang kamu pilih.",
  // Judul grup radio kedua (Figma `50` blok A, state A1b). Sekaligus nama grup yang dibacakan
  // pembaca layar lewat `aria-label`.
  chooseBankLabel: "Pilih bank",
} as const;
