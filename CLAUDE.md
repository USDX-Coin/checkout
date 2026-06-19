# Source of Truth

Folder `sot/` contains the project spec. Read before coding. Never edit `sot/`.

**If spec is unclear — ask the PM, don't assume.**

## SOT Bootstrap (paling awal — sebelum baca spec)

Pastikan `sot/` ada & up-to-date **sebelum** melakukan apa pun. Idealnya ini sudah dijalankan otomatis oleh **SessionStart hook** (`.claude/settings.json`, lihat `sot/README.md § SOT auto-sync`). Blok ini = dokumentasi + fallback kalau hook belum terpasang:

```sh
if [ ! -d sot/.git ]; then
  # belum ada → clone (SSH utama, fallback HTTPS)
  git clone git@github.com:USDX-Coin/sot.git sot 2>/dev/null \
    || git clone https://github.com/USDX-Coin/sot.git sot
else
  # sudah ada → pull hanya jika tertinggal dari remote
  git -C sot fetch --quiet
  [ -n "$(git -C sot rev-list HEAD..@{u} 2>/dev/null)" ] && git -C sot pull --ff-only
fi
```

`sot/` = clone read-only (gitignored). Hanya pull, **jangan pernah push/edit** `sot/`.

## Key files for this repo:

- `sot/phase-2/week2.md` — **§ Halaman Checkout & Ringkasan** (3 layar, komponen, status tracker) + **§ Endpoints Mint**. Spec utama repo ini.
- `sot/project-overview.md` — **§ Deployment — Domain layout** (`mint.usdx.co.id`, cross-subdomain cookie) + Repo Structure.
- `sot/conventions.md` — response format `{ status, metadata, data, error }`, **§ Status Enums** (Mint Order), **§ CORS**.
- `sot/api/mint.yaml` + `sot/api/openapi.yaml` — kontrak endpoint mint v2 yang di-consume checkout.

## Critical rules:

- **Repo ini = halaman checkout own-hosted** (domain `mint.usdx.co.id`), dipisah dari `app`. Scope **internal-only**. Jalur **partner** (partner generate checkout via API, intake KYC, webhook) **di-park — JANGAN dibangun** sampai diputuskan terpisah.
- **Reuse endpoint mint yang ada — JANGAN tambah/ubah `api/`.** Checkout cuma consume: `GET /api/v2/mint/{id}` (render, refresh-safe) + `POST /api/v2/mint/{id}/pay` (pilih channel). **Create order tetap di `app`** (`POST /v2/mint`); user sampai ke checkout via **redirect dari `app`**.
- **Auth = session cookie consumer cross-subdomain** (`.usdx.co.id`), **BUKAN bearer**. Tidak ada halaman login/auth di repo ini.
- **Tanpa wallet/web3** — checkout tidak connect wallet.
- Stack: **Next.js 16 App Router + Tailwind v4 + shadcn/ui**, design token brand maroon/gold (samakan `app`). Base URL backend via `NEXT_PUBLIC_API_BASE_URL` → `/api/v2/*`.
- Halaman `/checkout/[orderId]` (refresh-safe): countdown (`expiresAt`), Pesanan # (`orderNumber`), Total Pembayaran (`totalBeforePgFeeIdr`), Data Pelanggan (`customerName`), Wallet Tujuan (`userAddress`), pilih **VA(+bank)/QRIS** + biaya layanan (`channels[]`) → `/pay` → instruksi bayar **inline** (VA/QRIS) + **status tracker** polling (3 dimensi) sampai `COMPLETED`. Notice "Mode simulasi" (mock W2).
- API responses follow `{ status, metadata, data, error }` — lihat `sot/conventions.md`. Error handling: `401` → redirect balik ke `app` (session habis); `404` → order bukan milik user.
- SOT is authoritative — kalau implementasi beda dari SOT, **code yang menyesuaikan**, bukan SOT.

## PR Description

Saat buat PR, generate description mengikuti format di `sot/templates/pr-template.md`. Ini wajib — PM review berdasarkan structure ini.

Key points:
- Selalu include "PM Action Items" section (bisa "None")
- Selalu include "SoT Alignment" table — cross-check setiap field/endpoint vs SOT
- Jika implement sesuatu yang TIDAK ada di SOT → masukkan ke "Known Drift > Needs PM Action" dengan category ❓ Decision
- Jika ada AC yang belum bisa dicapai → mark ⏳ Deferred dengan reason
- Jika ada action yang harus dilakukan SETELAH merge → masukkan "Post-Merge Actions"
