"use client";

// CopyField — nilai yang perlu disalin persis (nomor VA, total bayar, nomor pesanan, tx hash).
//
// Figma `50 · Checkout` memakainya empat kali dan menamainya "CopyField (25)", artinya ia
// komponen sistem desain. Bagian G F.5 membatasi `ui/` ke komponen yang sudah punya pemakai;
// saat keputusan itu diambil pemakainya belum ada, sekarang ada empat — jadi ambangnya
// terpenuhi dan ia tinggal di sini. Tinggi 44 px, radius 8, latar `muted` diambil dari node
// Figma (`2610:20022`, `2610:20030`, `2610:20878`).
//
// Tombol salinnya `ui/button` size `icon-sm`, bukan tombol mentah: yang hilang bersama tombol
// mentah adalah indikator fokus keyboard, dan ini halaman yang memindahkan uang.

import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CopyField({
  label,
  value,
  copyValue,
  onCopy,
  copyAriaLabel,
  mono = false,
  className,
}: {
  /** Label di atas kotak. Dihilangkan kalau field-nya sudah dijelaskan sekitarnya. */
  label?: string;
  /** Yang dibaca mata. */
  value: React.ReactNode;
  /** Yang masuk clipboard — nomor VA disalin tanpa spasi pengelompokan. */
  copyValue: string;
  onCopy: (text: string) => void;
  copyAriaLabel: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && <p className="text-xs leading-4 text-muted-foreground">{label}</p>}
      <div className="flex h-11 items-center justify-between gap-2 rounded-lg bg-muted px-3">
        <span
          className={cn(
            "min-w-0 truncate text-base font-semibold text-foreground",
            mono && "font-mono tracking-wider",
          )}
        >
          {value}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onCopy(copyValue)}
          aria-label={copyAriaLabel}
          className="shrink-0 text-muted-foreground"
        >
          <Copy />
        </Button>
      </div>
    </div>
  );
}
