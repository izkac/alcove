import { FOLDER_VIEWS } from "../types.ts"
import type { DesktopIcon, FolderView } from "../types.ts"

export { FOLDER_VIEWS }
export type { FolderView }

export const FOLDER_VIEW_OPTIONS: {
  id: FolderView
  label: string
}[] = [
  { id: "icons", label: "Icons" },
  { id: "large", label: "Large icons" },
  { id: "list", label: "List" },
  { id: "details", label: "Details" },
]

export const FOLDER_SORT_COLUMNS = ["name", "type", "size", "modified"] as const
export type FolderSortColumn = (typeof FOLDER_SORT_COLUMNS)[number]
export type FolderSortDir = "asc" | "desc"
export type FolderSort = { column: FolderSortColumn; dir: FolderSortDir }

/** Live folders arrive newest-first; Details keeps that until the user clicks a header. */
export const DEFAULT_FOLDER_SORT: FolderSort = { column: "modified", dir: "desc" }

const KIND_LABEL: Record<string, string> = {
  app: "Application",
  document: "File",
  folder: "Folder",
  installer: "Installer",
  shortcut: "Shortcut",
  image: "Image",
}

export function folderViewFor(alcove: { folderView?: string | null }): FolderView {
  return FOLDER_VIEWS.includes(alcove.folderView as FolderView)
    ? (alcove.folderView as FolderView)
    : "icons"
}

export function fileTypeLabel(icon: DesktopIcon): string {
  if (icon.kind === "folder") return "Folder"
  if (icon.extension) return icon.extension.toUpperCase()
  return KIND_LABEL[icon.kind] ?? "File"
}

export function folderIconSize(view: FolderView, densitySize: number): number {
  if (view === "large") return 80
  if (view === "list" || view === "details") return 18
  return densitySize
}

export function formatByteSize(bytes?: number | null): string {
  if (bytes == null || bytes < 0) return "—"
  if (bytes < 1024) return `${bytes} bytes`
  const units = ["KB", "MB", "GB", "TB"]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = value >= 10 ? 0 : 1
  return `${value.toFixed(digits)} ${units[unit]}`
}

export function formatModifiedAt(ms?: number | null): string {
  if (ms == null) return "—"
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function toggleFolderSort(current: FolderSort, column: FolderSortColumn): FolderSort {
  if (current.column === column) {
    return { column, dir: current.dir === "asc" ? "desc" : "asc" }
  }
  return { column, dir: column === "name" || column === "type" ? "asc" : "desc" }
}

export function sortFolderItems(items: DesktopIcon[], sort: FolderSort): DesktopIcon[] {
  const sign = sort.dir === "asc" ? 1 : -1
  return [...items].sort((left, right) => {
    const ranked = compareColumn(left, right, sort.column) * sign
    if (ranked !== 0) return ranked
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" })
  })
}

function compareColumn(left: DesktopIcon, right: DesktopIcon, column: FolderSortColumn): number {
  if (column === "name") {
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" })
  }
  if (column === "type") {
    return fileTypeLabel(left).localeCompare(fileTypeLabel(right), undefined, {
      sensitivity: "base",
    })
  }
  if (column === "size") {
    return (left.byteSize ?? -1) - (right.byteSize ?? -1)
  }
  return (left.modifiedAt ?? 0) - (right.modifiedAt ?? 0)
}
