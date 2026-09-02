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
import { AlcoveGlyphGrid, AlcoveGlyphMark, resolveAlcoveGlyph } from "@/lib/alcove-glyphs"
import { ALCOVE_COLOR_IDS } from "@/types"
import { ALCOVE_COLOR_STYLES, tintStyle } from "@/lib/colors"
import { INBOX_ID } from "@/data/sample"
import { formatByteSize } from "@/lib/folder-view"
import { cn } from "@/lib/utils"
import type { Alcove, AlcoveColor } from "@/types"
import type { DeskInfo } from "@/lib/desk-strip"
import { Plus, Search, Settings } from "lucide-react"
import type { PointerEvent as ReactPointerEvent } from "react"

type ShelfRailProps = {
  alcoves: Alcove[]
  countFor: (alcoveId: string) => number
  /** Bytes held by an Alcove. Shown in the tooltip; 0 hides it. */
  sizeFor: (alcoveId: string) => number
  /** The one Alcove that outweighs the rest — named as such in its tooltip. */
  heavyAlcoveId?: string | null
  openAlcoveId: string | null
  onSelect: (alcoveId: string) => void
  onSearch: () => void
  onNewAlcove: () => void
  onSettings: () => void
  onEdit: (alcove: Alcove) => void
  onRecolor: (alcoveId: string, color: AlcoveColor) => void
  onSetGlyph: (alcoveId: string, glyph: string) => void
  onLinkFolder: (alcove: Alcove) => void
  onUnlinkFolder: (alcoveId: string) => void
  onDelete: (alcoveId: string) => void
  desks?: DeskInfo[]
  deskId?: string
  stripHover?: boolean
  onMoveToDesk?: (alcoveId: string, deskId: string) => void
  onAlcovePointerDown?: (alcoveId: string, event: ReactPointerEvent) => void
  skipAlcoveClick?: () => boolean
  onReorder?: (dragId: string, targetId: string) => void
}

/** Same box as a strip slot: empty at rest, a wash on hover. */
const ROUNDEL =
  "flex size-[52px] items-center justify-center rounded-xl transition-colors duration-150"

const RAIL_BUTTON =
  "home-ink flex size-11 items-center justify-center rounded-lg outline-none transition-colors duration-150 hover:bg-veil-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sel"

function tileTitle(alcove: Alcove, count: number, bytes: number, heavy: boolean) {
  const parts = [`${alcove.name} · ${count}`]
  if (bytes > 0) parts.push(formatByteSize(bytes))
  if (heavy) parts.push("heaviest drawer")
  return parts.join(" · ")
}

