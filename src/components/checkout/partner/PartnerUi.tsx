"use client";

// Primitif tampilan halaman partner (USDX-548). Dipakai IDENTIK oleh presentasi USDX maupun
// netral — yang berbeda hanya nilai `--partner-brand` yang dialirkan `PartnerShell`.
//
// Semua warna diambil dari token tema (`globals.css`) yang sudah berbalik sendiri di `.dark`,
// atau dari custom property brand. Tidak ada satu pun warna literal di sini: warna literal
// adalah cara paling umum menghasilkan elemen yang benar di Light dan tak terbaca di Dark.

import { ChevronDown, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function PartnerCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-4 rounded-xl border border-border bg-card p-5">
      {children}
    </div>
  );
}

export function PartnerRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 font-medium text-foreground">{children}</span>
    </div>
  );
}

/**
 * Tombol utama. Latarnya warna brand, teksnya warna yang SUDAH DIHITUNG terbaca di atas warna
 * itu (`resolveBrand`) — bukan putih yang diasumsikan. Warna brand tidak berganti antar tema,
 * jadi keterbacaan yang lolos sekali lolos di dua-duanya.
 *
 * `border-foreground/15` bukan hiasan: ia yang memberi tombol TEPI yang terlihat, dan ia ikut
 * berbalik bersama tema. Tanpa itu, brand putih lenyap di Light dan brand hitam lenyap di Dark —
 * dan tidak ada warna tunggal yang bisa kontras terhadap dua latar sekaligus (lihat catatan di
 * `@/lib/partner/brand`). Jadi batas permukaan diselesaikan oleh token tema, bukan oleh warna
 * partner.
 */
export function PartnerBrandButton({
  onClick,
  children,
  disabled,
  type = "button",
}: {
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{ backgroundColor: "var(--partner-brand)", color: "var(--partner-brand-text)" }}
      className="flex h-[44px] w-full items-center justify-center rounded-lg border border-foreground/15 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function PartnerGhostButton({
  onClick,
  children,
  disabled,
}: {
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-[44px] w-full items-center justify-center rounded-lg border border-border text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** Blok nilai yang bisa disalin (nomor VA, nominal). */
export function PartnerCopyField({
  label,
  value,
  display,
  onCopy,
  mono,
}: {
  label: string;
  value: string;
  display: string;
  onCopy: (text: string) => void;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center justify-between gap-2 rounded-lg bg-muted p-3">
        <span
          className={cn(
            "text-base font-semibold text-foreground",
            mono && "font-mono tracking-wider",
          )}
        >
          {display}
        </span>
        <button
          type="button"
          onClick={() => onCopy(value)}
          aria-label={`Salin ${label}`}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Copy className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function PartnerAccordion({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-lg border border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-medium text-foreground">
        {title}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        {children}
      </div>
    </details>
  );
}
