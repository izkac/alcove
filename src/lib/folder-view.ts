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
