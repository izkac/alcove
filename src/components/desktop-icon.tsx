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
  selected?: boolean
  /**
   * The tile sits on bare wallpaper rather than on a surface, so its label has
   * to bring its own contrast and the icon gets a lift off the picture.
   */
  onWallpaper?: boolean
  onOpen: (icon: DesktopIcon) => void
  onPointerDown?: (icon: DesktopIcon, event: PointerEvent) => void
}

export const DesktopIconTile = memo(function DesktopIconTile({
  icon,
  size,
  highlighted,
  selected,
  onWallpaper = false,
  onOpen,
  onPointerDown,
}: DesktopIconTileProps) {
  const lit = Boolean(highlighted || selected)
  return (
    <button
      type="button"
      data-desktop-icon={icon.id}
      aria-selected={lit || undefined}
      onPointerDown={(event) => onPointerDown?.(icon, event)}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onOpen(icon)
      }}
      className={cn(
        "alcove-icon-tile flex w-full touch-none flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-center outline-none transition-colors duration-150",
        onWallpaper
          ? "on-wallpaper hover:bg-[oklch(100%_0_0/0.12)]"
          : "text-ink hover:bg-surface-2",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sel",
        lit && "bg-sel-soft ring-[1.5px] ring-sel",
      )}
    >
      <IconGlyph icon={icon} size={size} className={onWallpaper ? "wp-icon-shadow" : undefined} />
      <span className="line-clamp-2 w-full text-label">{icon.name}</span>
    </button>
  )
})

type IconContextItemsProps = {
  icon: DesktopIcon
  pack?: DesktopIcon[]
  alcoves: Alcove[]
  pinned: boolean
  groups?: IconGroup[]
  onOpen: (icon: DesktopIcon) => void
  onRename: (icon: DesktopIcon) => void
  onSetPinned: (iconIds: string[], pinned: boolean) => void
  onMove: (iconId: string, alcoveId: string) => void
  onMoveToGroup?: (iconId: string, groupId: string | null) => void
  onNewAlcove: (icons: DesktopIcon[]) => void
  onDelete?: (icon: DesktopIcon) => void
}

function countLabel(verb: string, count: number) {
  return count > 1 ? `${verb} ${count} items` : verb
}

export function IconContextItems({
  icon,
  pack,
  alcoves,
  pinned,
  groups,
  onOpen,
  onRename,
  onSetPinned,
  onMove,
  onMoveToGroup,
  onNewAlcove,
  onDelete,
}: IconContextItemsProps) {
  const items = pack && pack.length > 0 ? pack : [icon]
  const count = items.length
  const ids = items.map((item) => item.id)
  const liveFolder = Boolean(
    alcoves.find((alcove) => alcove.id === icon.alcoveId)?.folderPath,
  )
  return (
    <>
      <ContextMenuItem
        onSelect={() => {
          for (const item of items) onOpen(item)
        }}
      >
        {countLabel("Open", count)}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={count > 1}
        onSelect={() => onRename(icon)}
      >
        Rename
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onSetPinned(ids, !pinned)}>
        {count > 1
          ? pinned
            ? `Take ${count} items off the desktop`
            : `Put ${count} items on the desktop`
          : pinned
            ? "Take off the desktop"
            : "Put on the desktop"}
      </ContextMenuItem>
      <ContextMenuSeparator />
      {groups && groups.length > 0 && onMoveToGroup ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger>Move to group</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {groups.map((group) => (
              <ContextMenuItem
                key={group.id}
                disabled={items.every((item) => item.groupId === group.id)}
                onSelect={() => onMoveToGroup(icon.id, group.id)}
              >
                {group.name}
              </ContextMenuItem>
            ))}
            <ContextMenuSeparator />
            <ContextMenuItem
              disabled={items.every((item) => !item.groupId)}
              onSelect={() => onMoveToGroup(icon.id, null)}
            >
              Everything else
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : null}
      {!liveFolder ? (
      <ContextMenuSub>
        <ContextMenuSubTrigger>Move to</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {alcoves
            .filter((alcove) => !alcove.folderPath)
            .map((alcove) => (
            <ContextMenuItem
              key={alcove.id}
              disabled={items.every((item) => item.alcoveId === alcove.id)}
              onSelect={() => onMove(icon.id, alcove.id)}
            >
              {alcove.name}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
      ) : null}
      {!liveFolder ? (
      <ContextMenuItem onSelect={() => onNewAlcove(items)}>
        {count > 1 ? "New Alcove with these" : "New Alcove with this"}
      </ContextMenuItem>
      ) : null}
      {onDelete ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={() => onDelete(icon)}>
            {countLabel("Delete", count)}
          </ContextMenuItem>
        </>
      ) : null}
    </>
  )
}
