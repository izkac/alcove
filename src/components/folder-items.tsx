import type { PointerEvent } from "react"
import { DesktopIconTile } from "@/components/desktop-icon"
import { IconGlyph } from "@/components/icon-glyph"
import { fileTypeLabel } from "@/lib/folder-view"
import { cn } from "@/lib/utils"
import type { DesktopIcon, FolderView } from "@/types"

type FolderItemsProps = {
  items: DesktopIcon[]
  view: FolderView
  iconSize: number
  highlightedIconId: string | null
  empty: string
  onOpen: (icon: DesktopIcon) => void
  onPointerDown?: (icon: DesktopIcon, event: PointerEvent) => void
}

export function FolderItems({
  items,
  view,
  iconSize,
  highlightedIconId,
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
          highlighted={highlightedIconId === icon.id}
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
          highlighted={highlightedIconId === icon.id}
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
  onOpen,
  onPointerDown,
}: RowProps) {
  return (
    <div className="min-w-0">
      <div className="mb-1 grid grid-cols-[minmax(0,1fr)_7rem] gap-3 px-2 text-[10px] tracking-wide text-white/40 uppercase">
        <span>Name</span>
        <span>Type</span>
      </div>
      {items.map((icon) => (
        <FolderRow
          key={icon.id}
          icon={icon}
          iconSize={iconSize}
          highlighted={highlightedIconId === icon.id}
          typeLabel={fileTypeLabel(icon)}
          onOpen={onOpen}
          onPointerDown={onPointerDown}
        />
      ))}
    </div>
  )
}

function FolderRow({
  icon,
  iconSize,
  highlighted,
  typeLabel,
  onOpen,
  onPointerDown,
}: {
  icon: DesktopIcon
  iconSize: number
  highlighted: boolean
  typeLabel?: string
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
            "min-w-0 items-center rounded-md px-2 py-1 text-left text-white/95 outline-none",
            "hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/50",
            highlighted && "bg-sky-400/25 ring-2 ring-sky-300",
            typeLabel
              ? "grid w-full grid-cols-[minmax(0,1fr)_7rem] gap-3"
              : "flex w-full gap-2",
          )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <IconGlyph icon={icon} size={iconSize} className="shrink-0 rounded-sm" />
        <span className="truncate text-[12px] leading-tight">{icon.name}</span>
      </span>
      {typeLabel ? (
        <span className="truncate text-[11px] text-white/50">{typeLabel}</span>
      ) : null}
    </button>
  )
}
