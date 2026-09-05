"use client"

import * as React from "react"
import { Check, Clock, Loader2, X } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Steps — kemajuan berurutan dalam satu kolom. Figma menamainya `Steps (23)`.
 *
 * Dulu ada DUA stepper di repo ini yang tidak saling tahu: `MintStatusTracker` (checkout
 * jalur app) dan `PartnerProgressStepper` (jalur partner). Keduanya merender tiga langkah
 * yang sama untuk pesanan yang sama, dan keduanya memilih sendiri warna "selesai" — persis
 * cara temuan C8 lahir. Yang dipusatkan di sini adalah bagian yang TIDAK boleh berbeda:
 * tata letak, garis penghubung, tipografi label/keterangan, dan pemetaan keadaan → warna.
 *
 * Yang sengaja TIDAK dipusatkan: ikon langkah aktif. Jalur partner mewarnainya dengan merek
 * partner (`--partner-brand`) dan jalur app dengan token maroon; memaksa satu ikon untuk
 * keduanya akan menaruh maroon USDX di halaman bermerek orang lain. Karena itu ada
 * `renderIcon` — pemanggil boleh mengambil alih ikon per keadaan, dan yang tidak diambil
 * alih jatuh ke ikon bawaan.
 *
 * Glif langkah selesai/gagal dilubangi dengan `text-card`, bukan `text-white`: `--success`
 * (#22c55e) dan `--destructive` (#f87171) di tema gelap sama-sama terang, dan di layar
 * FAILED + PAID kedua lingkaran itu muncul bersebelahan. Beda luminansinya cuma 1,21:1, jadi
 * yang membedakannya BENTUK glifnya — centang lawan silang — dan glif putih di atas isian
 * terang cuma 2,28:1 / 2,77:1. Dilubangi dengan warna permukaan kartu: 7,64:1 dan 6,29:1.
 */
type StepState = "done" | "active" | "pending" | "failed"

interface StepItem {
  label: React.ReactNode
  /** Keterangan di bawah label. Pemanggil yang memutuskan kapan ia layak tampil. */
  detail?: React.ReactNode
  state: StepState
  /**
   * Spinner (bukan jam) saat langkahnya berjalan. Dipakai untuk langkah yang memang
   * ditunggui di halaman ini; langkah yang bisa makan berjam-jam justru TIDAK boleh
   * berputar — spinner berkata "sebentar lagi" tepat di sebelah "halaman boleh ditutup".
   */
  spinWhenActive?: boolean
}

const SIZES = {
  sm: { ring: "size-5", glyph: "size-3", line: "left-2.5", gap: "pb-3", text: "text-sm" },
  md: { ring: "size-6", glyph: "size-3.5", line: "left-3", gap: "pb-4", text: "text-sm" },
} as const

function Steps({
  steps,
  size = "md",
  connector = true,
  renderIcon,
  className,
  ...props
}: Omit<React.ComponentProps<"ol">, "children"> & {
  steps: StepItem[]
  size?: keyof typeof SIZES
  /**
   * Garis vertikal yang menyambung lingkaran. Ia yang menyatakan "ini satu proses
   * berurutan"; tanpanya tiga langkah terbaca sebagai tiga kotak centang lepas.
   */
  connector?: boolean
  renderIcon?: (ctx: { state: StepState; index: number }) => React.ReactNode | null | undefined
}) {
  const s = SIZES[size]

  return (
    <ol data-slot="steps" className={cn("flex flex-col", className)} {...props}>
      {steps.map((step, i) => {
        const custom = renderIcon?.({ state: step.state, index: i })
        const last = i === steps.length - 1

        return (
          <li
            key={i}
            data-state={step.state}
            className={cn("relative flex items-start gap-2.5", last ? "pb-0" : s.gap)}
          >
            {connector && !last && (
              // Garis mewarisi keadaan langkah DI ATASNYA: warna garis inilah yang membuat
              // "sudah sampai mana" terbaca tanpa membaca satu kata pun.
              <span
                aria-hidden
                className={cn(
                  "absolute top-6 bottom-0 -ml-px w-0.5 rounded-full",
                  size === "sm" && "top-5",
                  s.line,
                  step.state === "done"
                    ? "bg-success"
                    : step.state === "failed"
                      ? "bg-destructive"
                      : "bg-border"
                )}
              />
            )}

            {custom ?? <StepIcon state={step.state} index={i} spin={step.spinWhenActive} size={size} />}

            <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
              <span
                className={cn(
                  s.text,
                  step.state === "pending" && "text-muted-foreground",
                  step.state === "failed" && "font-medium text-destructive-text",
                  step.state !== "pending" && step.state !== "failed" && "font-medium text-foreground"
                )}
              >
                {step.label}
              </span>
              {step.detail && (
                <span
                  className={cn(
                    "text-xs leading-relaxed",
                    step.state === "failed" ? "text-destructive-text" : "text-muted-foreground"
                  )}
                >
                  {step.detail}
                </span>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function StepIcon({
  state,
  index,
  spin,
  size,
}: {
  state: StepState
  index: number
  spin?: boolean
  size: keyof typeof SIZES
}) {
  const s = SIZES[size]
  const base = cn("relative z-10 flex shrink-0 items-center justify-center rounded-full", s.ring)

  if (state === "done")
    return (
      <span data-slot="step-icon" className={cn(base, "bg-success text-card")}>
        <Check className={s.glyph} strokeWidth={3} />
      </span>
    )

  if (state === "failed")
    return (
      <span data-slot="step-icon" className={cn(base, "bg-destructive text-card")}>
        <X className={s.glyph} strokeWidth={3} />
      </span>
    )

  if (state === "active")
    return (
      // `primary-text`, bukan `primary`: maroon #800000 di atas kartu gelap hanya 1,59:1, dan
      // ikon inilah satu-satunya penanda langkah yang sedang berjalan.
      <span
        data-slot="step-icon"
        className={cn(base, "border border-primary-text text-primary-text")}
      >
        {spin ? <Loader2 className={cn(s.glyph, "animate-spin")} /> : <Clock className={s.glyph} />}
      </span>
    )

  // Langkah yang belum jalan BERNOMOR, tidak kosong. Lingkaran kosong terbaca sebagai kotak
  // centang yang belum dicentang — sesuatu yang menunggu tindakan user. Nomor membacanya
  // sebagai urutan: ini langkah ke-berapa, bukan tugas yang belum kamu kerjakan.
  return (
    <span
      data-slot="step-icon"
      className={cn(base, "border border-border bg-card text-xs font-medium text-muted-foreground")}
    >
      {index + 1}
    </span>
  )
}

export { Steps, StepIcon }
export type { StepItem, StepState }
