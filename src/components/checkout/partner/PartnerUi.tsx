"use client";

// Primitif tampilan halaman partner (USDX-548), mengikuti komponen di Figma: `card`,
// `rate-strip`, `banner/*`, `btn/salin`, `pill/*`, `chip/bank`, `step/*`.
//
// Dipakai IDENTIK oleh presentasi USDX maupun netral — yang berbeda hanya nilai
// `--partner-brand` / `--partner-accent-text` yang dialirkan `PartnerShell`.
//
// Semua warna diambil dari token tema (`globals.css`) yang sudah berbalik sendiri di `.dark`,
// atau dari custom property brand. Tidak ada warna literal di sini: warna literal adalah cara
// paling umum menghasilkan elemen yang benar di Light dan tak terbaca di Dark.

import { AlertTriangle, CheckCircle2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PartnerCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>{children}</div>
  );
}

/** Baris label→nilai di dalam kartu (`order-summary` di desain). */
export function PartnerRow({
  label,
  children,
  strong,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-right font-medium text-foreground",
          strong ? "text-xl font-bold" : "text-sm",
        )}
      >
        {children}
      </span>
    </div>
  );
}

export function PartnerDivider() {
  return <div className="my-2 border-t border-border" />;
}

/**
 * Baris hitungan mundur (`countdown` di desain): label kiri, mm : ss kanan dalam warna aksen.
 *
 * Angkanya memakai `--partner-accent-text`, yang ditukar per tema di `globals.css` — teks kecil
 * berwarna adalah tempat paling mudah gagal kontras, dan gagalnya berbeda arah di tiap tema.
 */
export function PartnerCountdown({
  label,
  value,
  expired,
}: {
  label: string;
  value: string;
  expired?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-4 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        style={expired ? undefined : { color: "var(--partner-accent-text)" }}
        className={cn(
          "text-base font-bold tabular-nums",
          expired && "text-destructive",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export type BannerTone = "success" | "warning" | "info" | "error" | "muted";

const BANNER: Record<BannerTone, { wrap: string; text: string }> = {
  success: { wrap: "bg-success/10", text: "text-success" },
  warning: { wrap: "bg-warning", text: "text-white" },
  info: { wrap: "bg-muted", text: "text-muted-foreground" },
  error: { wrap: "bg-destructive/10", text: "text-destructive" },
  muted: { wrap: "bg-muted", text: "text-muted-foreground" },
};

/** `banner/success`, `banner/warning`, `banner/info`, `banner/help` di desain. */
export function PartnerBanner({
  tone,
  children,
  icon,
}: {
  tone: BannerTone;
  children: React.ReactNode;
  icon?: "check" | "warning" | null;
}) {
  const style = BANNER[tone];
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-xs leading-relaxed",
        style.wrap,
        style.text,
      )}
    >
      {icon === "check" && <CheckCircle2 className="mt-px size-4 shrink-0" />}
      {icon === "warning" && <AlertTriangle className="mt-px size-4 shrink-0" />}
      <span>{children}</span>
    </div>
  );
}

/**
 * Nilai besar + tombol "Salin" berlabel teks (`btn/salin` di desain).
 *
 * Labelnya sengaja teks, bukan ikon saja: ini nomor yang WAJIB disalin persis, dan tombol ikon
 * tanpa label lebih mudah terlewat justru pada layar yang paling menentukan.
 */
export function PartnerCopyValue({
  label,
  value,
  display,
  copyLabel,
  onCopy,
  mono,
  strong,
}: {
  label: string;
  value: string;
  display: string;
  copyLabel: string;
  onCopy: (text: string) => void;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "font-bold text-foreground",
            strong ? "text-2xl" : "text-lg",
            mono && "tabular-nums tracking-wide",
          )}
        >
          {display}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onCopy(value)}
          disabled={!value}
          style={{ color: "var(--partner-accent-text)" }}
          className="font-semibold"
        >
          <Copy />
          {copyLabel}
        </Button>
      </div>
    </div>
  );
}

/** `pill/error` / `pill/success` — status mentah (EXPIRED, FAILED) apa adanya dari backend. */
export function PartnerStatusPill({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-xs font-bold tracking-wide",
        tone === "error"
          ? "bg-destructive/10 text-destructive"
          : "bg-success/10 text-success",
      )}
    >
      {children}
    </span>
  );
}

/**
 * Tombol utama. Latarnya warna brand, teksnya warna yang SUDAH DIHITUNG terbaca di atas warna itu
 * (`resolveBrand`) — bukan putih yang diasumsikan.
 *
 * `border-foreground/15` bukan hiasan: ia yang memberi tombol TEPI yang terlihat, dan ia ikut
 * berbalik bersama tema. Tanpa itu, brand putih lenyap di Light dan brand hitam lenyap di Dark —
 * dan tidak ada warna tunggal yang bisa kontras terhadap dua latar sekaligus (lihat catatan di
 * `@/lib/partner/brand`). Jadi batas permukaan diselesaikan token tema, bukan warna partner.
 */
export function PartnerBrandButton({
  onClick,
  children,
  disabled,
}: {
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    // `variant="brand"` SENGAJA TIDAK dipakai: varian itu maroon USDX, dan di presentasi netral
    // ia menempelkan merek KAMI pada halaman partner. Yang diambil dari `ui/button` adalah yang
    // memang universal — cincin fokus keyboard, transisi, dan perilaku disabled; warnanya tetap
    // milik partner. `outline` jadi dasar netralnya, lalu ditimpa warna partner.
    //
    // Tinggi 48 dipertahankan (bukan 44 dari skala kontrol): ini tombol utama layar partner yang
    // lebarnya penuh, dan mengubahnya sekarang menggeser tata letak yang tidak diminta berubah.
    <Button
      type="button"
      variant="outline"
      size="lg"
      onClick={onClick}
      disabled={disabled}
      style={{ backgroundColor: "var(--partner-brand)", color: "var(--partner-brand-text)" }}
      className="h-12 w-full rounded-xl border-foreground/15 font-semibold"
    >
      {children}
    </Button>
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
    <Button
      type="button"
      variant="outline"
      size="lg"
      onClick={onClick}
      disabled={disabled}
      className="h-12 w-full rounded-xl"
    >
      {children}
    </Button>
  );
}
