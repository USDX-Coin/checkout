// VA banks yang didukung provider (common.yaml VaBank). Dipakai sebagai fallback statis
// untuk pemilih metode saat GET /v2/mint/{id} tidak mengembalikan channels[] (mis.
// backend lama tanpa USDX-216).
export const VA_BANKS = [
  "BCA", "BNI", "BRI", "CIMB", "DANAMON", "INA", "MANDIRI", "PERMATA", "MAYBANK", "NOBU",
] as const;

// Urutan TAMPIL bank di lapis "Pilih bank" dan di keterangan kartu Virtual Account.
//
// Backend mengirim `channels[].banks` tanpa janji urutan, dan halaman ini mem-poll GET
// tiap beberapa detik: kalau urutan responsnya bergeser, ubin bank ikut bertukar tempat di
// bawah jari orang yang sedang memilih rekening tujuan. Jadi urutannya ditentukan di sini,
// mengikuti Figma A1b (`2639:32217`: Mandiri → BRI → BNI). Bank yang tidak disebut di daftar
// ini tetap tampil, di belakang, dengan urutan apa adanya dari backend — daftar ini mengatur
// prioritas, bukan menyaring.
// NOBU di depan (USDX-622): per 7 Sep 2026 itu satu-satunya bank yang benar-benar bisa dipakai —
// tiga sisanya menunggu aktivasi DurianPay dan tampil dalam keadaan mati. Yang bisa diklik pantas
// dibaca lebih dulu.
export const VA_BANK_ORDER = ["NOBU", "MANDIRI", "BRI", "BNI"] as const;

export function sortVaBanks<T extends string>(banks: readonly T[]): T[] {
  const rank = (b: T) => {
    const i = (VA_BANK_ORDER as readonly string[]).indexOf(b);
    return i === -1 ? VA_BANK_ORDER.length : i;
  };
  return banks.map((b, i) => ({ b, i })).sort((x, y) => rank(x.b) - rank(y.b) || x.i - y.i).map((e) => e.b);
}

// Brand per bank untuk pemilih metode (USDX-202). `logo` → SVG/PNG resmi di
// public/image/banks/ di atas tile putih; `mark`/`bg`/`fg` fallback wordmark untuk bank
// tanpa aset logo. Logo dipakai sebagai penanda metode bayar (functional/nominative use)
// — konfirmasi hak brand-kit sebelum produksi.
// `name` = nama bank seperti ditulis untuk dibaca orang (Figma A1a: "Mandiri · BRI · BNI"),
// bukan enum backend yang kapital semua. Singkatan tetap kapital karena memang begitu dieja.
export const BANK_BRAND: Record<
  (typeof VA_BANKS)[number],
  { bg: string; fg: string; mark: string; name: string; logo?: string }
> = {
  BCA: { bg: "#0066AE", fg: "#ffffff", mark: "BCA", name: "BCA", logo: "/image/banks/bca.svg" },
  BNI: { bg: "#EE7203", fg: "#ffffff", mark: "BNI", name: "BNI", logo: "/image/banks/bni.svg" },
  BRI: { bg: "#00529C", fg: "#ffffff", mark: "BRI", name: "BRI", logo: "/image/banks/bri.svg" },
  CIMB: { bg: "#7A0C2E", fg: "#ffffff", mark: "CIMB", name: "CIMB", logo: "/image/banks/cimb.svg" },
  DANAMON: { bg: "#005EB8", fg: "#ffffff", mark: "DNM", name: "Danamon", logo: "/image/banks/danamon.svg" },
  INA: { bg: "#0E7C7B", fg: "#ffffff", mark: "INA", name: "INA", logo: "/image/banks/ina.png" },
  MANDIRI: { bg: "#003D79", fg: "#ffffff", mark: "MDR", name: "Mandiri", logo: "/image/banks/mandiri.svg" },
  PERMATA: { bg: "#00945E", fg: "#ffffff", mark: "PRM", name: "Permata", logo: "/image/banks/permata.svg" },
  MAYBANK: { bg: "#FFC400", fg: "#1A1A1A", mark: "MBK", name: "Maybank", logo: "/image/banks/maybank.svg" },
  // Tanpa `logo`: aset resmi Nobu belum ada di public/image/banks/. Fallback wordmark memang
  // disediakan `BANK_BRAND` untuk kasus ini, jadi banknya tetap tampil rapi sambil menunggu aset.
  NOBU: { bg: "#0B3B8C", fg: "#ffffff", mark: "NOBU", name: "Nobu" },
};

// Merah brand QRIS untuk badge/kartu instruksi QRIS.
export const QRIS_RED = "#D2232A";
