"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { RadioGroupItem } from "@/components/ui/radio-group"

/**
 * CardChoice — a whole card that acts as the label for one radio.
 *
 * ── Why `@container` and not a breakpoint ────────────────────────────────────
 * This is the first component in the codebase to use a container query, so the
 * reasoning is written here once.
 *
 * On the Register screen two of these cards sit side by side, which makes each
 * one about 218 px wide — on a *desktop*. A viewport breakpoint asks "how wide
 * is the window", and the window is 1280 px, so `md:` and friends all answer
 * "plenty of room" and the "SEGERA HADIR" badge eats the whole title row,
 * leaving roughly 35 px for the text. `@container` asks the only question that
 * matters here: how wide is *this card*. Below the threshold the badge drops to
 * its own line instead of squeezing the title.
 *
 * The threshold is 240 px and it is measured on the card's CONTENT box, which is
 * what a size container query reports — not the 300 px border-box figure this
 * comment used to name. At 300 the checkout method card wrapped its badge on a
 * 375 px phone (content box 271) and grew from 52 px to 76 px, while Figma's own
 * mobile column draws it at 52 (`2639:32006`, card 303 wide). Title plus badge
 * need about 225 px; 240 keeps a margin over that and still wraps on a 320 px
 * screen, where the content box drops to 216 and they genuinely do not fit.
 *
 * The same reasoning applies to `Alert`, `StatusBadge` and table cells: every
 * one of them can be narrow inside a wide window. Tailwind v4 supports this
 * with no plugin.
 *
 * The badge stays at full opacity while the card is disabled — it is the thing
 * that explains *why* the card is dead, so dimming it hides the answer.
 */
function CardChoice({
  className,
  value,
  title,
  description,
  icon,
  badge,
  disabled = false,
  id,
  ...props
}: Omit<React.ComponentProps<"label">, "title"> & {
  value: string
  title: React.ReactNode
  description?: React.ReactNode
  /** 32×32 frame on the right. Ignored when a badge is shown — the badge takes its place. */
  icon?: React.ReactNode
  /** Feature label, e.g. "Segera hadir". Pass `false` to fall back to the description. */
  badge?: React.ReactNode | false
  disabled?: boolean
}) {
  const itemId = id ?? `choice-${value}`
  const showBadge = badge !== undefined && badge !== false && badge !== null

  return (
    <label
      data-slot="card-choice"
      htmlFor={itemId}
      data-disabled={disabled || undefined}
      className={cn(
        "@container/choice group relative flex w-full items-center gap-3 rounded-xl bg-card p-4",
        "transition-control",
        // The edge is an INSET SHADOW, not a `border`. Figma draws the stroke
        // inside the card, so `Card/Pilihan` is 70 px tall (52 without the
        // description) in both the default and the selected state. A CSS border
        // is counted in the box, so `border` + `p-4` measured 72 px and the
        // 2 px selected border measured 74 — the card grew by 2 px the moment
        // it was clicked, under the pointer that clicked it. A shadow takes no
        // space, so 16 + 38 + 16 = 70 holds whatever the edge is doing.
        "shadow-[inset_0_0_0_1px_var(--color-border)]",
        disabled
          ? "cursor-not-allowed"
          : "cursor-pointer pointer-fine:hover:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-foreground)_25%,transparent)]",
        // 2 px maroon + a 5 % wash. `primary-text`, not `primary`: #800000 on a
        // dark card is 1,59:1 and the selected border would vanish at night.
        "has-data-[state=checked]:shadow-[inset_0_0_0_2px_var(--color-primary-text)] has-data-[state=checked]:bg-primary-text/5",
        // The card is the label, so the focus ring goes round the whole card —
        // but detached by a background-coloured gap. Without the gap a 2 px
        // maroon ring sits flush against the 2 px maroon border of the selected
        // state and the two read as one edge: "focused" and "chosen" become
        // indistinguishable, which on a bank tile means paying the wrong account.
        "has-[[data-slot=radio-group-item]:focus-visible]:ring-2 has-[[data-slot=radio-group-item]:focus-visible]:ring-focus-ring",
        "has-[[data-slot=radio-group-item]:focus-visible]:ring-offset-2 has-[[data-slot=radio-group-item]:focus-visible]:ring-offset-background",
        className
      )}
      {...props}
    >
      <RadioGroupItem
        id={itemId}
        value={value}
        disabled={disabled}
        className={cn("focus-visible:ring-0", disabled && "opacity-50")}
      />

      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span
          data-slot="card-choice-text"
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-0.5 @max-[240px]/choice:basis-full",
            disabled && "opacity-50"
          )}
        >
          {/* min-w-0 so `truncate` bites on the title and never on the badge. */}
          <span className="min-w-0 truncate text-sm leading-5 font-medium">{title}</span>
          {description && (
            <span className="text-xs leading-4 text-muted-text">{description}</span>
          )}
        </span>

        {showBadge && (
          <Badge tone="coming-soon" className="shrink-0">
            {badge}
          </Badge>
        )}
      </span>

      {icon && !showBadge && (
        <span
          aria-hidden
          className={cn(
            "flex size-8 shrink-0 items-center justify-center text-muted-text [&_svg]:size-4",
            disabled && "opacity-50"
          )}
        >
          {icon}
        </span>
      )}
    </label>
  )
}

export { CardChoice }
