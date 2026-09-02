import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { PointerEvent } from "react"
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
import { AlcoveGlyphGrid, AlcoveGlyphMark, resolveAlcoveGlyph } from "@/lib/alcove-glyphs"
import { ALCOVE_COLOR_STYLES, tintStyle } from "@/lib/colors"
import { DENSITY_CONFIG } from "@/lib/density"
import { folderIconSize, folderViewFor } from "@/lib/folder-view"
import { iconPack } from "@/lib/icon-select"
import { ALCOVE_COLOR_IDS } from "@/types"
import { cn } from "@/lib/utils"
import type { Alcove, AlcoveColor, Density, DesktopIcon, FolderView, IconGroup } from "@/types"
import { ChevronDown, ChevronUp, FolderPlus, Minimize2, Pencil, Search, Trash2, X } from "lucide-react"

type AlcoveCanvasProps = {
  alcove: Alcove
  icons: DesktopIcon[]
  allAlcoves: Alcove[]
  pinIds: string[]
  density: Density
  highlightedIconId: string | null
  selectedIds?: string[]
  onClose: () => void
  onCompact: () => void
  onEdit: () => void
  onDelete?: () => void
  onRecolor: (color: AlcoveColor) => void
  onSetGlyph: (glyph: string) => void
  onOpenIcon: (icon: DesktopIcon) => void
  onRenameIcon: (icon: DesktopIcon) => void
  onSetPinned: (iconIds: string[], pinned: boolean) => void
  onMoveIcon: (iconId: string, alcoveId: string) => void
  onNewAlcoveWith: (icons: DesktopIcon[]) => void
  onPaste?: () => void
  onDeleteIcon?: (icon: DesktopIcon) => void
  onIconPointerDown?: (icon: DesktopIcon, event: PointerEvent) => void
  onNewGroup: () => void
  onRenameGroup: (group: IconGroup) => void
  onDeleteGroup: (groupId: string) => void
  onMoveGroup: (groupId: string, delta: number) => void
  onMoveIconToGroup: (iconId: string, groupId: string | null) => void
  onFolderView?: (view: FolderView) => void
  /** Folder currently shown, when drilled below the drawer's own folder. */
  folderPath?: string | null
  onCrumb?: (path: string) => void
  onOpenFolderHere?: () => void
}

const UNGROUPED = "Everything else"

const ICON_BTN =
  "home-ink flex size-7 items-center justify-center rounded-md outline-none transition-colors duration-150 hover:bg-veil-hover focus-visible:outline-2 focus-visible:outline-sel"

const FILTER =
  "home-ink h-8 border-transparent bg-veil pr-2 pl-8 placeholder:home-ink-faint focus-visible:border-sel focus-visible:ring-sel/25 text-ui md:text-ui"

/** Group-row controls: hidden until the row is hovered or focused, then quiet. */
const GROUP_BTN =
  "home-ink-faint flex size-6 items-center justify-center rounded-md outline-none transition-colors duration-150 hover:bg-veil-hover hover:home-ink focus-visible:outline-2 focus-visible:outline-sel disabled:opacity-30 disabled:hover:bg-transparent"

/** Shared so an ungrouped Alcove keeps a stable identity across renders. */
const NO_GROUPS: IconGroup[] = []

/**
 * A drawer opened across the free desktop space: user-named rows, top to bottom,
 * with anything uncurated collected in a trailing row. Not a window — the caller
 * dismisses it on click-away.
 */
