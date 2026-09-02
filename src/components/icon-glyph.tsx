import { memo } from "react"
import type { DesktopIcon } from "@/types"
import { useShellIcon } from "@/lib/shell-icon"
import { cn } from "@/lib/utils"
import {
  AppWindow,
  FileArchive,
  Folder,
  Image,
} from "lucide-react"

/**
 * Stand-in faces for files Windows gave us no art for. One flat colour per kind,
 * lightness fixed so a white glyph reads on it in either theme.
 */
const FACE: Record<string, { hue: number; Icon: typeof AppWindow }> = {
  app: { hue: 245, Icon: AppWindow },
  folder: { hue: 80, Icon: Folder },
  installer: { hue: 40, Icon: FileArchive },
  shortcut: { hue: 290, Icon: AppWindow },
  image: { hue: 350, Icon: Image },
  zip: { hue: 60, Icon: FileArchive },
  exe: { hue: 30, Icon: FileArchive },
  msi: { hue: 30, Icon: FileArchive },
}

/** Band colour for the sheet. Anything unlisted gets the neutral slate. */
const INK: Record<string, string> = {
  pdf: "#c0392b",
  doc: "#2563eb",
  docx: "#2563eb",
  rtf: "#2563eb",
  odt: "#2563eb",
  xls: "#15803d",
  xlsx: "#15803d",
  csv: "#15803d",
  ppt: "#c2410c",
  pptx: "#c2410c",
  json: "#7c3aed",
  xml: "#7c3aed",
  yml: "#7c3aed",
  yaml: "#7c3aed",
  sql: "#0e7490",
  md: "#0f766e",
}

const SHEET = "#f4f5f7"
const FOLD = "#c9ced8"

/**
 * Stand-in for files Windows only has a near-blank white icon for — mostly
 * plain text. A page with the file type on it beats six identical white sheets.
 */
function DocSheet({ ext, size, className }: { ext?: string; size: number; className?: string }) {
  const band = (ext && INK[ext]) ?? "#5b6472"
  const label = ext ? ext.slice(0, 4).toUpperCase() : ""
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <path
        d="M7 2h11l8 8v19a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3z"
        fill={SHEET}
      />
      <path d="M18 2l8 8h-6a2 2 0 0 1-2-2z" fill={FOLD} />
      {label ? (
        <>
          <path d="M4 20h22v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill={band} />
          {size >= 26 ? (
            <text
              x="15"
              y="28.4"
              textAnchor="middle"
              fill="#ffffff"
              fontFamily="system-ui, sans-serif"
              fontWeight="700"
              fontSize={label.length > 3 ? 6.5 : 8}
              letterSpacing={label.length > 3 ? -0.2 : 0.2}
            >
              {label}
            </text>
          ) : null}
        </>
      ) : (
        // No extension to name, so rule the page instead.
        <g fill={FOLD}>
          <rect x="8" y="15" width="14" height="2" rx="1" />
          <rect x="8" y="20" width="14" height="2" rx="1" />
          <rect x="8" y="25" width="9" height="2" rx="1" />
        </g>
      )}
    </svg>
  )
}

type IconGlyphProps = {
  icon: DesktopIcon
  size: number
  className?: string
}

export const IconGlyph = memo(function IconGlyph({ icon, size, className }: IconGlyphProps) {
  // Saved state drops imageUrl to stay small, and harvest misses the odd file;
  // ask Windows for the real art rather than showing a lettered tile.
  const fallback = useShellIcon(icon.imageUrl ? "" : (icon.path ?? ""))
  const art = icon.imageUrl ?? fallback
  if (art) {
    return (
      <img
        src={art}
        width={size}
        height={size}
        alt=""
        draggable={false}
        decoding="async"
        className={cn("bg-transparent object-contain", className)}
        style={{ width: size, height: size }}
        aria-hidden
      />
    )
  }
  const face = (icon.extension && FACE[icon.extension]) ?? FACE[icon.kind]
  if (!face) return <DocSheet ext={icon.extension} size={size} className={className} />
  const { hue, Icon } = face
  const glyph = Math.round(size * 0.46)
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-[22%] text-white ring-1 ring-black/10",
        className,
      )}
      style={{ width: size, height: size, background: `oklch(58% 0.1 ${hue})` }}
      aria-hidden
    >
      <Icon style={{ width: glyph, height: glyph }} strokeWidth={1.75} />
    </div>
  )
})
