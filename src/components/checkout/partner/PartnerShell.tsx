"use client";

// Chrome halaman checkout partner (USDX-548) — SATU basis, dua presentasi.
//
// Mengikuti Figma `TXzbmT9lo27cse6IwqSuEP`: baris REDESAIN pada halaman `Checkout — USDX Brand`
// dan baris LIGHT/DARK pada `Checkout — Neutral`. Baris "SEKARANG" adalah clone lama, BUKAN acuan.
//
// Yang berbeda antara `USDX` dan `NEUTRAL` cuma tiga hal, dan semuanya ada di berkas ini:
// penanda di top bar, warna, dan baris kaki. Isi pembayarannya dirender komponen yang SAMA di
// kedua presentasi — itu maksud "tiga model dari satu basis komponen", dan itu juga yang membuat
// presentasi netral tidak bisa diam-diam ketinggalan saat isinya berubah.
//
//   USDX    → judul "Bayar dengan USDX" + lockup USDX di kanan top bar, aksen emas, tombol maroon.
//   NEUTRAL → penanda partner (inisial) + judul "Pembayaran", aksen & tombol warna partner.
//             NOL koin dan NOL lockup USDX — dan itu jaminan yang diuji, bukan niat.
//
// Presentasi datang dari server (`partner_branding` + kolom `theme` baris sesi), TIDAK dari query
// string. Halaman ini tidak membaca `?theme=` sama sekali.

import type { CSSProperties } from "react";
import { ArrowLeft } from "lucide-react";
import { accentTextPair, resolveBrand } from "@/lib/partner/brand";
import type { CheckoutPresentation, PartnerBranding } from "@/lib/partner/types";

// Warna presentasi USDX: maroon + emas, sama dengan token merek di `globals.css`. Tidak diambil
// dari isian partner — presentasi ini memang milik kami.
const USDX_BRAND = { primary: "#800000", primaryText: "#ffffff", accent: "#f7a100" } as const;

/** Inisial untuk penanda partner, mengikuti `partner-mark` di desain (mis. "MS"). */
export function partnerInitials(displayName: string | null | undefined): string {
  const words = (displayName ?? "")
    .trim()
    .split(/\s+/)
    // "PT" / "CV" / "PT." adalah bentuk badan usaha, bukan nama — "PT Mitra Sejahtera" harus
    // jadi "MS", bukan "PM". Desain memakai "MS" untuk contoh itu.
    .filter((w) => w.length > 0 && !/^(pt|cv|ud|pt\.|cv\.)$/i.test(w));
  const letters = words
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return letters || "•";
}

interface PartnerShellProps {
  presentation: CheckoutPresentation;
  branding: PartnerBranding | null;
  title: string;
  /** Baris nama partner di bawah top bar. Hanya di layar ringkasan, mengikuti desain. */
  partnerLine?: string | null;
  /** Panah kembali — desain menampilkannya hanya di N01–N03 (sebelum uang masuk). */
  onBack?: (() => void) | null;
  /** Baris kaki halaman. Berbeda per layar (lihat `PROCESSOR_DISCLOSURE`, catatan self-update). */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function PartnerShell({
  presentation,
  branding,
  title,
  partnerLine,
  onBack,
  footer,
  children,
}: PartnerShellProps) {
  const isNeutral = presentation === "NEUTRAL";
  const brand = isNeutral
    ? resolveBrand(branding?.primaryColor, branding?.accentColor)
    : USDX_BRAND;
  const accent = accentTextPair(isNeutral ? branding?.accentColor : USDX_BRAND.accent);

  // Warna dialirkan sebagai custom property supaya komponen isi tidak perlu tahu presentasi mana
  // yang sedang dipakai — mereka cuma memakai `var(--partner-brand)` / `var(--partner-accent-text)`.
  const style = {
    "--partner-brand": brand.primary,
    "--partner-brand-text": brand.primaryText,
    "--partner-accent-on-light": accent.onLight,
    "--partner-accent-on-dark": accent.onDark,
  } as CSSProperties;

  return (
    <div
      style={style}
      className="partner-scope flex min-h-screen flex-col bg-background text-foreground"
    >
      <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col px-5 py-5">
        <header className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            {isNeutral ? (
              <PartnerMark branding={branding} />
            ) : null}

            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Kembali"
                className="shrink-0 text-foreground transition-opacity hover:opacity-70"
              >
                <ArrowLeft className="size-5" />
              </button>
            )}

            <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>

            {/* Lockup USDX HANYA di presentasi brand, dan hanya di top bar — persis seperti
                desain (satu instance `asset/usdx-lockup`, di P01). */}
            {!isNeutral && <UsdxLockup />}
          </div>

          {partnerLine && <p className="text-sm text-muted-foreground">{partnerLine}</p>}
        </header>

        <main className="flex flex-1 flex-col gap-3.5 pt-4">{children}</main>

        {footer && (
          <footer className="pt-4 text-center text-xs leading-relaxed text-muted-foreground">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

// Penanda partner: logo kalau ada, kalau tidak badge inisial berwarna brand partner — bentuk
// `partner-mark` di desain. TIDAK PERNAH jatuh ke penanda kami: halaman ini justru diminta tanpa
// merek kami.
function PartnerMark({ branding }: { branding: PartnerBranding | null }) {
  const name = branding?.displayName?.trim() || null;

  if (branding?.logoUrl) {
    return (
      <span className="flex h-7 shrink-0 items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={branding.logoUrl}
          alt={name ?? "Logo"}
          className="max-h-7 w-auto max-w-[120px] object-contain"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: "var(--partner-brand)", color: "var(--partner-brand-text)" }}
      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold tracking-tight"
    >
      {partnerInitials(name)}
    </span>
  );
}

/**
 * Wordmark USDX di top bar presentasi brand.
 *
 * Desain memakai instance `asset/usdx-lockup` yang bersumber dari `logo-lockup.png` di usdx.co.id.
 * Berkas itu TIDAK ada di repo ini (`public/image/` hanya memuat logo bank), jadi di sini ia
 * dirender sebagai wordmark teks. Menggambar ulang lambang merek sendiri bukan pilihan — logo
 * yang mirip-mirip lebih buruk daripada wordmark yang jujur. Lihat § Known Drift di PR.
 */
function UsdxLockup() {
  return (
    <span className="ml-auto shrink-0 text-base font-extrabold tracking-tight text-foreground">
      USDX
    </span>
  );
}