export function ShelfRail({
  alcoves,
  countFor,
  sizeFor,
  heavyAlcoveId,
  openAlcoveId,
  onSelect,
  onSearch,
  onNewAlcove,
  onSettings,
  onEdit,
  onRecolor,
  onSetGlyph,
  onLinkFolder,
  onUnlinkFolder,
  onDelete,
  desks = [],
  deskId,
  stripHover = false,
  onMoveToDesk,
  onAlcovePointerDown,
  skipAlcoveClick,
  onReorder,
}: ShelfRailProps) {
  const inbox = alcoves.find((alcove) => alcove.isInbox)
  const rest = alcoves.filter((alcove) => !alcove.isInbox)
  const inboxCount = countFor(INBOX_ID)
  const otherDesks = desks.filter((item) => item.id !== deskId)

  return (
    <nav
      aria-label="Alcoves"
      data-alcove-strip=""
      className={cn(
        // Same layout as before: a flush column. Same paint as the strip:
        // a see-through wash, not a paper slab. No rounding, no shadow —
        // those belong to the strip because it floats.
        "flex h-full w-[72px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-dock-line bg-dock py-3 transition-colors duration-150",
        "[[data-icon-drag]_&]:bg-veil-hover",
        stripHover && "bg-sel-soft",
      )}
    >
      {inbox ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              type="button"
              data-alcove-id={inbox.id}
              title={`Inbox · ${inboxCount}`}
              aria-current={openAlcoveId === inbox.id ? "true" : undefined}
              onClick={() => onSelect(inbox.id)}
              style={tintStyle("amber")}
              className="group/tile flex w-[68px] flex-col items-center gap-1 rounded-lg py-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sel"
            >
              <span
                className={cn(
                  ROUNDEL,
                  "relative group-hover/tile:bg-veil-hover",
                  openAlcoveId === inbox.id && "bg-sel-soft ring-[1.5px] ring-sel ring-inset",
                )}
              >
                <AlcoveGlyphMark
                  glyph="inbox"
                  strokeWidth={2.5}
                  className="tint home-mark size-8"
                />
                {inboxCount > 0 ? (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sel px-1 text-[10px] leading-none font-semibold text-surface">
                    {inboxCount}
                  </span>
                ) : null}
              </span>
              <span className="flex flex-col items-center leading-tight">
                <span className="home-ink text-label">Inbox</span>
                <span className="home-ink-faint text-micro">{inboxCount}</span>
              </span>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-56">
            <ContextMenuItem onSelect={() => onEdit(inbox)}>Edit…</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ) : null}

      <span className="my-0.5 h-px w-9 bg-dock-line" />

      {rest.map((alcove, index) => {
        const active = openAlcoveId === alcove.id
        const glyph = resolveAlcoveGlyph(alcove)
        const count = countFor(alcove.id)
        const bytes = sizeFor(alcove.id)
        const above = rest[index - 1]
        const below = rest[index + 1]
        return (
          <ContextMenu key={alcove.id}>
            <ContextMenuTrigger asChild>
              <button
                type="button"
                data-alcove-id={alcove.id}
                title={tileTitle(alcove, count, bytes, heavyAlcoveId === alcove.id)}
                aria-current={active ? "true" : undefined}
                onClick={() => {
                  if (skipAlcoveClick?.()) return
                  onSelect(alcove.id)
                }}
                onPointerDown={(event) => onAlcovePointerDown?.(alcove.id, event)}
                style={tintStyle(alcove.color)}
                className="group/tile flex w-[68px] flex-col items-center gap-1 rounded-lg py-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sel"
              >
                <span
                  className={cn(
                    ROUNDEL,
                    "group-hover/tile:bg-veil-hover",
                    active && "bg-sel-soft ring-[1.5px] ring-sel ring-inset",
                  )}
                >
                  <AlcoveGlyphMark
                    glyph={glyph}
                    strokeWidth={2.5}
                    className="tint home-mark size-8"
                  />
                </span>
                <span className="flex max-w-[66px] flex-col items-center leading-tight">
                  <span className="home-ink max-w-full truncate text-label">
                    {alcove.name}
                  </span>
                  <span className="home-ink-faint text-micro">{count}</span>
                </span>
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-56">
              <ContextMenuItem onSelect={() => onEdit(alcove)}>Edit…</ContextMenuItem>
              {onReorder ? (
                <>
                  <ContextMenuItem
                    disabled={!above}
                    onSelect={() => above && onReorder(alcove.id, above.id)}
                  >
                    Move up
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={!below}
                    onSelect={() => below && onReorder(alcove.id, below.id)}
                  >
                    Move down
                  </ContextMenuItem>
                </>
              ) : null}
              <ContextMenuSub>
                <ContextMenuSubTrigger>Icon</ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-[232px] p-2">
                  <AlcoveGlyphGrid
                    value={glyph}
                    onChange={(next) => onSetGlyph(alcove.id, next)}
                  />
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSub>
                <ContextMenuSubTrigger>Color</ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  {ALCOVE_COLOR_IDS.map((color) => (
                    <ContextMenuItem
                      key={color}
                      onSelect={() => onRecolor(alcove.id, color)}
                    >
                      <span
                        aria-hidden
                        style={tintStyle(color)}
                        className="tint-dot size-2.5 rounded-full"
                      />
                      {ALCOVE_COLOR_STYLES[color].label}
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSeparator />
              {alcove.folderPath ? (
                <ContextMenuItem onSelect={() => onUnlinkFolder(alcove.id)}>
                  Stop mirroring folder
                </ContextMenuItem>
              ) : (
                <ContextMenuItem onSelect={() => onLinkFolder(alcove)}>
                  Mirror a folder…
                </ContextMenuItem>
              )}
              {otherDesks.length > 0 && onMoveToDesk ? (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>Move to</ContextMenuSubTrigger>
                    <ContextMenuSubContent>
                      {otherDesks.map((item) => (
                        <ContextMenuItem
                          key={item.id}
                          onSelect={() => onMoveToDesk(alcove.id, item.id)}
                        >
                          {item.name}
                        </ContextMenuItem>
                      ))}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                </>
              ) : null}
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                onSelect={() => onDelete(alcove.id)}
              >
                Delete Alcove
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )
      })}

      <div className="flex-1" />

      <button
        type="button"
        title="New Alcove (Ctrl+N)"
        aria-label="New Alcove"
        onClick={onNewAlcove}
        className={RAIL_BUTTON}
      >
        <Plus className="size-6" strokeWidth={2.5} />
      </button>
      <button
        type="button"
        title="Search (Ctrl+Space)"
        aria-label="Search"
        onClick={onSearch}
        className={RAIL_BUTTON}
      >
        <Search className="size-6" strokeWidth={2.5} />
      </button>
      <button
        type="button"
        title="Settings"
        aria-label="Settings"
        onClick={onSettings}
        className={RAIL_BUTTON}
      >
        <Settings className="size-6" strokeWidth={2.5} />
      </button>
    </nav>
  )
}
