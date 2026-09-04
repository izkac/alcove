import { memo } from "react"
import { cn } from "@/lib/utils"
import {
  ALCOVE_GLYPHS,
  defaultAlcoveGlyph,
  glyphIcon,
  isAlcoveGlyphId,
  resolveAlcoveGlyph,
  type AlcoveGlyphId,
} from "@/lib/alcove-glyphs-core"

// The icon grid and glyph mark live here because they're JSX; the metadata
// and the "pick a sensible default" logic live in alcove-glyphs-core.ts so
// syncDriveDrawers (a plain module, no React) can reuse them too. Re-exported
// below so every existing "@/lib/alcove-glyphs" import keeps working.
export { ALCOVE_GLYPHS, defaultAlcoveGlyph, isAlcoveGlyphId, resolveAlcoveGlyph }
export type { AlcoveGlyphId }

export function AlcoveGlyphMark({
  glyph,
  className,
  strokeWidth = 1.75,
}: {
  glyph: AlcoveGlyphId
  className?: string
  strokeWidth?: number
}) {
  const Icon = glyphIcon(glyph)
  return <Icon className={cn("size-6", className)} strokeWidth={strokeWidth} />
}

export const AlcoveGlyphGrid = memo(function AlcoveGlyphGrid({
  value,
  onChange,
}: {
  value: AlcoveGlyphId
  onChange: (glyph: AlcoveGlyphId) => void
}) {
  return (
    <div className="grid grid-cols-6 gap-1">
      {ALCOVE_GLYPHS.map((item) => {
        const selected = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            title={item.label}
            onPointerDown={(event) => {
              event.preventDefault()
              onChange(item.id)
            }}
            aria-pressed={selected}
            className={cn(
              "flex size-9 items-center justify-center rounded-lg outline-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-sel",
              selected
                ? "bg-sel-soft text-ink ring-1 ring-sel"
                : "text-ink-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            <item.Icon className="size-[18px]" strokeWidth={1.75} />
          </button>
        )
      })}
    </div>
  )
})
