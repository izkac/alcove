import { memo } from "react"
import type { PointerEvent } from "react"
import { IconGlyph } from "@/components/icon-glyph"
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu"
import { cn } from "@/lib/utils"
import type { Alcove, DesktopIcon, IconGroup } from "@/types"

type DesktopIconTileProps = {
  icon: DesktopIcon
  size: number
  highlighted?: boolean
  onOpen: (icon: DesktopIcon) => void
  onPointerDown?: (icon: DesktopIcon, event: PointerEvent) => void
}

export const DesktopIconTile = memo(function DesktopIconTile({
  icon,
  size,
  highlighted,
  onOpen,
  onPointerDown,
}: DesktopIconTileProps) {
  return (
    <button
      type="button"
      data-desktop-icon={icon.id}
      onPointerDown={(event) => onPointerDown?.(icon, event)}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onOpen(icon)
      }}
      className={cn(
        "alcove-icon-tile flex w-full touch-none flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-center text-white/95 outline-none",
        "hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/50",
        highlighted && "bg-sky-400/25 ring-2 ring-sky-300",
      )}
    >
      <IconGlyph icon={icon} size={size} />
      <span className="line-clamp-2 w-full text-[11px] leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
        {icon.name}
      </span>
    </button>
  )
})

type IconContextItemsProps = {
  icon: DesktopIcon
  alcoves: Alcove[]
  pinned: boolean
  groups?: IconGroup[]
  onOpen: (icon: DesktopIcon) => void
  onRename: (icon: DesktopIcon) => void
  onTogglePin: (iconId: string) => void
  onMove: (iconId: string, alcoveId: string) => void
  onMoveToGroup?: (iconId: string, groupId: string | null) => void
  onNewAlcove: (icon: DesktopIcon) => void
  onDelete?: (icon: DesktopIcon) => void
}

export function IconContextItems({
  icon,
  alcoves,
  pinned,
  groups,
  onOpen,
  onRename,
  onTogglePin,
  onMove,
  onMoveToGroup,
  onNewAlcove,
  onDelete,
}: IconContextItemsProps) {
  return (
    <>
      <ContextMenuItem onSelect={() => onOpen(icon)}>Open</ContextMenuItem>
      <ContextMenuItem onSelect={() => onRename(icon)}>Rename</ContextMenuItem>
      <ContextMenuItem onSelect={() => onTogglePin(icon.id)}>
        {pinned ? "Unpin from desktop" : "Pin to desktop"}
      </ContextMenuItem>
      <ContextMenuSeparator />
      {groups && groups.length > 0 && onMoveToGroup ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger>Move to group</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {groups.map((group) => (
              <ContextMenuItem
                key={group.id}
                disabled={group.id === icon.groupId}
                onSelect={() => onMoveToGroup(icon.id, group.id)}
              >
                {group.name}
              </ContextMenuItem>
            ))}
            <ContextMenuSeparator />
            <ContextMenuItem
              disabled={!icon.groupId}
              onSelect={() => onMoveToGroup(icon.id, null)}
            >
              Everything else
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : null}
      {!alcoves.find((alcove) => alcove.id === icon.alcoveId)?.folderPath ? (
      <ContextMenuSub>
        <ContextMenuSubTrigger>Move to</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {alcoves
            .filter((alcove) => !alcove.folderPath)
            .map((alcove) => (
            <ContextMenuItem
              key={alcove.id}
              disabled={alcove.id === icon.alcoveId}
              onSelect={() => onMove(icon.id, alcove.id)}
            >
              {alcove.name}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
      ) : null}
      {!alcoves.find((alcove) => alcove.id === icon.alcoveId)?.folderPath ? (
      <ContextMenuItem onSelect={() => onNewAlcove(icon)}>
        New Alcove with this
      </ContextMenuItem>
      ) : null}
      {onDelete ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={() => onDelete(icon)}>
            Delete
          </ContextMenuItem>
        </>
      ) : null}
    </>
  )
}
