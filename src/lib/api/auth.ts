// Exchange one-time handoff code (USDX-378, WSTG-CLNT-12). `app` mint code
// sekali-pakai (TTL 60 detik) via `POST /api/v2/auth/checkout-token`, lalu redirect
// ke `mint.usdx.co.id/checkout/{id}#code=<code>`. Checkout menukar code → raw session
// token (Better Auth), lalu memakai token itu sebagai `Authorization: Bearer` untuk
// request berikutnya (`@/lib/api/client`).
//
// Endpoint: POST /api/v2/auth/checkout-token/exchange — PUBLIC/pre-auth, `GETDEL`
// atomik sekali-pakai. Request `{ code }`.
//   - sukses 200 → `{ token }` (raw session token; `apiFetch` toleran envelope SoT
//     `{ status, data: { token } }` maupun body polos `{ token }`).
//   - 401 INVALID_HANDOFF_CODE → code salah / kedaluwarsa / sudah terpakai →
//     `apiFetch` throw `ApiError` status 401; caller (`useCheckout`) tandai sesi
//     kedaluwarsa → redirect balik ke `app`.

import { apiFetch } from "./client";

interface CheckoutTokenExchangeResult {
  token: string;
}

// Tukar handoff code → raw session token. Throw `ApiError` (401 INVALID_HANDOFF_CODE)
// kalau code tak valid/kedaluwarsa/terpakai.
export async function exchangeHandoffCode(code: string): Promise<string> {
  const res = await apiFetch<CheckoutTokenExchangeResult>(
    "/api/v2/auth/checkout-token/exchange",
    { method: "POST", body: { code } },
  );
  return res.token;
}
