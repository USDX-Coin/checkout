"use client";

// Kemajuan pesanan — komponen `progress` + `step/done|active|idle` pada frame P04/N04 di Figma.
//
// Tiga langkah: Pembayaran → Proses on-chain → Selesai. Langkah kedua adalah yang paling lama
// ("bisa memakan waktu beberapa jam"), dan justru karena itu ia diberi keterangan sendiri: orang
// yang melihat lingkaran berputar tanpa penjelasan akan menungguinya.
//
// Ikon langkah aktif SENGAJA bukan spinner. Spinner berkata "tunggu sebentar lagi" tepat di
// sebelah kalimat "silakan kembali ke aplikasi", dan mata lebih percaya spinner daripada teks.
//
// Satu penyimpangan sadar dari desain: di Figma label berbunyi "67%" sementara lebar bilah
// terisinya sekitar 19% — dua angka yang bertentangan di dalam satu komponen. Di sini lebar bilah
// DIHITUNG dari langkahnya, jadi label dan bilah selalu sepakat. Lihat § Known Drift di PR.

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepState = "done" | "active" | "idle";

export interface StepperStep {
  label: string;
  /** Keterangan; hanya ditampilkan saat langkahnya `done` atau `active`. */
  detail?: string | null;
  state: StepState;
}

/** Nomor langkah yang sedang berjalan (1-based). Semua selesai → jumlah langkah. */
function currentStep(steps: StepperStep[]): number {
  const active = steps.findIndex((s) => s.state === "active");
  if (active >= 0) return active + 1;
  const done = steps.filter((s) => s.state === "done").length;
  return Math.max(1, done);
}

export function PartnerProgressStepper({
  steps,
  label,
}: {
  steps: StepperStep[];
  label: string;
}) {
  const step = currentStep(steps);
  const percent = Math.round((step / steps.length) * 100);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span
          style={{ color: "var(--partner-accent-text)" }}
          className="text-xs font-bold tabular-nums"
        >
          {percent}%
        </span>
      </div>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${percent}%`, backgroundColor: "var(--partner-brand)" }}
        />
      </div>

      <ol className="flex flex-col gap-3 pt-1">
        {steps.map((s) => (
          <li key={s.label} className="flex items-start gap-2.5">
            <StepIcon state={s.state} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span
                className={cn(
                  "text-sm",
                  s.state === "idle"
                    ? "text-muted-foreground"
                    : "font-semibold text-foreground",
                )}
              >
                {s.label}
              </span>
              {s.detail && s.state !== "idle" && (
                <span className="text-xs leading-relaxed text-muted-foreground">{s.detail}</span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepIcon({ state }: { state: StepState }) {
  // Glif langkah selesai dilubangi dengan warna permukaan kartu, bukan putih: `--success` di tema gelap
  // (#22c55e) terlalu terang untuk menampung centang putih (2,28:1). Sama dengan
  // `MintStatusTracker`, supaya dua stepper di repo ini tidak berbeda diam-diam.
  if (state === "done") {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-success text-card">
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span
        style={{ backgroundColor: "var(--partner-brand)" }}
        className="flex size-5 shrink-0 items-center justify-center rounded-full"
      >
        {/* `--partner-brand-text`, bukan putih: titik ini duduk di atas warna merek
            partner, dan partner yang mereknya terang membuat titik putih lenyap.
            Token ini sudah dipasangkan dengan `--partner-brand` di PartnerShell. */}
        <span className="size-1.5 rounded-full" style={{ backgroundColor: "var(--partner-brand-text)" }} />
      </span>
    );
  }
  return <span className="size-5 shrink-0 rounded-full border-2 border-border" />;
}
