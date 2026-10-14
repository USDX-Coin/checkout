// Consumer mint v2 view models — subset checkout (USDX-224, port dari app USDX-202).
// Mirror kontrak OpenAPI (sot/api/mint.yaml, common.yaml). Checkout hanya butuh
// detail order (GET) + pilih channel (pay); field backend-only diabaikan.

import type { VA_BANKS } from "@/lib/constants";

// `BANK_TRANSFER` (D25, `sot/api/common.yaml` PaymentChannel): transfer langsung ke rekening BNI
// penampung, nominal + kode unik. Sengaja nilai baru, bukan `VA` + `BNI`: pasangan itu sudah
// berarti VA BNI DurianPay, dan kedua metode bisa ditawarkan bersamaan. Kontrak menyatakan enum
// ini TERBUKA — channel yang tak dikenal tidak dirender sebagai pilihan (lihat pemilih metode).
export type PaymentChannel = "VA" | "QRIS" | "BANK_TRANSFER";

// Apakah pembayaran order ini benar-benar diproses ke bank, atau cuma disimulasikan mock
// provider. Dikirim backend (mint-order.serializer.ts), diturunkan dari provider per-order.
export type PaymentMode = "SIMULATION" | "LIVE";

// Bank VA yang dikenal provider (common.yaml VaBank).
//
// Diturunkan dari `VA_BANKS`, bukan ditulis ulang: keduanya sempat berbeda saat NOBU masuk
// (USDX-622) — nilainya bertambah, tipenya tidak — dan bank barunya jadi tidak bisa disebut di
// kode yang mengetik `VaBank`. Satu daftar, dua bentuk.
//
// "Dikenal" bukan "aktif": bank yang benar-benar bisa dipakai ditentukan backend lewat
// `channels[].banks`, dan yang tampil tapi mati lewat `channels[].disabledBanks`.
export type VaBank = (typeof VA_BANKS)[number];

export type AmountCurrency = "USD" | "IDR";
/**
 * Mata uang yang DITRANSFER nasabah (USDX-749, keputusan PM 14 Okt 2026): Transfer BNI
 * (`BANK_TRANSFER`) = transfer USD dari wondr ke rekening USD BNI penampung; metode lain rupiah.
 */
export type PayCurrency = "USD" | "IDR";
export type ConsumerOrderType = "MINT" | "REDEEM";

// 3 dimensi status order mint (conventions.md § Status Enums → Mint Order).
// HELD = transfer sudah masuk tapi tak bisa dicocokkan otomatis (nominal kurang/lebih, telat,
// atau dobel) dan ditahan untuk ditinjau ops. Ada di SoT (common.yaml) & enum DB sejak USDX-349,
// tapi dulu tak dikenal checkout — akibatnya order HELD jatuh ke layar tagihan, padahal justru
// populasi itu yang paling rawan transfer dua kali.
export type MintPaymentStatus =
  | "REQUESTED"
  | "WAITING_FOR_PAYMENT"
  | "PAID"
  | "EXPIRED"
  | "HELD";
export type MintSafeStatus = "NONE" | "PENDING_APPROVAL" | "APPROVED" | "EXECUTED" | "REJECTED";
export type MintOrderStatus =
  | "WAITING_FOR_PAYMENT"
  | "WAITING_FOR_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "HELD"; // cermin denormalisasi dari paymentStatus HELD

/** Bentuk biaya metode (`sot/api/payment-methods.yaml` PaymentFeeType). */
export type PaymentFeeType = "FLAT_IDR" | "PERCENT";

/**
 * Alasan sebuah opsi tampil tapi tidak bisa dipilih UNTUK ORDER INI (`api/mint.yaml`
 * ChannelOption.unavailableReason, rev-17). Enum terbuka: nilai yang tak dikenal tetap
 * ditampilkan non-aktif dengan teks umum.
 */
export type ChannelUnavailableReason = "AMOUNT_ABOVE_METHOD_MAX" | (string & {});

/**
 * Estimasi satu bank (= satu baris `payment_methods`) di dalam channel (`api/mint.yaml`
 * ChannelBankOption, rev-16/17). Biaya kini per metode, jadi tiap bank membawa total sendiri.
 */
