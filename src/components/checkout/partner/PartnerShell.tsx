"use client";

// Chrome halaman checkout partner (USDX-548) — SATU basis, dua presentasi.
//
// Yang berbeda antara `USDX` dan `NEUTRAL` cuma tiga hal, dan semuanya ada di berkas ini:
// kepala halaman, warna, dan kaki halaman. Isi pembayarannya (jumlah, nomor VA, cara bayar,
// status) dirender oleh komponen yang sama persis di kedua presentasi — itu maksud "tiga model
// dari satu basis komponen", dan itu juga yang membuat presentasi netral tidak bisa
// diam-diam ketinggalan saat isinya berubah.
//
// Presentasi datang dari server (`partner_branding` + kolom `theme` baris sesi), TIDAK dari
// query string. Halaman ini tidak membaca `?theme=` sama sekali — kalau ia membacanya, siapa
// pun yang membuka tautan bisa melepas merek kami dari halaman kami sendiri, atau sebaliknya
// menempelkan merek kami ke pembayaran yang tidak kami kehendaki.

import type { CSSProperties } from "react";
import { resolveBrand } from "@/lib/partner/brand";
import type { CheckoutPresentation, PartnerBranding } from "@/lib/partner/types";

// Warna presentasi USDX diambil dari token tema (`globals.css`), bukan dari isian partner.
const USDX_BRAND = { primary: "#800000", primaryText: "#ffffff", accent: "#f7a100" } as const;

interface PartnerShellProps {
  presentation: CheckoutPresentation;
  branding: PartnerBranding | null;
  children: React.ReactNode;
}

export function PartnerShell({ presentation, branding, children }: PartnerShellProps) {
  const isNeutral = presentation === "NEUTRAL";
  const brand = isNeutral
    ? resolveBrand(branding?.primaryColor, branding?.accentColor)
    : USDX_BRAND;

  // Warna dialirkan sebagai custom property supaya komponen isi tidak perlu tahu presentasi
  // mana yang sedang dipakai — mereka cuma memakai `var(--partner-brand)`.
  const style = {
    "--partner-brand": brand.primary,
    "--partner-brand-text": brand.primaryText,
    "--partner-accent": brand.accent,
  } as CSSProperties;

  return (
    <div style={style} className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-[520px] items-center gap-2.5 px-4 py-4">
          {isNeutral ? (
            <NeutralHeader branding={branding} />
          ) : (
            <span className="text-base font-extrabold tracking-tight text-foreground">USDX</span>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[520px] flex-1 flex-col gap-4 px-4 py-6">
        {children}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-[520px] px-4 py-4 text-xs leading-relaxed text-muted-foreground">
          {isNeutral ? <NeutralFooter branding={branding} /> : <UsdxFooter />}
        </div>
      </footer>
    </div>
  );
}

// Kepala netral: logo partner kalau ada, kalau tidak namanya sebagai teks. Kalau dua-duanya tak
// ada, kepala halaman dibiarkan KOSONG — lebih baik tanpa identitas daripada menyelipkan
// identitas kami ke halaman yang justru diminta tanpa merek.
function NeutralHeader({ branding }: { branding: PartnerBranding | null }) {
  const name = branding?.displayName?.trim();
  if (branding?.logoUrl) {
    return (
      <span className="flex h-8 items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={branding.logoUrl}
          alt={name || "Logo"}
          className="max-h-8 w-auto max-w-[180px] object-contain"
        />
      </span>
    );
  }
  if (name) {
    return <span className="text-base font-semibold tracking-tight text-foreground">{name}</span>;
  }
  return null;
}

function NeutralFooter({ branding }: { branding: PartnerBranding | null }) {
  const footerText = branding?.footerText?.trim();
  const supportEmail = branding?.supportEmail?.trim();
  // Tanpa isian partner, kaki halaman tidak menampilkan apa pun. Tidak ada teks bawaan: teks
  // bawaan apa pun dari kami akan jadi jejak kami di halaman netral.
  if (!footerText && !supportEmail) return null;
  return (
    <div className="flex flex-col gap-1">
      {footerText && <p>{footerText}</p>}
      {supportEmail && (
        <p>
          Butuh bantuan?{" "}
          <a href={`mailto:${supportEmail}`} className="underline hover:no-underline">
            {supportEmail}
          </a>
        </p>
      )}
    </div>
  );
}

function UsdxFooter() {
  return (
    <div className="flex flex-col gap-1">
      <p>Pembayaran diproses oleh USDX.</p>
      <p>
        <a
          href="https://usdx.co.id"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline"
        >
          usdx.co.id
        </a>
      </p>
    </div>
  );
}
