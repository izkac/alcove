import { IconGlyph } from "@/components/icon-glyph"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { cn } from "@/lib/utils"
import type { DesktopIcon, StripEdge } from "@/types"
import { Pin } from "lucide-react"

type FrequentStripProps = {
  icons: DesktopIcon[]
  keepIds: string[]
  edge?: StripEdge
  onOpen: (icon: DesktopIcon) => void
  onToggleKeep: (iconId: string) => void
  onHide: (iconId: string) => void
  onReveal: (iconId: string) => void
}

/**
 * The things you actually open, held at the top or bottom edge (Settings).
 * Slot order comes from the caller and deliberately does not re-sort by rank —
 * see lib/frecency.
 */
export function FrequentStrip({
  icons,
  keepIds,
  edge = "top",
  onOpen,
  onToggleKeep,
  onHide,
  onReveal,
}: FrequentStripProps) {
  if (icons.length === 0) return null

  return (
    // In flow, so the desktop below it never has to know the strip's height.
    <div
      className={cn(
        "relative z-20 flex shrink-0 justify-center px-4 md:px-6",
        edge === "bottom" ? "pt-1 pb-3" : "pt-3 pb-1",
      )}
    >
      <div className="flex items-end gap-1 rounded-2xl border border-white/15 bg-black/40 px-2 py-1.5 shadow-2xl backdrop-blur-2xl">
        {icons.map((icon) => {
          const kept = keepIds.includes(icon.id)
          return (
            <ContextMenu key={icon.id}>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  title={icon.name}
                  onClick={() => onOpen(icon)}
                  className={cn(
                    "relative flex w-[64px] flex-col items-center gap-1 rounded-xl px-1 py-1.5 outline-none transition",
                    "hover:bg-white/12 focus-visible:ring-2 focus-visible:ring-white/50",
                  )}
                >
                  <IconGlyph icon={icon} size={34} />
                  <span className="w-full truncate text-center text-[10px] text-white/85">
                    {icon.name.replace(/\.[^.]+$/, "")}
                  </span>
                  {kept ? (
                    <Pin className="absolute top-0.5 right-1 size-2.5 fill-sky-300 text-sky-300" />
                  ) : null}
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => onOpen(icon)}>Open</ContextMenuItem>
                <ContextMenuItem onSelect={() => onReveal(icon.id)}>
                  Show in its Alcove
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => onToggleKeep(icon.id)}>
                  {kept ? "Stop keeping here" : "Keep in this slot"}
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => onHide(icon.id)}>
                  Never show here
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          )
        })}
      </div>
    </div>
  )
}