export interface MintChannelBankOption {
  paymentMethodId: string;
  /** Null hanya untuk QRIS. */
  bank: VaBank | null;
  feeType: PaymentFeeType;
  feeValue: string;
  pgFeeIdr: string;
  /** subtotal + mint fee + biaya bank ini (floor). `BANK_TRANSFER`: BELUM termasuk kode unik. */
  estimatedTotalPayIdr: string;
  /** Rev-17 R8 — `BANK_TRANSFER`: padanan rupiah batas atas (+$0,99); lainnya = estimatedTotalPayIdr. */
  estimatedTotalPayMaxIdr?: string;
  /** USDX-749 — "USD" untuk Transfer BNI, "IDR" lainnya. */
  currency?: PayCurrency;
  /** USDX-749 — Transfer BNI: USD yang ditransfer SEBELUM kode unik (USDX dipotong ke sen). Lainnya null. */
  estimatedTotalPayUsd?: string | null;
  /** USDX-749 — Transfer BNI: batas atas termasuk kode unik (+$0,99). Lainnya null. */
  estimatedTotalPayMaxUsd?: string | null;
  /** Absen = true (backend lama). */
  available?: boolean;
  unavailableReason?: ChannelUnavailableReason | null;
  maxAmountIdr?: string | null;
}

// Satu channel pembayaran yang ditawarkan. Daftar, urutan, dan biayanya diatur admin dari
// back-office (`payment_methods`, rev-16) — checkout cuma menggambar apa yang dikirim, dalam
// URUTAN yang dikirim.
export interface MintChannelOption {
  channel: PaymentChannel;
  /** Biaya bank TERMURAH di channel ini (rev-16). Rincian per bank di `bankOptions[]`. */
  pgFeeIdr: string;
  banks: VaBank[] | null;
  // Bank yang DITAMPILKAN tapi belum bisa dipilih — ditandai "Segera hadir" (USDX-622).
  //
  // Datang dari backend, bukan ditulis di sini, karena DurianPay mengaktifkan bank satu per satu:
  // tiap aktivasi cukup satu perubahan di server dan halaman ini ikut sendiri. Opsional — response
  // tanpa field ini (adapter mock/BNI) berperilaku persis seperti sebelumnya.
  disabledBanks?: VaBank[];
  // ── Estimasi harga PER METODE (D25, `api/mint.yaml` ChannelOption) ─────────────────────────
  // Kurs beli beda per metode (Virtual Account = dasar + Y%). Transfer BNI sejak USDX-749 = transfer
  // USD: tidak ada kurs BNI lagi (`effectiveRate` = kurs dasar, `rateUpdatedAt` null).
  // Semuanya ESTIMASI — `/pay` membaca ulang kurs lalu mengunci. Opsional: backend sebelum D25
  // tidak mengirimnya, dan pemilih metode jatuh ke perhitungan lama (total order + pgFee).
  rateAdjustmentPct?: string | null;
  effectiveRate?: string;
  /** Selalu null sejak USDX-749 (tidak ada lagi kurs BNI manual). */
  rateUpdatedAt?: string | null;
  subtotalIdr?: string;
  mintFeeIdr?: string;
  /** subtotal + mint fee + pg fee (floor). `BANK_TRANSFER`: BELUM termasuk kode unik. */
  estimatedTotalPayIdr?: string;
  /** Rev-17 R8 — satu-satunya dasar penanda "Paling hemat" (Transfer BNI: padanan rupiahnya). */
  estimatedTotalPayMaxIdr?: string;
  /** USDX-749 — "USD" untuk Transfer BNI, "IDR" lainnya. */
  currency?: PayCurrency;
  /** USDX-749 — Transfer BNI: USD yang ditransfer SEBELUM kode unik (USDX dipotong ke sen). Lainnya null. */
  estimatedTotalPayUsd?: string | null;
  /** USDX-749 — Transfer BNI: batas atas termasuk kode unik (+$0,99). Lainnya null. */
  estimatedTotalPayMaxUsd?: string | null;
  /** Rev-17 — false = opsi tampil tapi tidak bisa dipilih untuk order ini. Absen = true. */
  available?: boolean;
  unavailableReason?: ChannelUnavailableReason | null;
  maxAmountIdr?: string | null;
  /** Rev-16 — satu entri per bank yang bisa dipilih (urutan = `banks`). Absen di backend lama. */
  bankOptions?: MintChannelBankOption[];
}

