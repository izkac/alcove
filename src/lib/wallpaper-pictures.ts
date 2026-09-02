import type { HarvestedIcon } from "./harvest-merge.ts"

/** Newest pictures shown in the in-app picker. The rest stay in the folder. */
export const PICTURE_CAP = 48

const PICTURE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "jfif",
  "gif",
  "webp",
  "bmp",
  "tif",
  "tiff",
  "heic",
])

const FOLDER_ORDER = [
  "pictures",
  "screenshots",
  "desktop",
  "downloads",
  "documents",
]

export type KnownFolder = { id: string; name: string; path: string }

export function isPicture(icon: {
  kind: string
  extension?: string
  path?: string
}): boolean {
  if (icon.kind === "image") return true
  const fromExt = (icon.extension ?? "").toLowerCase()
  if (PICTURE_EXT.has(fromExt)) return true
  const fromPath = (icon.path ?? "").split(".").pop()?.toLowerCase() ?? ""
  return PICTURE_EXT.has(fromPath)
}

export function picturesIn(
  icons: HarvestedIcon[],
  cap = PICTURE_CAP,
): HarvestedIcon[] {
  return icons.filter(isPicture).slice(0, cap)
}

/** Pictures first: that is where wallpapers usually live. */
export function preferPictureFolders(folders: KnownFolder[]): KnownFolder[] {
  return [...folders].sort((a, b) => rank(a.id) - rank(b.id))
}

function rank(id: string): number {
  const i = FOLDER_ORDER.indexOf(id)
  return i === -1 ? FOLDER_ORDER.length : i
}
