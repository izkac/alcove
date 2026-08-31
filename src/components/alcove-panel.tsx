import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlcoveChip } from "@/components/alcove-chip"
import { DesktopIconTile, IconContextItems } from "@/components/desktop-icon"
import { FolderItems } from "@/components/folder-items"
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
import { ALCOVE_COLOR_STYLES } from "@/lib/colors"
import { AlcoveGlyphGrid, resolveAlcoveGlyph } from "@/lib/alcove-glyphs"
import { DENSITY_CONFIG } from "@/lib/density"
import { folderIconSize, folderViewFor } from "@/lib/folder-view"
import { folderLeaf } from "@/lib/harvest-merge"
import { iconPack } from "@/lib/icon-select"
import { cn } from "@/lib/utils"
import type { Alcove, AlcoveColor, Density, DesktopIcon, FolderView } from "@/types"
import { Inbox, Maximize2, Pencil, Search, Trash2 } from "lucide-react"
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
}

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
}: AlcovePanelProps) {
  const config = DENSITY_CONFIG[density]
  const [query, setQuery] = useState("")
  const styles = ALCOVE_COLOR_STYLES[alcove.color]
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
          className={cn(
            "flex max-h-[min(78vh,760px)] max-w-full flex-col overflow-hidden rounded-2xl border border-white/15 bg-black/55 shadow-2xl transition-opacity duration-200",
            styles.glow,
            dimmed && "opacity-25",
          )}
        >
          <header className="flex items-center gap-2 px-3 py-2">
            <span className={cn("h-5 w-1.5 rounded-full", styles.bar)} />
            <button
              type="button"
              onClick={onToggle}
              className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium text-white"
            >
              {alcove.isInbox ? <Inbox className="size-3.5 opacity-80" /> : null}
              <span className="min-w-0 truncate">
                {alcove.name}
                {alcove.folderPath ? (
                  <span className="ml-1.5 font-normal text-white/45">
                    {folderLeaf(alcove.folderPath)}
                  </span>
                ) : null}
              </span>
              <span className="text-xs font-normal text-white/60">
                {query.trim()
                  ? `${filtered.length}/${icons.length}`
                  : icons.length}
              </span>
            </button>
            <button
              type="button"
              title="Edit Alcove"
              onClick={onEdit}
              className="flex size-7 items-center justify-center rounded-lg text-white/55 transition hover:bg-white/10 hover:text-white"
            >
              <Pencil className="size-3.5" />
            </button>
            {!alcove.isInbox ? (
              <button
                type="button"
                title="Delete Alcove"
                onClick={onDelete}
                className="flex size-7 items-center justify-center rounded-lg text-white/55 transition hover:bg-white/10 hover:text-red-300"
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
                onClick={onExpandCanvas}
                className="flex size-7 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                <Maximize2 className="size-3.5" />
              </button>
            ) : null}
          </header>
          {emptyInbox ? null : (
            <div className="relative px-3 pb-2">
              <Search className="pointer-events-none absolute top-1/2 left-5 size-3.5 -translate-y-1/2 text-white/45" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter icons…"
                aria-label={`Filter ${alcove.name}`}
                className="h-8 border-white/15 bg-white/10 pr-2 pl-8 text-white placeholder:text-white/40 md:text-xs dark:bg-white/10"
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
              <div className="col-span-full flex flex-col items-center justify-center gap-2 px-4 py-6 text-center">
                <p className="text-sm font-medium text-white">Inbox is clear</p>
                <p className="text-xs text-white/70">
                  New files from the desktop land here until you place them.
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
              <div className="col-span-full px-4 py-8 text-center text-sm text-white/70">
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
