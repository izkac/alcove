import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlcoveChip } from "@/components/alcove-chip"
import { DesktopIconTile, IconContextItems } from "@/components/desktop-icon"
import { FolderItems } from "@/components/folder-items"
import { FolderCrumbs } from "@/components/folder-crumbs"
import { FolderViewSwitch } from "@/components/folder-view-switch"
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ALCOVE_COLOR_IDS } from "@/types"
import { ALCOVE_COLOR_STYLES, tintStyle } from "@/lib/colors"
import { AlcoveGlyphGrid, AlcoveGlyphMark, resolveAlcoveGlyph } from "@/lib/alcove-glyphs"
import { DENSITY_CONFIG } from "@/lib/density"
import { folderIconSize, folderViewFor } from "@/lib/folder-view"
import { iconPack } from "@/lib/icon-select"
import { cn } from "@/lib/utils"
import type { Alcove, AlcoveColor, Density, DesktopIcon, FolderView } from "@/types"
import { Maximize2, Pencil, Search, Trash2 } from "lucide-react"
import type { PointerEvent } from "react"

type AlcovePanelProps = {
  alcove: Alcove
  icons: DesktopIcon[]
  allAlcoves: Alcove[]
  pinIds: string[]
  density: Density
  highlightedIconId: string | null
  selectedIds?: string[]
  dimmed?: boolean
  onToggle: () => void
  onEdit: () => void
  onRecolor: (color: AlcoveColor) => void
  onSetGlyph: (glyph: string) => void
  onDelete: () => void
  onOpenIcon: (icon: DesktopIcon) => void
  onRenameIcon: (icon: DesktopIcon) => void
  onSetPinned: (iconIds: string[], pinned: boolean) => void
  onMoveIcon: (iconId: string, alcoveId: string) => void
  onNewAlcoveWith: (icons: DesktopIcon[]) => void
  onFocus: () => void
  onDropIncoming?: () => void
  onPaste?: () => void
  onDeleteIcon?: (icon: DesktopIcon) => void
  onIconPointerDown?: (icon: DesktopIcon, event: PointerEvent) => void
  onExpandCanvas?: () => void
  onFolderView?: (view: FolderView) => void
  /** Folder currently shown, when drilled below the drawer's own folder. */
  folderPath?: string | null
  onCrumb?: (path: string) => void
  onOpenFolderHere?: () => void
}

const ICON_BTN =
  "flex size-7 items-center justify-center rounded-md text-ink-muted outline-none transition-colors duration-150 hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-sel"

const FILTER =
  "h-8 border-transparent bg-surface-2 pr-2 pl-8 text-ink placeholder:text-ink-faint focus-visible:border-sel focus-visible:ring-sel/25 text-ui md:text-ui"

export function AlcovePanel(props: AlcovePanelProps) {
  const { alcove, icons, dimmed, onToggle, onFocus } = props

  if (alcove.collapsed) {
    return (
      <div
        data-alcove-id={alcove.id}
        onPointerDown={onFocus}
        className="transition-opacity duration-200"
      >
        <AlcoveChip
          alcove={alcove}
          icons={icons}
          dimmed={dimmed}
          onExpand={onToggle}
          onDragOverAlcove={() => undefined}
        />
      </div>
    )
  }

  return <ExpandedAlcove {...props} />
}

