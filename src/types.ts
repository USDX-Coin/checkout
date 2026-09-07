// Consumer mint v2 view models — subset checkout (USDX-224, port dari app USDX-202).
// Mirror kontrak OpenAPI (sot/api/mint.yaml, common.yaml). Checkout hanya butuh
// detail order (GET) + pilih channel (pay); field backend-only diabaikan.

import type { VA_BANKS } from "@/lib/constants";

export type PaymentChannel = "VA" | "QRIS";

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

// Satu channel pembayaran yang ditawarkan (VA bawa daftar bank; QRIS tidak).
export interface MintChannelOption {
  channel: PaymentChannel;
  pgFeeIdr: string;
  banks: VaBank[] | null;
  // Bank yang DITAMPILKAN tapi belum bisa dipilih — ditandai "Segera hadir" (USDX-622).
  //
  // Datang dari backend, bukan ditulis di sini, karena DurianPay mengaktifkan bank satu per satu:
  // tiap aktivasi cukup satu perubahan di server dan halaman ini ikut sendiri. Opsional — response
  // tanpa field ini (adapter mock/BNI) berperilaku persis seperti sebelumnya.
  disabledBanks?: VaBank[];
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
  baseRate: string;
  spreadBuyPct: string;
  effectiveRate: string;
  subtotalIdr: string;
  mintFeePct: string;
  mintFeeIdr: string;
  totalBeforePgFeeIdr: string; // "Total Pembayaran" sebelum biaya layanan PG
  paymentChannel: PaymentChannel | null;
  pgFeeIdr: string | null;
  totalFeeIdr: string | null;
  totalPayIdr: string | null;
  paymentBank: VaBank | null;
  paymentStatus: MintPaymentStatus;
  safeStatus: MintSafeStatus;
  status: MintOrderStatus;
  paymentProvider: string;
  // OPTIONAL dengan sengaja: backend yang belum membawa field ini (atau nilai baru yang belum
  // dikenal FE) harus jatuh ke perlakuan LIVE — banner "pembayaran tidak diproses ke bank
  // sungguhan" tak boleh muncul kecuali backend benar-benar bilang "SIMULATION".
  paymentMode?: PaymentMode;
  virtualAccountNo: string | null;
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

// Body POST /v2/mint/{id}/pay. `bank` wajib saat channel = VA.
export interface PayMintOrderRequest {
  channel: PaymentChannel;
  bank?: VaBank | null;
}
