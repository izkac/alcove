import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { PointerEvent } from "react"
import { DesktopIconTile, IconContextItems } from "@/components/desktop-icon"
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
import { ALCOVE_COLOR_STYLES } from "@/lib/colors"
import { DENSITY_CONFIG } from "@/lib/density"
import { ALCOVE_COLOR_IDS } from "@/types"
import { cn } from "@/lib/utils"
import type { Alcove, AlcoveColor, Density, DesktopIcon, IconGroup } from "@/types"
import { ChevronDown, ChevronUp, FolderPlus, Minimize2, Search, X } from "lucide-react"

type AlcoveCanvasProps = {
  alcove: Alcove
  icons: DesktopIcon[]
  allAlcoves: Alcove[]
  pinIds: string[]
  density: Density
  highlightedIconId: string | null
  onClose: () => void
  onCompact: () => void
  onRename: () => void
  onRecolor: (color: AlcoveColor) => void
  onSetGlyph: (glyph: string) => void
  onOpenIcon: (icon: DesktopIcon) => void
  onRenameIcon: (icon: DesktopIcon) => void
  onTogglePin: (iconId: string) => void
  onMoveIcon: (iconId: string, alcoveId: string) => void
  onNewAlcoveWith: (icon: DesktopIcon) => void
  onIconPointerDown?: (icon: DesktopIcon, event: PointerEvent) => void
  onNewGroup: () => void
  onRenameGroup: (group: IconGroup) => void
  onDeleteGroup: (groupId: string) => void
  onMoveGroup: (groupId: string, delta: number) => void
  onMoveIconToGroup: (iconId: string, groupId: string | null) => void
}

const UNGROUPED = "Everything else"

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
  onClose,
  onCompact,
  onRename,
  onRecolor,
  onSetGlyph,
  onOpenIcon,
  onRenameIcon,
  onTogglePin,
  onMoveIcon,
  onNewAlcoveWith,
  onIconPointerDown,
  onNewGroup,
  onRenameGroup,
  onDeleteGroup,
  onMoveGroup,
  onMoveIconToGroup,
}: AlcoveCanvasProps) {
  const [query, setQuery] = useState("")
  const config = DENSITY_CONFIG[density]
  const styles = ALCOVE_COLOR_STYLES[alcove.color]
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

  const grid = (items: DesktopIcon[], empty: string) =>
    items.length === 0 ? (
      <p className="px-1 py-3 text-xs text-white/40">{empty}</p>
    ) : (
      <div
        className="grid gap-x-1 gap-y-2"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${config.icon + 34}px, 1fr))` }}
      >
        {items.map((icon) => (
          <DesktopIconTile
            key={icon.id}
            icon={icon}
            size={config.icon}
            highlighted={highlightedIconId === icon.id}
            onOpen={handleOpen}
            onPointerDown={onIconPointerDown}
          />
        ))}
      </div>
    )

  return (
    <section
      data-alcove-id={alcove.id}
      className={cn(
        "flex h-full w-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/15 bg-black/55 shadow-2xl",
        styles.glow,
      )}
    >
      <header className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span className={cn("flex size-8 items-center justify-center rounded-lg ring-1", styles.chip)}>
          <AlcoveGlyphMark glyph={resolveAlcoveGlyph(alcove)} className="size-4" />
        </span>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button type="button" onDoubleClick={onRename} className="text-left">
              <span className="text-base font-medium text-white">{alcove.name}</span>
              <span className="ml-2 text-xs text-white/55">
                {query.trim() ? `${filtered.length}/${icons.length}` : icons.length}
              </span>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={onRename}>Rename</ContextMenuItem>
            <ContextMenuSub>
              <ContextMenuSubTrigger>Icon</ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-[232px] p-2">
                <AlcoveGlyphGrid value={resolveAlcoveGlyph(alcove)} onChange={onSetGlyph} />
              </ContextMenuSubContent>
            </ContextMenuSub>
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
          </ContextMenuContent>
        </ContextMenu>

        <div className="relative ml-auto w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-white/45" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter…"
            aria-label={`Filter ${alcove.name}`}
            className="h-8 border-white/15 bg-white/10 pr-2 pl-8 text-white placeholder:text-white/40 md:text-xs dark:bg-white/10"
          />
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onNewGroup}
          className="h-8 gap-1.5 px-2 text-white/75 hover:bg-white/10 hover:text-white"
        >
          <FolderPlus className="size-4" />
          <span className="text-xs">New group</span>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title="Show as a small panel"
          onClick={onCompact}
          className="size-8 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <Minimize2 className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title="Close"
          onClick={onClose}
          className="size-8 text-white/70 hover:bg-white/10 hover:text-white"
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
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-1 pb-4"
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
            className="rounded-xl px-1"
          >
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  onDoubleClick={() => onRenameGroup(group)}
                  className="mb-1.5 flex w-full items-center gap-2 text-left"
                >
                  <span className={cn("h-3.5 w-1 rounded-full", styles.bar)} />
                  <span className="text-xs font-medium tracking-wide text-white/90 uppercase">
                    {group.name}
                  </span>
                  <span className="text-[11px] text-white/45">
                    {rows.byGroup.get(group.id)?.length ?? 0}
                  </span>
                  <span className="ml-2 h-px flex-1 bg-white/10" />
                  <span className="flex items-center gap-0.5 text-white/40">
                    <ChevronUp
                      className={cn("size-3.5", index === 0 && "opacity-25")}
                      onClick={(event) => {
                        event.stopPropagation()
                        onMoveGroup(group.id, -1)
                      }}
                    />
                    <ChevronDown
                      className={cn("size-3.5", index === groups.length - 1 && "opacity-25")}
                      onClick={(event) => {
                        event.stopPropagation()
                        onMoveGroup(group.id, 1)
                      }}
                    />
                  </span>
                </button>
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
          className="rounded-xl px-1"
        >
          {groups.length > 0 ? (
            <div className="mb-1.5 flex items-center gap-2">
              <span className="h-3.5 w-1 rounded-full bg-white/25" />
              <span className="text-xs font-medium tracking-wide text-white/60 uppercase">
                {UNGROUPED}
              </span>
              <span className="text-[11px] text-white/40">{rows.loose.length}</span>
              <span className="ml-2 h-px flex-1 bg-white/10" />
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
              alcoves={allAlcoves}
              pinned={pinIds.includes(menuIcon.id)}
              groups={groups}
              onOpen={onOpenIcon}
              onRename={onRenameIcon}
              onTogglePin={onTogglePin}
              onMove={onMoveIcon}
              onMoveToGroup={onMoveIconToGroup}
              onNewAlcove={onNewAlcoveWith}
            />
          ) : null}
        </ContextMenuContent>
      </ContextMenu>
    </section>
  )
}
