import { useState } from "react"
import { IconGlyph } from "@/components/icon-glyph"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ALCOVE_COLOR_STYLES } from "@/lib/colors"
import { formatByteSize } from "@/lib/folder-view"
import { largestIcon, totalByteSize } from "@/lib/weight"
import { cn } from "@/lib/utils"
import type { Alcove, DesktopIcon } from "@/types"

type AlcoveChipProps = {
  alcove: Alcove
  icons: DesktopIcon[]
  dimmed?: boolean
  onExpand: () => void
  onDragOverAlcove: () => void
}

export function AlcoveChip({
  alcove,
  icons,
  dimmed,
  onExpand,
  onDragOverAlcove,
}: AlcoveChipProps) {
  const [open, setOpen] = useState(false)
  const styles = ALCOVE_COLOR_STYLES[alcove.color]
  const preview = icons.slice(0, 8)
  const bytes = totalByteSize(icons)
  const largest = largestIcon(icons)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData("application/x-alcove-panel", alcove.id)
            event.dataTransfer.effectAllowed = "move"
          }}
          onDragOver={(event) => {
            event.preventDefault()
            onDragOverAlcove()
          }}
          onDrop={(event) => {
            event.preventDefault()
            onDragOverAlcove()
          }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onClick={onExpand}
          className={cn(
            "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-white shadow-lg ring-1 backdrop-blur-xl transition",
            "bg-white/12 hover:bg-white/20",
            styles.chip,
            dimmed && "opacity-30",
          )}
        >
          <span className={cn("size-2.5 rounded-full", styles.bar)} />
          <span className="font-medium">{alcove.name}</span>
          <Badge variant="secondary" className="h-5 bg-black/30 text-white">
            {icons.length}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        className="w-56 border-white/15 bg-zinc-900/90 p-3 text-white backdrop-blur-xl"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <p className="mb-2 text-xs text-white/60">Peek · click to expand</p>
        {preview.length === 0 ? (
          <p className="text-sm text-white/70">Nothing in this Alcove yet.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {preview.map((icon) => (
              <div key={icon.id} className="flex flex-col items-center gap-1">
                <IconGlyph icon={icon} size={32} />
                <span className="line-clamp-1 w-full text-center text-[10px] text-white/80">
                  {icon.name}
                </span>
              </div>
            ))}
          </div>
        )}
        {icons.length > preview.length ? (
          <p className="mt-2 text-xs text-white/50">
            +{icons.length - preview.length} more
          </p>
        ) : null}
        {bytes > 0 ? (
          <div className="mt-2.5 flex flex-col gap-0.5 border-t border-white/12 pt-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-white/55">
                {icons.length} {icons.length === 1 ? "item" : "items"}
              </span>
              <span className="text-xs font-medium text-amber-200/85">
                {formatByteSize(bytes)}
              </span>
            </div>
            {largest ? (
              <p className="truncate text-[11px] text-white/45">
                Largest · {largest.name} · {formatByteSize(largest.byteSize)}
              </p>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
