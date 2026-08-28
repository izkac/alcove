import { AlcoveChip } from "@/components/alcove-chip"
import { DesktopIconTile } from "@/components/desktop-icon"
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
import { ALCOVE_COLOR_IDS } from "@/types"
import { ALCOVE_COLOR_STYLES } from "@/lib/colors"
import { DENSITY_CONFIG, pageSize } from "@/lib/density"
import { cn } from "@/lib/utils"
import type { Alcove, AlcoveColor, Density, DesktopIcon } from "@/types"
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react"
import type { PointerEvent } from "react"

type AlcovePanelProps = {
  alcove: Alcove
  icons: DesktopIcon[]
  allAlcoves: Alcove[]
  pinIds: string[]
  density: Density
  highlightedIconId: string | null
  dimmed?: boolean
  onToggle: () => void
  onPage: (page: number) => void
  onRename: () => void
  onRecolor: (color: AlcoveColor) => void
  onDelete: () => void
  onOpenIcon: (icon: DesktopIcon) => void
  onRenameIcon: (icon: DesktopIcon) => void
  onTogglePin: (iconId: string) => void
  onMoveIcon: (iconId: string, alcoveId: string) => void
  onNewAlcoveWith: (icon: DesktopIcon) => void
  onFocus: () => void
  onDropIncoming?: () => void
  onIconPointerDown?: (icon: DesktopIcon, event: PointerEvent) => void
  draggingIconId?: string | null
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
  dimmed,
  onToggle,
  onPage,
  onRename,
  onRecolor,
  onDelete,
  onOpenIcon,
  onRenameIcon,
  onTogglePin,
  onMoveIcon,
  onNewAlcoveWith,
  onFocus,
  onDropIncoming,
  onIconPointerDown,
  draggingIconId,
}: AlcovePanelProps) {
  const config = DENSITY_CONFIG[density]
  const size = pageSize(density)
  const pageCount = Math.max(1, Math.ceil(icons.length / size))
  const page = Math.min(alcove.page, pageCount - 1)
  const visible = icons.slice(page * size, page * size + size)
  const styles = ALCOVE_COLOR_STYLES[alcove.color]
  const emptyInbox = alcove.isInbox && icons.length === 0

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <section
          data-alcove-id={alcove.id}
          onPointerDown={onFocus}
          style={{ width: config.panel }}
          className={cn(
            "flex max-w-full flex-col overflow-hidden rounded-2xl border border-white/15 bg-white/10 shadow-2xl backdrop-blur-2xl transition-opacity duration-200",
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
              <span className="truncate">{alcove.name}</span>
              <span className="text-xs font-normal text-white/60">{icons.length}</span>
            </button>
            {pageCount > 1 ? (
              <div className="flex items-center gap-0.5">
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="text-white hover:bg-white/10"
                  disabled={page === 0}
                  onClick={() => onPage(page - 1)}
                >
                  <ChevronLeft />
                </Button>
                <span className="text-[10px] text-white/70">
                  {page + 1}/{pageCount}
                </span>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="text-white hover:bg-white/10"
                  disabled={page >= pageCount - 1}
                  onClick={() => onPage(page + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            ) : null}
          </header>
          <div
            className="grid px-2 pb-3"
            style={{
              gridTemplateColumns: `repeat(${config.cols}, minmax(0, 1fr))`,
              minHeight: emptyInbox ? 120 : config.rows * (config.icon + 36),
            }}
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
            ) : (
              visible.map((icon) => (
                <DesktopIconTile
                  key={icon.id}
                  icon={icon}
                  size={config.icon}
                  highlighted={highlightedIconId === icon.id}
                  dimmed={draggingIconId === icon.id}
                  alcoves={allAlcoves}
                  pinned={pinIds.includes(icon.id)}
                  onOpen={() => onOpenIcon(icon)}
                  onRename={() => onRenameIcon(icon)}
                  onTogglePin={() => onTogglePin(icon.id)}
                  onMove={(alcoveId) => onMoveIcon(icon.id, alcoveId)}
                  onNewAlcove={() => onNewAlcoveWith(icon)}
                  onPointerDown={onIconPointerDown}
                />
              ))
            )}
          </div>
          {pageCount > 1 ? (
            <div className="flex justify-center gap-1 pb-2">
              {Array.from({ length: pageCount }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={`Page ${index + 1}`}
                  onClick={() => onPage(index)}
                  className={cn(
                    "size-1.5 rounded-full",
                    index === page ? "bg-white" : "bg-white/35",
                  )}
                />
              ))}
            </div>
          ) : null}
        </section>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onToggle}>Collapse to chip</ContextMenuItem>
        <ContextMenuItem onSelect={onRename}>Rename</ContextMenuItem>
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
      </ContextMenuContent>
    </ContextMenu>
  )
}
