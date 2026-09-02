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
    return <p className="px-1 py-3 text-label text-ink-faint">{empty}</p>
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
      className="grid gap-x-1.5 gap-y-1"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${iconSize + 40}px, 1fr))`,
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
          "sticky top-0 z-10 mb-1 grid border-b border-hairline bg-surface px-2 py-1.5",
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
                "flex items-center gap-0.5 rounded text-label font-medium tracking-[0.06em] uppercase outline-none focus-visible:outline-2 focus-visible:outline-sel",
                column.align === "right" ? "justify-end" : "justify-start",
                active ? "text-ink-muted" : "text-ink-faint hover:text-ink-muted",
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
            "grid w-full min-w-0 items-center rounded-md px-2 py-1 text-left text-ink outline-none transition-colors duration-150",
            DETAIL_GRID,
            "hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-sel",
            highlightedIconId === icon.id || selectedIds.includes(icon.id)
              ? "bg-sel-soft ring-[1.5px] ring-sel"
              : undefined,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <IconGlyph icon={icon} size={iconSize} className="shrink-0 rounded-sm" />
            <span className="truncate text-meta">{icon.name}</span>
          </span>
          <span className="truncate text-label text-ink-muted">{fileTypeLabel(icon)}</span>
          <span className="truncate text-right text-label text-ink-muted">
            {icon.kind === "folder" ? "" : formatByteSize(icon.byteSize)}
          </span>
          <span className="truncate text-right text-label text-ink-muted">
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
        "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-ink outline-none transition-colors duration-150",
        "hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-sel",
        highlighted && "bg-sel-soft ring-[1.5px] ring-sel",
      )}
    >
      <IconGlyph icon={icon} size={iconSize} className="shrink-0 rounded-sm" />
      <span className="truncate text-meta">{icon.name}</span>
    </button>
  )
}
