import { useState } from "react"
import { IconGlyph } from "@/components/icon-glyph"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { tintStyle } from "@/lib/colors"
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
          style={tintStyle(alcove.color)}
          className={cn(
            "flex items-center gap-2 rounded-full border border-hairline bg-desk px-3 py-1.5 text-ui text-ink shadow-pill transition-colors duration-150 hover:bg-surface-2",
            "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sel",
            dimmed && "opacity-30",
          )}
        >
          <span className="tint-dot size-2.5 rounded-full" />
          <span className="font-medium">{alcove.name}</span>
          <span className="rounded-full bg-surface-3 px-1.5 text-label leading-5 text-ink-muted">
            {icons.length}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        className="w-56 p-3 text-ink shadow-pop ring-hairline"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <p className="mb-2 text-meta text-ink-muted">Peek · click to expand</p>
        {preview.length === 0 ? (
          <p className="text-ui text-ink-muted">Nothing in this Alcove yet.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {preview.map((icon) => (
              <div key={icon.id} className="flex flex-col items-center gap-1">
                <IconGlyph icon={icon} size={32} />
                <span className="line-clamp-1 w-full text-center text-label text-ink-muted">
                  {icon.name}
                </span>
              </div>
            ))}
          </div>
        )}
        {icons.length > preview.length ? (
          <p className="mt-2 text-meta text-ink-faint">
            +{icons.length - preview.length} more
          </p>
        ) : null}
        {bytes > 0 ? (
          <div className="mt-2.5 flex flex-col gap-0.5 border-t border-hairline pt-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-label text-ink-muted">
                {icons.length} {icons.length === 1 ? "item" : "items"}
              </span>
              <span className="text-meta font-medium text-ink">
                {formatByteSize(bytes)}
              </span>
            </div>
            {largest ? (
              <p className="truncate text-label text-ink-faint">
                Largest · {largest.name} · {formatByteSize(largest.byteSize)}
              </p>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