function ExpandedAlcove({
  alcove,
  icons,
  allAlcoves,
  pinIds,
  density,
  highlightedIconId,
  selectedIds = [],
  dimmed,
  onToggle,
  onEdit,
  onRecolor,
  onSetGlyph,
  onDelete,
  onOpenIcon,
  onRenameIcon,
  onSetPinned,
  onMoveIcon,
  onNewAlcoveWith,
  onFocus,
  onDropIncoming,
  onPaste,
  onDeleteIcon,
  onIconPointerDown,
  onExpandCanvas,
  onFolderView,
  folderPath,
  onCrumb,
  onOpenFolderHere,
}: AlcovePanelProps) {
  const config = DENSITY_CONFIG[density]
  const [query, setQuery] = useState("")
  const emptyInbox = alcove.isInbox && icons.length === 0
  const itemView = alcove.folderPath ? folderViewFor(alcove) : "icons"
  const itemSize = alcove.folderPath
    ? folderIconSize(itemView, config.icon)
    : config.icon
  const ctxIconRef = useRef<DesktopIcon | null>(null)
  const [menuIcon, setMenuIcon] = useState<DesktopIcon | null>(null)
  const openRef = useRef(onOpenIcon)
  const handleOpen = useCallback((icon: DesktopIcon) => {
    openRef.current(icon)
  }, [])
  useEffect(() => {
    openRef.current = onOpenIcon
  }, [onOpenIcon])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return icons
    return icons.filter((icon) => icon.name.toLowerCase().includes(needle))
  }, [icons, query])
  const rowHeight = config.icon + 36
  const gridMaxHeight = config.rows * rowHeight

  useEffect(() => {
    if (!highlightedIconId) return
    const node = document.querySelector(
      `[data-desktop-icon="${CSS.escape(highlightedIconId)}"]`,
    )
    node?.scrollIntoView({ block: "nearest" })
  }, [highlightedIconId])

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) setMenuIcon(ctxIconRef.current)
        else setMenuIcon(null)
      }}
    >
      <ContextMenuTrigger asChild>
        <section
          data-alcove-id={alcove.id}
          onPointerDown={onFocus}
          onContextMenuCapture={(event) => {
            const node = event.target
            if (!(node instanceof Element)) {
              ctxIconRef.current = null
              return
            }
            const host = node.closest("[data-desktop-icon]")
            const id = host instanceof HTMLElement ? host.dataset.desktopIcon : undefined
            ctxIconRef.current = id
              ? (filtered.find((icon) => icon.id === id) ?? null)
              : null
          }}
          style={{
            width:
              alcove.folderPath && itemView === "details"
                ? Math.max(config.panel, 900)
                : alcove.folderPath && itemView === "list"
                  ? Math.max(config.panel, 720)
                  : config.panel,
          }}
          aria-label={alcove.name}
          className={cn(
            "alcove-rise flex max-h-[min(78vh,760px)] max-w-full flex-col overflow-hidden rounded-[14px] border border-hairline bg-desk text-ink shadow-sheet transition-opacity duration-200",
            dimmed && "opacity-25",
          )}
        >
          <header className="flex items-center gap-2.5 px-3 pt-2.5 pb-2">
            <span
              style={tintStyle(alcove.isInbox ? "amber" : alcove.color)}
              className="flex size-7 items-center justify-center rounded-lg bg-surface-2"
            >
              <AlcoveGlyphMark glyph={resolveAlcoveGlyph(alcove)} className="tint size-4" />
            </span>
            <button
              type="button"
              onClick={onToggle}
              className="flex min-w-0 items-center gap-2 rounded-md text-left text-title font-medium text-ink outline-none focus-visible:outline-2 focus-visible:outline-sel"
            >
              <span className="min-w-0 truncate">{alcove.name}</span>
              <span className="text-meta font-normal text-ink-muted">
                {query.trim()
                  ? `${filtered.length}/${icons.length}`
                  : icons.length}
              </span>
            </button>
            {alcove.folderPath ? (
              <FolderCrumbs
                root={alcove.folderPath}
                path={folderPath}
                onCrumb={onCrumb}
                onOpenHere={onOpenFolderHere}
                className="min-w-0 flex-1 text-meta"
              />
            ) : (
              <span className="flex-1" />
            )}
            <button
              type="button"
              title="Edit Alcove"
              aria-label="Edit Alcove"
              onClick={onEdit}
              className={ICON_BTN}
            >
              <Pencil className="size-3.5" />
            </button>
            {!alcove.isInbox ? (
              <button
                type="button"
                title="Delete Alcove"
                aria-label="Delete Alcove"
                onClick={onDelete}
                className={cn(ICON_BTN, "hover:text-destructive")}
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
            {alcove.folderPath && onFolderView ? (
              <FolderViewSwitch value={itemView} onChange={onFolderView} />
            ) : null}
            {onExpandCanvas ? (
              <button
                type="button"
                title="Spread across the desktop"
                aria-label="Spread across the desktop"
                onClick={onExpandCanvas}
                className={ICON_BTN}
              >
                <Maximize2 className="size-3.5" />
              </button>
            ) : null}
          </header>
          {emptyInbox ? null : (
            <div className="relative px-3 pb-2">
              <Search className="pointer-events-none absolute top-1/2 left-5 size-3.5 -translate-y-1/2 text-ink-faint" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter"
                aria-label={`Filter ${alcove.name}`}
                className={FILTER}
              />
            </div>
          )}
          <div
            className={
              alcove.folderPath
                ? "min-h-0 overflow-y-auto px-2 pb-3"
                : "grid overflow-y-auto px-2 pb-3"
            }
            style={
              alcove.folderPath
                ? {
                    minHeight: 120,
                    maxHeight: itemView === "icons" || itemView === "large"
                      ? gridMaxHeight
                      : Math.max(gridMaxHeight, 420),
                  }
                : {
                    gridTemplateColumns: `repeat(${config.cols}, minmax(0, 1fr))`,
                    minHeight: emptyInbox ? 120 : Math.min(filtered.length, config.cols) > 0 ? rowHeight : 120,
                    maxHeight: emptyInbox ? undefined : gridMaxHeight,
                  }
            }
          >
            {emptyInbox ? (
              <div className="col-span-full flex flex-col items-center justify-center gap-1.5 px-4 py-6 text-center">
                <p className="text-ui font-medium text-ink">Inbox is clear</p>
                <p className="max-w-[26ch] text-meta text-ink-muted">
                  New files on the Desktop land here until you file them.
                </p>
                {onDropIncoming ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-1"
                    onClick={onDropIncoming}
                  >
                    Drop a sample file
                  </Button>
                ) : null}
              </div>
            ) : filtered.length === 0 ? (
              <div className="col-span-full px-4 py-8 text-center text-ui text-ink-muted">
                No icons match “{query.trim()}”.
              </div>
            ) : alcove.folderPath ? (
              <FolderItems
                items={filtered}
                view={itemView}
                iconSize={itemSize}
                highlightedIconId={highlightedIconId}
                selectedIds={selectedIds}
                empty={`No icons match “${query.trim()}”.`}
                onOpen={handleOpen}
                onPointerDown={onIconPointerDown}
              />
            ) : (
              filtered.map((icon) => (
                <DesktopIconTile
                  key={icon.id}
                  icon={icon}
                  size={config.icon}
                  highlighted={highlightedIconId === icon.id}
                  selected={selectedIds.includes(icon.id)}
                  onOpen={handleOpen}
                  onPointerDown={onIconPointerDown}
                />
              ))
            )}
          </div>
        </section>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {menuIcon ? (
          <IconContextItems
            icon={menuIcon}
            pack={iconPack(menuIcon, selectedIds, icons)}
            alcoves={allAlcoves}
            pinned={pinIds.includes(menuIcon.id)}
            onOpen={onOpenIcon}
            onRename={onRenameIcon}
            onSetPinned={onSetPinned}
            onMove={onMoveIcon}
            onNewAlcove={onNewAlcoveWith}
            onDelete={onDeleteIcon}
          />
        ) : (
          <>
            <ContextMenuItem onSelect={onToggle}>Collapse to chip</ContextMenuItem>
            {onPaste ? (
              <ContextMenuItem onSelect={onPaste}>Paste</ContextMenuItem>
            ) : null}
            <ContextMenuItem onSelect={onEdit}>Edit…</ContextMenuItem>
            {!alcove.isInbox ? (
              <ContextMenuSub>
                <ContextMenuSubTrigger>Icon</ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-[232px] p-2">
                  <AlcoveGlyphGrid
                    value={resolveAlcoveGlyph(alcove)}
                    onChange={onSetGlyph}
                  />
                </ContextMenuSubContent>
              </ContextMenuSub>
            ) : null}
            <ContextMenuSub>
              <ContextMenuSubTrigger>Color</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {ALCOVE_COLOR_IDS.map((color) => (
                  <ContextMenuItem key={color} onSelect={() => onRecolor(color)}>
                    <span aria-hidden style={tintStyle(color)} className="tint-dot size-2.5 rounded-full" />
                    {ALCOVE_COLOR_STYLES[color].label}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
            {!alcove.isInbox ? (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem variant="destructive" onSelect={onDelete}>
                  Delete Alcove
                </ContextMenuItem>
              </>
            ) : null}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
