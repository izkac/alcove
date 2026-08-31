import { useEffect, useRef, useState } from "react"
import type { PointerEvent } from "react"
import { DesktopIconTile } from "@/components/desktop-icon"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { PIN_CELL_W, cellStyle, fieldRect, spotsOnDesk } from "@/lib/pin-grid"
import type { DesktopIcon, PinSpot } from "@/types"

type PinFieldProps = {
  icons: DesktopIcon[]
  pinAt: Record<string, PinSpot> | undefined
  deskId: string
  selectedIds: string[]
  highlightedIconId: string | null
  onOpen: (icon: DesktopIcon) => void
  onRename: (icon: DesktopIcon) => void
  onUnpark: (icon: DesktopIcon) => void
  onDelete: (icon: DesktopIcon) => void
  onIconPointerDown: (icon: DesktopIcon, event: PointerEvent) => void
}

/**
 * Icons the user parked on the wallpaper.
 *
 * Sits under everything else and only claims the pixels its tiles cover, so the
 * empty desktop stays a drop target and a right-click still reaches the
 * wallpaper menu.
 */
export function PinField({
  icons,
  pinAt,
  deskId,
  selectedIds,
  highlightedIconId,
  onOpen,
  onRename,
  onUnpark,
  onDelete,
  onIconPointerDown,
}: PinFieldProps) {
  const [menuIcon, setMenuIcon] = useState<DesktopIcon | null>(null)
  const ctxIconRef = useRef<DesktopIcon | null>(null)
  // Unplug a monitor and the grid shrinks under the icons; re-clamp on resize
  // or they sit off the edge until something else happens to re-render.
  const [size, setSize] = useState(() => {
    const rect = fieldRect()
    return { width: rect.width, height: rect.height }
  })
  useEffect(() => {
    const onResize = () => {
      const rect = fieldRect()
      setSize({ width: rect.width, height: rect.height })
    }
    // The grid's box only exists once the tree is mounted, so measure it here
    // as well: the first render can only guess.
    onResize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])
  const spots = spotsOnDesk(pinAt, deskId, size.width, size.height)
  const parked = spots
    .map((spot) => {
      const icon = icons.find((item) => item.id === spot.id)
      return icon ? { icon, cell: spot.cell } : null
    })
    .filter((item): item is { icon: DesktopIcon; cell: { col: number; row: number } } =>
      Boolean(item),
    )
  if (parked.length === 0) return null

  return (
    <ContextMenu
      onOpenChange={(open) => setMenuIcon(open ? ctxIconRef.current : null)}
    >
      <ContextMenuTrigger asChild>
        <div
          // Behind the drawers, in front of the wallpaper: an open drawer
          // covers what it covers, the way a window would.
          className="pointer-events-none absolute inset-0 -z-10"
          onContextMenuCapture={(event) => {
            const node = event.target
            const host =
              node instanceof Element ? node.closest("[data-desktop-icon]") : null
            const id = host instanceof HTMLElement ? host.dataset.desktopIcon : undefined
            ctxIconRef.current =
              parked.find((item) => item.icon.id === id)?.icon ?? null
          }}
        >
          {parked.map(({ icon, cell }) => (
            <div
              key={icon.id}
              className="pointer-events-auto absolute"
              style={{ ...cellStyle(cell), width: PIN_CELL_W }}
            >
              <DesktopIconTile
                icon={icon}
                size={48}
                selected={selectedIds.includes(icon.id)}
                highlighted={highlightedIconId === icon.id}
                onOpen={onOpen}
                onPointerDown={onIconPointerDown}
              />
            </div>
          ))}
        </div>
      </ContextMenuTrigger>
      {menuIcon ? (
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => onOpen(menuIcon)}>Open</ContextMenuItem>
          <ContextMenuItem onSelect={() => onRename(menuIcon)}>Rename</ContextMenuItem>
          <ContextMenuItem onSelect={() => onUnpark(menuIcon)}>
            Take off the desktop
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={() => onDelete(menuIcon)}>
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      ) : null}
    </ContextMenu>
  )
}
