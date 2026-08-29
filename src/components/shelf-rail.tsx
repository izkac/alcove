import { Badge } from "@/components/ui/badge"
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
import { ALCOVE_COLOR_STYLES } from "@/lib/colors"
import { INBOX_ID } from "@/data/sample"
import { cn } from "@/lib/utils"
import type { Alcove, AlcoveColor } from "@/types"
import { Inbox, Plus, Search, Settings } from "lucide-react"

type ShelfRailProps = {
  alcoves: Alcove[]
  countFor: (alcoveId: string) => number
  openAlcoveId: string | null
  onSelect: (alcoveId: string) => void
  onSearch: () => void
  onNewAlcove: () => void
  onSettings: () => void
  onRename: (alcove: Alcove) => void
  onRecolor: (alcoveId: string, color: AlcoveColor) => void
  onSetGlyph: (alcoveId: string, glyph: string) => void
  onLinkFolder: (alcove: Alcove) => void
  onUnlinkFolder: (alcoveId: string) => void
  onDelete: (alcoveId: string) => void
}

export function ShelfRail({
  alcoves,
  countFor,
  openAlcoveId,
  onSelect,
  onSearch,
  onNewAlcove,
  onSettings,
  onRename,
  onRecolor,
  onSetGlyph,
  onLinkFolder,
  onUnlinkFolder,
  onDelete,
}: ShelfRailProps) {
  const inbox = alcoves.find((alcove) => alcove.isInbox)
  const rest = alcoves.filter((alcove) => !alcove.isInbox)
  const inboxCount = countFor(INBOX_ID)

  return (
    <div className="flex h-full w-[76px] shrink-0 flex-col items-center gap-2.5 overflow-y-auto border-r border-white/15 bg-black/55 py-3 shadow-2xl backdrop-blur-2xl">
      {inbox ? (
        <button
          type="button"
          data-alcove-id={inbox.id}
          title={`Inbox · ${inboxCount}`}
          onClick={() => onSelect(inbox.id)}
          className={cn(
            "relative flex size-[52px] items-center justify-center rounded-[14px] border-[1.5px] border-dashed border-amber-300/60 bg-amber-400/10 text-amber-200 transition hover:bg-amber-400/20",
            openAlcoveId === inbox.id && "border-solid bg-amber-400/25",
          )}
        >
          <Inbox className="size-6" strokeWidth={1.75} />
          {inboxCount > 0 ? (
            <Badge className="absolute -top-1.5 -right-1.5 h-[18px] min-w-[18px] px-1 bg-amber-400 text-[10px] font-bold text-amber-950">
              {inboxCount}
            </Badge>
          ) : null}
        </button>
      ) : null}

      <span className="h-px w-11 bg-white/15" />

      {rest.map((alcove) => {
        const styles = ALCOVE_COLOR_STYLES[alcove.color]
        const active = openAlcoveId === alcove.id
        const glyph = resolveAlcoveGlyph(alcove)
        return (
          <ContextMenu key={alcove.id}>
            <ContextMenuTrigger asChild>
              <button
                type="button"
                data-alcove-id={alcove.id}
                title={alcove.name}
                onClick={() => onSelect(alcove.id)}
                className="flex flex-col items-center gap-0.5"
              >
                <span
                  className={cn(
                    "flex size-[52px] items-center justify-center rounded-[14px] ring-1 transition hover:brightness-125",
                    styles.chip,
                    active && "ring-2 bg-white/20",
                  )}
                >
                  <AlcoveGlyphMark glyph={glyph} className="size-6" />
                </span>
                <span className="max-w-[68px] truncate text-[9px] text-white/60">
                  {alcove.name} · {countFor(alcove.id)}
                </span>
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-56">
              <ContextMenuItem onSelect={() => onRename(alcove)}>Rename</ContextMenuItem>
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
        onClick={onNewAlcove}
        className="flex size-11 items-center justify-center rounded-xl text-white/75 transition hover:bg-white/10"
      >
        <Plus className="size-[18px]" />
      </button>
      <button
        type="button"
        title="Search (Ctrl+F)"
        onClick={onSearch}
        className="flex size-11 items-center justify-center rounded-xl text-white/75 transition hover:bg-white/10"
      >
        <Search className="size-[18px]" />
      </button>
      <button
        type="button"
        title="Settings"
        onClick={onSettings}
        className="flex size-11 items-center justify-center rounded-xl text-white/75 transition hover:bg-white/10"
      >
        <Settings className="size-[18px]" />
      </button>
    </div>
  )
}
