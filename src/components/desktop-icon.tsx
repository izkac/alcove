import type { PointerEvent } from "react"
import { IconGlyph } from "@/components/icon-glyph"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { cn } from "@/lib/utils"
import type { Alcove, DesktopIcon } from "@/types"

type DesktopIconTileProps = {
  icon: DesktopIcon
  size: number
  highlighted?: boolean
  dimmed?: boolean
  alcoves: Alcove[]
  pinned: boolean
  onOpen: () => void
  onRename: () => void
  onTogglePin: () => void
  onMove: (alcoveId: string) => void
  onNewAlcove: () => void
  onPointerDown?: (icon: DesktopIcon, event: PointerEvent) => void
}

export function DesktopIconTile({
  icon,
  size,
  highlighted,
  dimmed,
  alcoves,
  pinned,
  onOpen,
  onRename,
  onTogglePin,
  onMove,
  onNewAlcove,
  onPointerDown,
}: DesktopIconTileProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          data-desktop-icon={icon.id}
          onPointerDown={(event) => onPointerDown?.(icon, event)}
          onDoubleClick={(event) => {
            event.stopPropagation()
            onOpen()
          }}
          className={cn(
            "flex w-full touch-none flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-center text-white/95 outline-none",
            "hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/50",
            highlighted && "bg-sky-400/25 ring-2 ring-sky-300",
            dimmed && "opacity-40",
          )}
        >
          <IconGlyph icon={icon} size={size} />
          <span className="line-clamp-2 w-full text-[11px] leading-tight drop-shadow-sm">
            {icon.name}
          </span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onOpen}>Open</ContextMenuItem>
        <ContextMenuItem onSelect={onRename}>Rename</ContextMenuItem>
        <ContextMenuItem onSelect={onTogglePin}>
          {pinned ? "Unpin from rail" : "Pin to rail"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>Move to</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {alcoves.map((alcove) => (
              <ContextMenuItem
                key={alcove.id}
                disabled={alcove.id === icon.alcoveId}
                onSelect={() => onMove(alcove.id)}
              >
                {alcove.name}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onSelect={onNewAlcove}>New Alcove with this</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
