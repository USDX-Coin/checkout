"use client";

// Layar akhir halaman partner (USDX-548) — dan ini bagian yang paling penting dari tiket ini.
//
// Begitu status masuk `WAITING_FOR_APPROVAL`, uang customer SUDAH diterima dan yang tersisa
// adalah persetujuan multisig di sisi kami — keadaan TERLAMA dari kelimanya, "bisa berjam-jam"
// (`src/hooks/useCheckout.ts:92`). Menahan customer di halaman ini sampai selesai berarti
// menahan orang berjam-jam di tab milik pihak yang bahkan bukan penyedia layanan yang ia
// percaya. Jadi: konfirmasi bahwa pembayarannya diterima, lalu LEPASKAN dia — dengan tombol,
// bukan dengan menyuruhnya menutup tab sendiri.
//
// `return_url` yang dipakai di sini SUDAH lolos `safeReturnUrl` di pemanggil. Kalau tidak lolos,
// tombolnya TIDAK dirender — halaman ini tidak pernah menavigasi ke URL yang belum divalidasi,
// karena persis itulah yang mengubahnya jadi pengalih terbuka.

import { CheckCircle2, Clock, XCircle } from "lucide-react";

export type StatusTone = "success" | "review" | "failure";

const TONE = {
  success: { Icon: CheckCircle2, wrap: "bg-success/10", badge: "bg-success/15 text-success" },
  review: { Icon: Clock, wrap: "bg-warning/10", badge: "bg-warning/15 text-warning" },
  failure: { Icon: XCircle, wrap: "bg-destructive/10", badge: "bg-destructive/15 text-destructive" },
} as const;

interface PartnerStatusScreenProps {
  tone: StatusTone;
  heading: string;
  body: string;
  /** Sudah tervalidasi terhadap daftar terdaftar. `null` = tak ada jalan keluar yang boleh diklik. */
  returnUrl: string | null;
  returnCta: string;
  noReturnUrlNote: string;
  /** Baris tambahan opsional (mis. nominal + waktu bayar). */
  children?: React.ReactNode;
}

export function PartnerStatusScreen({
  tone,
  heading,
  body,
  returnUrl,
  returnCta,
  noReturnUrlNote,
  children,
}: PartnerStatusScreenProps) {
  const { Icon, wrap, badge } = TONE[tone];
  return (
    <div className="flex flex-col gap-4">
      <div className={`flex flex-col items-center gap-2 rounded-xl p-5 text-center ${wrap}`}>
        <span className={`flex size-11 items-center justify-center rounded-full ${badge}`}>
          <Icon className="size-6" />
        </span>
        <p className="text-base font-semibold text-foreground">{heading}</p>
        {children}
        <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
      </div>

      {returnUrl ? (
        // Navigasi tingkat atas ke domain partner — memang lintas-origin, memang meninggalkan
        // halaman kami. Itu tujuannya.
        <a
          href={returnUrl}
          data-testid="partner-return-link"
          style={{ backgroundColor: "var(--partner-brand)", color: "var(--partner-brand-text)" }}
          className="flex h-[44px] w-full items-center justify-center rounded-lg border border-foreground/15 text-sm font-semibold transition-opacity hover:opacity-90"
        >
          {returnCta}
        </a>
      ) : (
        <p className="text-center text-xs text-muted-foreground">{noReturnUrlNote}</p>
      )}
    </div>
  );
}