export function AlcoveCanvas({
  alcove,
  icons,
  allAlcoves,
  pinIds,
  density,
  highlightedIconId,
  selectedIds = [],
  onClose,
  onCompact,
  onEdit,
  onDelete,
  onRecolor,
  onSetGlyph,
  onOpenIcon,
  onRenameIcon,
  onSetPinned,
  onMoveIcon,
  onNewAlcoveWith,
  onPaste,
  onDeleteIcon,
  onIconPointerDown,
  onNewGroup,
  onRenameGroup,
  onDeleteGroup,
  onMoveGroup,
  onMoveIconToGroup,
  onFolderView,
  folderPath,
  onCrumb,
  onOpenFolderHere,
}: AlcoveCanvasProps) {
  const [query, setQuery] = useState("")
  const config = DENSITY_CONFIG[density]
  const groups = alcove.groups ?? NO_GROUPS
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

  const rows = useMemo(() => {
    const known = new Set(groups.map((group) => group.id))
    const byGroup = new Map<string, DesktopIcon[]>()
    const loose: DesktopIcon[] = []
    for (const icon of filtered) {
      const groupId = icon.groupId
      if (!groupId || !known.has(groupId)) {
        loose.push(icon)
        continue
      }
      const bucket = byGroup.get(groupId)
      if (bucket) bucket.push(icon)
      else byGroup.set(groupId, [icon])
    }
    return { byGroup, loose }
  }, [filtered, groups])

  const itemView = alcove.folderPath ? folderViewFor(alcove) : "icons"
  const itemSize = alcove.folderPath
    ? folderIconSize(itemView, config.icon)
    : config.icon

  const grid = (items: DesktopIcon[], empty: string) =>
    alcove.folderPath ? (
      <FolderItems
        items={items}
        view={itemView}
        iconSize={itemSize}
        highlightedIconId={highlightedIconId}
        selectedIds={selectedIds}
        empty={empty}
        onOpen={handleOpen}
        onPointerDown={onIconPointerDown}
      />
    ) : items.length === 0 ? (
      <p className="home-ink-faint px-1 py-3 text-label">{empty}</p>
    ) : (
      <div
        className="grid gap-x-1.5 gap-y-1"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${config.icon + 40}px, 1fr))` }}
      >
        {items.map((icon) => (
          <DesktopIconTile
            key={icon.id}
            icon={icon}
            size={config.icon}
            highlighted={highlightedIconId === icon.id}
            selected={selectedIds.includes(icon.id)}
            onWallpaper
            onOpen={handleOpen}
            onPointerDown={onIconPointerDown}
          />
        ))}
      </div>
    )

  return (
    <section
      data-alcove-id={alcove.id}
      aria-label={alcove.name}
      className="alcove-rise flex h-full w-full min-h-0 flex-col overflow-hidden rounded-[14px] border border-dock-line bg-dock"
    >
      <header className="flex items-center gap-2.5 px-4 pt-3 pb-2">
        <span
          style={tintStyle(alcove.color)}
          className="flex size-8 items-center justify-center rounded-[9px]"
        >
          <AlcoveGlyphMark
            glyph={resolveAlcoveGlyph(alcove)}
            className="tint home-mark size-4"
          />
        </span>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button type="button" onDoubleClick={onEdit} className="rounded-md text-left outline-none focus-visible:outline-2 focus-visible:outline-sel">
              <span className="home-ink text-title font-medium">{alcove.name}</span>
              <span className="home-ink-faint ml-2 text-ui">
                {query.trim() ? `${filtered.length}/${icons.length}` : icons.length}
              </span>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={onEdit}>Edit…</ContextMenuItem>
            {!alcove.isInbox ? (
              <ContextMenuSub>
                <ContextMenuSubTrigger>Icon</ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-[232px] p-2">
                  <AlcoveGlyphGrid value={resolveAlcoveGlyph(alcove)} onChange={onSetGlyph} />
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
            {onDelete ? (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem variant="destructive" onSelect={onDelete}>
                  Delete Alcove
                </ContextMenuItem>
              </>
            ) : null}
          </ContextMenuContent>
        </ContextMenu>
        {alcove.folderPath ? (
          <FolderCrumbs
            root={alcove.folderPath}
            path={folderPath}
            onCrumb={onCrumb}
            onOpenHere={onOpenFolderHere}
            className="min-w-0 max-w-[32rem] text-label"
          />
        ) : null}
        <button
          type="button"
          title="Edit Alcove"
          aria-label="Edit Alcove"
          onClick={onEdit}
          className={ICON_BTN}
        >
          <Pencil className="size-3.5" />
        </button>
        {onDelete ? (
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

        <div className="relative ml-auto w-56">
          <Search className="home-ink-faint pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter"
            aria-label={`Filter ${alcove.name}`}
            className={FILTER}
          />
        </div>
        {alcove.folderPath && onFolderView ? (
          <FolderViewSwitch value={itemView} onChange={onFolderView} />
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          onClick={onNewGroup}
          className="home-ink h-8 gap-1.5 px-2 hover:bg-veil-hover"
        >
          <FolderPlus className="size-4" />
          <span className="text-ui">New group</span>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title="Show as a small panel"
          aria-label="Show as a small panel"
          onClick={onCompact}
          className="home-ink size-8 hover:bg-veil-hover"
        >
          <Minimize2 className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title="Close"
          aria-label="Close"
          onClick={onClose}
          className="home-ink size-8 hover:bg-veil-hover"
        >
          <X className="size-4" />
        </Button>
      </header>

      <ContextMenu
        onOpenChange={(open) => {
          if (open) setMenuIcon(ctxIconRef.current)
          else setMenuIcon(null)
        }}
      >
        <ContextMenuTrigger asChild>
          <div
            data-drawer-scroll=""
            className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pt-1 pb-4"
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
          >
        {groups.map((group, index) => (
          <div
            key={group.id}
            data-group-row={group.id}
            data-group-owner={alcove.id}
            className="rounded-lg px-1"
          >
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div className="group/row mb-1 flex w-full items-center gap-2 border-b border-dock-line pb-1.5">
                  <button
                    type="button"
                    onDoubleClick={() => onRenameGroup(group)}
                    className="rounded text-left outline-none focus-visible:outline-2 focus-visible:outline-sel"
                  >
                    <span className="home-ink text-label font-medium tracking-[0.08em] uppercase">
                      {group.name}
                    </span>
                    <span className="home-ink-faint ml-2 text-label">
                      {rows.byGroup.get(group.id)?.length ?? 0}
                    </span>
                  </button>
                  <span className="flex-1" />
                  <span className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      title="Move up"
                      aria-label="Move group up"
                      disabled={index === 0}
                      onClick={() => onMoveGroup(group.id, -1)}
                      className={GROUP_BTN}
                    >
                      <ChevronUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Move down"
                      aria-label="Move group down"
                      disabled={index === groups.length - 1}
                      onClick={() => onMoveGroup(group.id, 1)}
                      className={GROUP_BTN}
                    >
                      <ChevronDown className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Rename group"
                      aria-label="Rename group"
                      onClick={() => onRenameGroup(group)}
                      className={GROUP_BTN}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Delete group"
                      aria-label="Delete group"
                      onClick={() => onDeleteGroup(group.id)}
                      className={cn(GROUP_BTN, "hover:text-destructive")}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => onRenameGroup(group)}>Rename group</ContextMenuItem>
                <ContextMenuItem disabled={index === 0} onSelect={() => onMoveGroup(group.id, -1)}>
                  Move up
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={index === groups.length - 1}
                  onSelect={() => onMoveGroup(group.id, 1)}
                >
                  Move down
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem variant="destructive" onSelect={() => onDeleteGroup(group.id)}>
                  Delete group
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            {grid(rows.byGroup.get(group.id) ?? [], "Drag icons here.")}
          </div>
        ))}

        <div
          data-group-row=""
          data-group-owner={alcove.id}
          className="rounded-lg px-1"
        >
          {groups.length > 0 ? (
            <div className="mb-1 flex items-center gap-2 border-b border-dock-line pb-1.5">
              <span className="home-ink-faint text-label font-medium tracking-[0.08em] uppercase">
                {UNGROUPED}
              </span>
              <span className="home-ink-faint text-label">{rows.loose.length}</span>
            </div>
          ) : null}
          {grid(
            rows.loose,
            query.trim() ? `No icons match “${query.trim()}”.` : "This Alcove is empty.",
          )}
        </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {menuIcon ? (
            <IconContextItems
              icon={menuIcon}
              pack={iconPack(menuIcon, selectedIds, icons)}
              alcoves={allAlcoves}
              pinned={pinIds.includes(menuIcon.id)}
              groups={groups}
              onOpen={onOpenIcon}
              onRename={onRenameIcon}
              onSetPinned={onSetPinned}
              onMove={onMoveIcon}
              onMoveToGroup={onMoveIconToGroup}
              onNewAlcove={onNewAlcoveWith}
              onDelete={onDeleteIcon}
            />
          ) : (
            <>
              {onPaste ? (
                <ContextMenuItem onSelect={onPaste}>Paste</ContextMenuItem>
              ) : null}
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </section>
  )
}
