"use client";

// Layar hasil — frame P04–P08 / N04–N08 di Figma, satu tata letak dengan isi berbeda.
//
// Ini bagian paling penting dari tiket ini. Begitu status masuk `WAITING_FOR_APPROVAL`, uang
// customer SUDAH diterima dan sisanya persetujuan multisig di sisi kami — keadaan TERLAMA dari
// kelimanya, "bisa memakan waktu beberapa jam". Catatan desain untuk P04 menuliskannya sebagai
// perubahan besar: "customer TIDAK ditahan di halaman ... jadi ada CTA kembali ke app".
//
// `returnUrl` yang sampai ke sini SUDAH lolos `safeReturnUrl` di pemanggil. Kalau tidak lolos,
// tombolnya TIDAK dirender — halaman ini tidak pernah menavigasi ke URL yang belum divalidasi,
// karena persis itulah yang mengubahnya jadi pengalih terbuka.

import { ArrowRight, CheckCircle2, Clock, RefreshCw, XCircle } from "lucide-react";
import { PartnerBrandButton, PartnerGhostButton } from "./PartnerUi";

export type HeroTone = "success" | "review" | "failure";

const HERO = {
  success: { Icon: CheckCircle2, className: "bg-success/10 text-success" },
  review: { Icon: Clock, className: "bg-warning/15 text-warning" },
  failure: { Icon: XCircle, className: "bg-destructive/10 text-destructive" },
} as const;

interface PartnerStatusScreenProps {
  tone: HeroTone;
  heading: string;
  /** Nominal besar di bawah judul (mis. "60,606060 USDX"). */
  amount?: string | null;
  /** Kalimat penjelas di bawah judul/nominal. */
  subtitle?: string | null;
  /** Isi tambahan: stepper, baris rincian, banner. */
  children?: React.ReactNode;
  /** Sudah tervalidasi. `null` = tak ada jalan keluar yang boleh diklik. */
  returnUrl: string | null;
  returnCta: string;
  noReturnUrlNote: string;
  /** Tombol sekunder (mis. "Buat pesanan baru", "Coba lagi"). */
  secondary?: { label: string; onClick: () => void; icon?: "refresh" } | null;
  /** Tombol utama non-navigasi (P08 "Coba lagi" adalah aksi, bukan tautan). */
  primaryAction?: { label: string; onClick: () => void } | null;
}

export function PartnerStatusScreen({
  tone,
  heading,
  amount,
  subtitle,
  children,
  returnUrl,
  returnCta,
  noReturnUrlNote,
  secondary,
  primaryAction,
}: PartnerStatusScreenProps) {
  const { Icon, className } = HERO[tone];

  return (
    <>
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <span className={`flex size-14 items-center justify-center rounded-full ${className}`}>
          <Icon className="size-7" />
        </span>
        <h2 className="text-xl font-bold tracking-tight text-foreground">{heading}</h2>
        {amount && <p className="text-2xl font-bold text-foreground">{amount}</p>}
        {subtitle && (
          <p className="text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
        )}
      </div>

      {children}

      <div className="mt-auto flex flex-col gap-2.5 pt-4">
        {/* Dua primitif yang sama dengan layar partner lainnya (`PartnerUi`), bukan salinan
            gayanya — di situlah cincin fokus keyboard dan warna partner sudah diselesaikan. */}
        {primaryAction && (
          <PartnerBrandButton onClick={primaryAction.onClick}>
            {primaryAction.label}
          </PartnerBrandButton>
        )}

        {returnUrl ? (
          // Navigasi tingkat atas ke domain partner — memang lintas-origin, memang meninggalkan
          // halaman kami. Itu tujuannya.
          <a
            href={returnUrl}
            data-testid="partner-return-link"
            style={
              primaryAction
                ? undefined
                : {
                    backgroundColor: "var(--partner-brand)",
                    color: "var(--partner-brand-text)",
                  }
            }
            className={
              primaryAction
                ? "flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium text-foreground transition-control hover:bg-accent"
                : "flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-foreground/15 text-sm font-semibold transition-opacity hover:opacity-90"
            }
          >
            {returnCta}
            {!primaryAction && <ArrowRight className="size-4" />}
          </a>
        ) : (
          <p className="text-center text-xs text-muted-foreground">{noReturnUrlNote}</p>
        )}

        {secondary && (
          <PartnerGhostButton onClick={secondary.onClick}>
            {secondary.icon === "refresh" && <RefreshCw />}
            {secondary.label}
          </PartnerGhostButton>
        )}
      </div>
    </>
  );
}
