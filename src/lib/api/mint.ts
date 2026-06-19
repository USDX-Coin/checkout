// Mint API consumer v2 — subset checkout (USDX-224). Checkout hanya butuh 2 endpoint:
//   poll (GET  /api/v2/mint/{id})      → detail + status tracker (refresh-safe)
//   pay  (POST /api/v2/mint/{id}/pay)  → pilih channel, dapat instruksi bayar
// Create (POST /v2/mint) tetap di repo `app`. SELALU hit backend real (tanpa mock).
//
// Error yang di-handle pemanggil (useCheckout):
// - 409 INVALID_ORDER_STATE (pay ulang pada order non-REQUESTED)
// - 422 VALIDATION_ERROR
// - 503 MINT_DISABLED (env tanpa payment provider real)

import { apiFetch } from "./client";
import type { MintOrderDetail, PayMintOrderRequest } from "@/types";

export async function getMintOrder(id: string): Promise<MintOrderDetail> {
  return apiFetch<MintOrderDetail>(`/api/v2/mint/${id}`, { method: "GET" });
}

export async function payMintOrder(
  id: string,
  req: PayMintOrderRequest,
): Promise<MintOrderDetail> {
  return apiFetch<MintOrderDetail>(`/api/v2/mint/${id}/pay`, { method: "POST", body: req });
}