// Detail order mint (GET /v2/mint/{id} + setelah /pay). View model FE — field
// backend-only (idempotencyKey, amountWei, safeType, estimatedRevenue) diabaikan.
export interface MintOrderDetail {
  id: string;
  orderNumber: string;
  customerName: string;
  type: ConsumerOrderType;
  userAddress: string;
  chain: string;
  inputCurrency: AmountCurrency;
  amount: string;
  // D25: field harga order bernilai null selama REQUESTED — kurs beda per metode dan baru dikunci
  // di `/pay`. Estimasinya ada per metode di `channels[]`.
  baseRate: string | null;
  spreadBuyPct: string | null;
  /** D25 — `Y` untuk Virtual Account; null untuk Transfer BNI dan selama REQUESTED. */
  rateAdjustmentPct?: string | null;
  effectiveRate: string | null;
  subtotalIdr: string | null;
  mintFeePct: string | null;
  mintFeeIdr: string | null;
  totalBeforePgFeeIdr: string | null; // "Total Pembayaran" sebelum biaya layanan PG
  paymentChannel: PaymentChannel | null;
  pgFeeIdr: string | null;
  totalFeeIdr: string | null;
  /** Transfer BNI (USDX-749): padanan rupiah saja (USD × kurs dasar) — BUKAN angka yang ditransfer. */
  totalPayIdr: string | null;
  /**
   * USDX-749 — Transfer BNI: USD yang ditransfer PERSIS (dasar + kode unik sen), mis. "3.47". Sama
   * dengan `amount` setelah /pay (seluruh sen di-mint). Null untuk metode lain / sebelum /pay.
   */
  totalPayUsd?: string | null;
  /**
   * USDX-749 — mata uang yang ditransfer: "USD" untuk Transfer BNI, "IDR" lainnya — termasuk order
   * Transfer BNI rupiah dari sebelum peralihan (`totalPayUsd` null). Satu-satunya penentu mata uang
   * nominal yang dibayar; jangan ditebak dari `paymentChannel`.
   */
  payCurrency?: PayCurrency;
  /**
   * Kode unik Transfer BNI yang SUDAH DITAMBAHKAN ke tagihan. Sejak USDX-749 dalam SEN USD (`"01"`–
   * `"99"`, ditambahkan ke `totalPayUsd`). Ditampilkan sebagai keterangan "sudah termasuk kode unik
   * $0,47", tanpa sorotan digit. Null untuk VA / sebelum /pay.
   */
  uniqueCode?: string | null;
  paymentBank: VaBank | null;
  paymentStatus: MintPaymentStatus;
  safeStatus: MintSafeStatus;
  status: MintOrderStatus;
  paymentProvider: string;
  // OPTIONAL dengan sengaja: backend yang belum membawa field ini (atau nilai baru yang belum
  // dikenal FE) harus jatuh ke perlakuan LIVE — banner "pembayaran tidak diproses ke bank
  // sungguhan" tak boleh muncul kecuali backend benar-benar bilang "SIMULATION".
  paymentMode?: PaymentMode;
  /** Nomor VA (channel VA). `BANK_TRANSFER` (D25): nomor rekening BNI penampung. */
  virtualAccountNo: string | null;
  /**
   * `BANK_TRANSFER`: nama pemilik rekening penampung, dikirim backend per environment
   * (keputusan PM 13 Okt 2026, backend#366 — belum tercatat di SOT). Null/absen = baris nama
   * tidak ditampilkan; nama TIDAK PERNAH ditulis di kode FE.
   */
  collectionAccountName?: string | null;
  paymentUrl: string | null;
  paymentRef: string | null;
  paidAt: string | null;
  expiresAt: string;
  safeTxHash: string | null;
  onChainTxHash: string | null;
  createdAt: string;
  updatedAt: string;
  // channels[] dikembalikan GET saat paymentStatus=REQUESTED (USDX-216) agar halaman
  // refresh-safe; null/absen setelah channel dipilih. Optional → ada fallback statis.
  channels?: MintChannelOption[];
}

// Body POST /v2/mint/{id}/pay. `bank` wajib saat channel = VA, dan wajib `BNI` saat channel =
// `BANK_TRANSFER` (D25).
export interface PayMintOrderRequest {
  channel: PaymentChannel;
  bank?: VaBank | null;
}
