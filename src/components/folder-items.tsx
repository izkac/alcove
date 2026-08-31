import { useMemo, useState } from "react"
import type { PointerEvent } from "react"
import { DesktopIconTile } from "@/components/desktop-icon"
import { IconGlyph } from "@/components/icon-glyph"
import {
  DEFAULT_FOLDER_SORT,
  fileTypeLabel,
  formatByteSize,
  formatModifiedAt,
  sortFolderItems,
  toggleFolderSort,
} from "@/lib/folder-view"
import type { FolderSortColumn } from "@/lib/folder-view"
import { cn } from "@/lib/utils"
import type { DesktopIcon, FolderView } from "@/types"
import { ChevronDown, ChevronUp } from "lucide-react"

const DETAIL_GRID =
  "grid-cols-[minmax(8rem,1fr)_4.5rem_5.5rem_10.5rem] gap-3"

const DETAIL_COLUMNS: { id: FolderSortColumn; label: string; align: "left" | "right" }[] = [
  { id: "name", label: "Name", align: "left" },
  { id: "type", label: "Type", align: "left" },
  { id: "size", label: "Size", align: "right" },
  { id: "modified", label: "Date modified", align: "right" },
]

type FolderItemsProps = {
  items: DesktopIcon[]
  view: FolderView
  iconSize: number
  highlightedIconId: string | null
  selectedIds?: string[]
  empty: string
  onOpen: (icon: DesktopIcon) => void
  onPointerDown?: (icon: DesktopIcon, event: PointerEvent) => void
}

export function FolderItems({
  items,
  view,
  iconSize,
  highlightedIconId,
  selectedIds = [],
  empty,
  onOpen,
  onPointerDown,
}: FolderItemsProps) {
  if (items.length === 0) {
    return <p className="px-1 py-3 text-xs text-white/40">{empty}</p>
  }
  if (view === "list") {
    return (
      <ListRows
        items={items}
        iconSize={iconSize}
        highlightedIconId={highlightedIconId}
        selectedIds={selectedIds}
        onOpen={onOpen}
        onPointerDown={onPointerDown}
      />
    )
  }
  if (view === "details") {
    return (
      <DetailRows
        items={items}
        iconSize={iconSize}
        highlightedIconId={highlightedIconId}
        selectedIds={selectedIds}
        onOpen={onOpen}
        onPointerDown={onPointerDown}
      />
    )
  }
  return (
    <div
      className="grid gap-x-1 gap-y-2"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${iconSize + 34}px, 1fr))`,
      }}
    >
      {items.map((icon) => (
        <DesktopIconTile
          key={icon.id}
          icon={icon}
          size={iconSize}
          highlighted={highlightedIconId === icon.id || selectedIds.includes(icon.id)}
          onOpen={onOpen}
          onPointerDown={onPointerDown}
        />
      ))}
    </div>
  )
}

type RowProps = Omit<FolderItemsProps, "view" | "empty">

function ListRows({
  items,
  iconSize,
  highlightedIconId,
  selectedIds = [],
  onOpen,
  onPointerDown,
}: RowProps) {
  return (
    <div
      className="grid gap-x-2"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
    >
      {items.map((icon) => (
        <FolderRow
          key={icon.id}
          icon={icon}
          iconSize={iconSize}
          highlighted={highlightedIconId === icon.id || selectedIds.includes(icon.id)}
          onOpen={onOpen}
          onPointerDown={onPointerDown}
        />
      ))}
    </div>
  )
}

function DetailRows({
  items,
  iconSize,
  highlightedIconId,
  selectedIds = [],
  onOpen,
  onPointerDown,
}: RowProps) {
  const [sort, setSort] = useState(DEFAULT_FOLDER_SORT)
  const ordered = useMemo(() => sortFolderItems(items, sort), [items, sort])

  return (
    <div className="min-w-0">
      <div
        className={cn(
          "sticky top-0 z-10 mb-1 grid bg-black/70 px-2 py-1 backdrop-blur-sm",
          DETAIL_GRID,
        )}
      >
        {DETAIL_COLUMNS.map((column) => {
          const active = sort.column === column.id
          const Arrow = sort.dir === "asc" ? ChevronUp : ChevronDown
          return (
            <button
              key={column.id}
              type="button"
              onClick={() => setSort((current) => toggleFolderSort(current, column.id))}
              aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
              className={cn(
                "flex items-center gap-0.5 text-[10px] tracking-wide uppercase",
                column.align === "right" ? "justify-end" : "justify-start",
                active ? "text-white/80" : "text-white/40 hover:text-white/70",
              )}
            >
              {column.label}
              {active ? <Arrow className="size-3" /> : null}
            </button>
          )
        })}
      </div>
      {ordered.map((icon) => (
        <button
          key={icon.id}
          type="button"
          data-desktop-icon={icon.id}
          title={icon.name}
          onPointerDown={(event) => onPointerDown?.(icon, event)}
          onDoubleClick={(event) => {
            event.stopPropagation()
            onOpen(icon)
          }}
          className={cn(
            "grid w-full min-w-0 items-center rounded-md px-2 py-1 text-left text-white/95 outline-none",
            DETAIL_GRID,
            "hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/50",
            highlightedIconId === icon.id || selectedIds.includes(icon.id)
              ? "bg-sky-400/25 ring-2 ring-sky-300"
              : undefined,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <IconGlyph icon={icon} size={iconSize} className="shrink-0 rounded-sm" />
            <span className="truncate text-[12px] leading-tight">{icon.name}</span>
          </span>
          <span className="truncate text-[11px] text-white/50">{fileTypeLabel(icon)}</span>
          <span className="truncate text-right text-[11px] tabular-nums text-white/50">
            {icon.kind === "folder" ? "—" : formatByteSize(icon.byteSize)}
          </span>
          <span className="truncate text-right text-[11px] tabular-nums text-white/50">
            {formatModifiedAt(icon.modifiedAt)}
          </span>
        </button>
      ))}
    </div>
  )
}

function FolderRow({
  icon,
  iconSize,
  highlighted,
  onOpen,
  onPointerDown,
}: {
  icon: DesktopIcon
  iconSize: number
  highlighted: boolean
  onOpen: (icon: DesktopIcon) => void
  onPointerDown?: (icon: DesktopIcon, event: PointerEvent) => void
}) {
  return (
    <button
      type="button"
      data-desktop-icon={icon.id}
      title={icon.name}
      onPointerDown={(event) => onPointerDown?.(icon, event)}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onOpen(icon)
      }}
      className={cn(
        "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-white/95 outline-none",
        "hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/50",
        highlighted && "bg-sky-400/25 ring-2 ring-sky-300",
      )}
    >
      <IconGlyph icon={icon} size={iconSize} className="shrink-0 rounded-sm" />
      <span className="truncate text-[12px] leading-tight">{icon.name}</span>
    </button>
  )
}
