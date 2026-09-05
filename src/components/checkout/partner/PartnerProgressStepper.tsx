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

import { Steps, type StepItem } from "@/components/ui/steps";

export type StepState = "done" | "active" | "idle";

export interface StepperStep {
  label: string;
  /** Keterangan; hanya ditampilkan saat langkahnya `done` atau `active`. */
  detail?: string | null;
  state: StepState;
}

// `idle` di jalur partner = `pending` di `ui/steps`. Namanya berbeda karena tipe partner sudah
// dipakai `PartnerCheckout`; yang dipetakan cuma nilainya.
const TO_STEP_STATE: Record<StepState, StepItem["state"]> = {
  done: "done",
  active: "active",
  idle: "pending",
};

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

      <Steps
        className="pt-1"
        size="sm"
        // Garis penghubung sengaja MATI di jalur partner: frame P04/N04 menggambar lingkaran
        // lepas, dan halaman ini bermerek partner — menambah garis di sini adalah perubahan
        // visual pada desain orang lain, bukan perbaikan checkout. Menyatukannya urusan PR
        // yang memang menggarap halaman partner.
        connector={false}
        steps={steps.map((s) => ({
          label: s.label,
          state: TO_STEP_STATE[s.state],
          detail: s.detail && s.state !== "idle" ? s.detail : null,
        }))}
        renderIcon={({ state, index }) => {
          // Ikon "selesai" jatuh ke bawaan `ui/steps` — itu justru yang harus sama antar-jalur
          // (temuan C8). Dua sisanya diambil alih karena memakai warna MEREK PARTNER, dan
          // maroon USDX tidak boleh muncul di halaman bermerek orang lain.
          if (state === "active")
            return (
              <span
                key={index}
                data-slot="step-icon"
                style={{ backgroundColor: "var(--partner-brand)" }}
                className="relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full"
              >
                {/* `--partner-brand-text`, bukan putih: titik ini duduk di atas warna merek
                    partner, dan partner yang mereknya terang membuat titik putih lenyap. */}
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: "var(--partner-brand-text)" }}
                />
              </span>
            );
          if (state === "pending")
            return (
              <span
                key={index}
                data-slot="step-icon"
                className="relative z-10 size-5 shrink-0 rounded-full border-2 border-border"
              />
            );
          return null;
        }}
      />
    </div>
  );
}
