import type { CSSProperties } from "react"
import type { AlcoveColor } from "@/types"

/**
 * A drawer's colour is the user's choice and it stays. What changed is where it
 * goes: on the glyph, as a tint that adapts to the wallpaper, rather than on
 * the whole tile. Six hues on the OKLCH wheel, named for what the user picked.
 *
 * Use with `tintStyle(color)` on the element and the `tint` / `tint-bg` /
 * `tint-dot` utilities from index.css, which read `--h` and pick a lightness
 * that reads on the current surface.
 */
export const ALCOVE_COLOR_STYLES: Record<
  AlcoveColor,
  { hue: number; label: string }
> = {
  sky: { hue: 240, label: "Sky" },
  violet: { hue: 295, label: "Violet" },
  amber: { hue: 75, label: "Amber" },
  emerald: { hue: 160, label: "Emerald" },
  rose: { hue: 5, label: "Rose" },
  slate: { hue: 250, label: "Slate" },
}

/** Inline style that sets the hue the tint utilities read. */
export function tintStyle(color: AlcoveColor): CSSProperties {
  const hue = ALCOVE_COLOR_STYLES[color].hue
  // Slate is the one that should not read as a colour at all.
  return color === "slate"
    ? ({ "--h": hue, "--tint-c": "0.02" } as CSSProperties)
    : ({ "--h": hue } as CSSProperties)
}
