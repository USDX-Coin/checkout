// VA banks yang didukung provider (common.yaml VaBank). Dipakai sebagai fallback statis
// untuk pemilih metode saat GET /v2/mint/{id} tidak mengembalikan channels[] (mis.
// backend lama tanpa USDX-216).
export const VA_BANKS = [
  "BCA", "BNI", "BRI", "CIMB", "DANAMON", "INA", "MANDIRI", "PERMATA", "MAYBANK",
] as const;

// Brand per bank untuk pemilih metode (USDX-202). `logo` → SVG/PNG resmi di
// public/image/banks/ di atas tile putih; `mark`/`bg`/`fg` fallback wordmark untuk bank
// tanpa aset logo. Logo dipakai sebagai penanda metode bayar (functional/nominative use)
// — konfirmasi hak brand-kit sebelum produksi.
export const BANK_BRAND: Record<
  (typeof VA_BANKS)[number],
  { bg: string; fg: string; mark: string; logo?: string }
> = {
  BCA: { bg: "#0066AE", fg: "#ffffff", mark: "BCA", logo: "/image/banks/bca.svg" },
  BNI: { bg: "#EE7203", fg: "#ffffff", mark: "BNI", logo: "/image/banks/bni.svg" },
  BRI: { bg: "#00529C", fg: "#ffffff", mark: "BRI", logo: "/image/banks/bri.svg" },
  CIMB: { bg: "#7A0C2E", fg: "#ffffff", mark: "CIMB", logo: "/image/banks/cimb.svg" },
  DANAMON: { bg: "#005EB8", fg: "#ffffff", mark: "DNM", logo: "/image/banks/danamon.svg" },
  INA: { bg: "#0E7C7B", fg: "#ffffff", mark: "INA", logo: "/image/banks/ina.png" },
  MANDIRI: { bg: "#003D79", fg: "#ffffff", mark: "MDR", logo: "/image/banks/mandiri.svg" },
  PERMATA: { bg: "#00945E", fg: "#ffffff", mark: "PRM", logo: "/image/banks/permata.svg" },
  MAYBANK: { bg: "#FFC400", fg: "#1A1A1A", mark: "MBK", logo: "/image/banks/maybank.svg" },
};

// Merah brand QRIS untuk badge/kartu instruksi QRIS.
export const QRIS_RED = "#D2232A";
