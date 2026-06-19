# USDX Checkout

Halaman **checkout own-hosted** USDX — dipisah dari repo `app` agar punya repo + domain sendiri
(`mint.usdx.co.id`). Client baru di atas backend `/api/v2/*` yang **sama** (endpoint mint tidak
berubah). Tahap ini **internal-only**; jalur partner (generate checkout via API) di-park.

> Sumber kebenaran: `sot/phase-2/week2.md § Halaman Checkout & Ringkasan`.
> CR: **USDX-220**. Scaffold: USDX-223. Build halaman: USDX-224.

## Flow

1. `app` (`/mint`) → modal Ringkasan → `POST /api/v2/mint` (create order).
2. `app` **redirect** ke `https://mint.usdx.co.id/checkout/{orderId}` (cross-subdomain;
   session consumer kebawa via cookie `.usdx.co.id`).
3. Checkout render dari `GET /api/v2/mint/{id}` → pilih VA/QRIS → `POST /api/v2/mint/{id}/pay`
   → instruksi bayar inline + status tracker polling sampai `COMPLETED`.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui (new-york) · TanStack Query.
Stack & design token sama dengan `app` (brand maroon/gold, Inter). **Tanpa** wallet/web3 (checkout
tidak butuh connect wallet).

## Dev

```bash
pnpm install
cp .env.example .env.local   # set NEXT_PUBLIC_API_BASE_URL
pnpm dev
```

## Deploy

Netlify (`mint.usdx.co.id`), branch → env: `main` = prod, `staging`, `dev`. Lihat `netlify.toml`
+ runbook di USDX-221. Semua FE di bawah `*.usdx.co.id` (prasyarat cross-subdomain cookie).
