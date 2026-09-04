/**
 * Glyph metadata and the "pick a sensible default" logic, split out from
 * alcove-glyphs.tsx so it can be reused from a plain module — `syncDriveDrawers`
 * needs `defaultAlcoveGlyph` and this file has no JSX, so plain `node` can still
 * run it (unlike the .tsx file, which node's type-stripping cannot parse).
 */
import type { LucideIcon } from "lucide-react"
import {
  Archive,
  Bookmark,
  Box,
  Briefcase,
  Camera,
  Code,
  Download,
  FileText,
  Film,
  Folder,
  Gamepad2,
  Globe,
  Heart,
  Image,
  Inbox,
  LayoutGrid,
  Link2,
  Mail,
  Monitor,
  Music,
  Package,
  Palette,
  Star,
  Users,
  Video,
  Wrench,
} from "lucide-react"
import type { Alcove } from "@/types"

export const ALCOVE_GLYPHS = [
  { id: "layout-grid", label: "Apps", Icon: LayoutGrid },
  { id: "monitor", label: "Computer", Icon: Monitor },
  { id: "file-text", label: "Documents", Icon: FileText },
  { id: "folder", label: "Folders", Icon: Folder },
  { id: "image", label: "Photos", Icon: Image },
  { id: "camera", label: "Camera", Icon: Camera },
  { id: "package", label: "Packages", Icon: Package },
  { id: "archive", label: "Archive", Icon: Archive },
  { id: "link", label: "Shortcuts", Icon: Link2 },
  { id: "briefcase", label: "Work", Icon: Briefcase },
  { id: "inbox", label: "Inbox", Icon: Inbox },
  { id: "download", label: "Downloads", Icon: Download },
  { id: "gamepad", label: "Games", Icon: Gamepad2 },
  { id: "music", label: "Music", Icon: Music },
  { id: "video", label: "Video", Icon: Video },
  { id: "film", label: "Movies", Icon: Film },
  { id: "code", label: "Code", Icon: Code },
  { id: "globe", label: "Web", Icon: Globe },
  { id: "mail", label: "Mail", Icon: Mail },
  { id: "users", label: "People", Icon: Users },
  { id: "star", label: "Favorites", Icon: Star },
  { id: "heart", label: "Loved", Icon: Heart },
  { id: "bookmark", label: "Saved", Icon: Bookmark },
  { id: "palette", label: "Design", Icon: Palette },
  { id: "wrench", label: "Tools", Icon: Wrench },
  { id: "box", label: "Stuff", Icon: Box },
] as const

export type AlcoveGlyphId = (typeof ALCOVE_GLYPHS)[number]["id"]

/** Icon lookup by id. Exported for AlcoveGlyphMark; nothing else needs it. */
export const BY_ID = Object.fromEntries(
  ALCOVE_GLYPHS.map((item) => [item.id, item]),
) as Record<AlcoveGlyphId, (typeof ALCOVE_GLYPHS)[number]>

const DEFAULTS: Record<string, AlcoveGlyphId> = {
  inbox: "inbox",
  apps: "layout-grid",
  documents: "file-text",
  photos: "image",
  folders: "folder",
  installers: "package",
  shortcuts: "link",
  "client-a": "briefcase",
}

export function isAlcoveGlyphId(value: string | undefined): value is AlcoveGlyphId {
  return Boolean(value && value in BY_ID)
}

export function defaultAlcoveGlyph(id: string, name: string): AlcoveGlyphId {
  if (DEFAULTS[id]) return DEFAULTS[id]
  const text = `${id} ${name}`.toLowerCase()
  if (/\b(apps?|programs?|software)\b/.test(text)) return "layout-grid"
  if (/\b(documents?|docs?|papers?|pdfs?)\b/.test(text)) return "file-text"
  if (/\b(photos?|pictures?|images?)\b/.test(text)) return "image"
  if (/\b(folders?|directories)\b/.test(text)) return "folder"
  if (/\b(installers?|setups?|packages?|zips?)\b/.test(text)) return "package"
  if (/\b(shortcuts?|links?)\b/.test(text)) return "link"
  if (/\b(games?)\b/.test(text)) return "gamepad"
  if (/\b(music|audio|songs?)\b/.test(text)) return "music"
  if (/\b(videos?|movies?|films?)\b/.test(text)) return "film"
  if (/\b(code|dev|git)\b/.test(text)) return "code"
  if (/\b(downloads?)\b/.test(text)) return "download"
  if (/\b(screenshots?|captures?)\b/.test(text)) return "camera"
  if (/\b(mail|email)\b/.test(text)) return "mail"
  if (/\b(work|clients?|jobs?|office)\b/.test(text)) return "briefcase"
  if (/\b(web|www|sites?)\b/.test(text)) return "globe"
  return "folder"
}

export function resolveAlcoveGlyph(alcove: Pick<Alcove, "id" | "name" | "isInbox"> & {
  glyph?: string
}): AlcoveGlyphId {
  if (alcove.isInbox) return "inbox"
  if (isAlcoveGlyphId(alcove.glyph)) return alcove.glyph
  return defaultAlcoveGlyph(alcove.id, alcove.name)
}

/** Only AlcoveGlyphMark needs this; kept here so BY_ID stays module-private-ish. */
export function glyphIcon(glyph: AlcoveGlyphId): LucideIcon {
  return BY_ID[glyph]?.Icon ?? Folder
}
