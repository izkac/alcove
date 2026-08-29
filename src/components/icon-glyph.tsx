import { memo } from "react"
import type { DesktopIcon } from "@/types"
import { cn } from "@/lib/utils"
import {
  AppWindow,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Folder,
  Image,
  Presentation,
  StickyNote,
} from "lucide-react"

const FACE: Record<string, { bg: string; Icon: typeof FileText }> = {
  app: { bg: "from-sky-500 to-blue-700", Icon: AppWindow },
  folder: { bg: "from-amber-300 to-amber-500", Icon: Folder },
  installer: { bg: "from-orange-500 to-red-600", Icon: FileArchive },
  shortcut: { bg: "from-indigo-400 to-violet-700", Icon: AppWindow },
  image: { bg: "from-fuchsia-400 to-rose-600", Icon: Image },
  pdf: { bg: "from-red-500 to-red-800", Icon: FileText },
  docx: { bg: "from-blue-400 to-blue-800", Icon: FileText },
  xlsx: { bg: "from-emerald-400 to-emerald-800", Icon: FileSpreadsheet },
  pptx: { bg: "from-orange-400 to-orange-700", Icon: Presentation },
  txt: { bg: "from-slate-400 to-slate-700", Icon: StickyNote },
  md: { bg: "from-slate-400 to-slate-700", Icon: FileText },
  zip: { bg: "from-amber-500 to-orange-800", Icon: FileArchive },
  exe: { bg: "from-orange-500 to-red-700", Icon: FileArchive },
  msi: { bg: "from-orange-500 to-red-700", Icon: FileArchive },
}

function faceFor(icon: DesktopIcon) {
  if (icon.extension && FACE[icon.extension]) return FACE[icon.extension]
  return FACE[icon.kind] ?? FACE.app
}

type IconGlyphProps = {
  icon: DesktopIcon
  size: number
  className?: string
}

export const IconGlyph = memo(function IconGlyph({ icon, size, className }: IconGlyphProps) {
  if (icon.imageUrl) {
    return (
      <img
        src={icon.imageUrl}
        width={size}
        height={size}
        alt=""
        draggable={false}
        decoding="async"
        className={cn("bg-transparent object-contain drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]", className)}
        style={{ width: size, height: size }}
        aria-hidden
      />
    )
  }
  const { bg, Icon } = faceFor(icon)
  const glyph = Math.round(size * 0.46)
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl bg-linear-to-br text-white shadow-md ring-1 ring-white/25",
        bg,
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon style={{ width: glyph, height: glyph }} strokeWidth={1.75} />
    </div>
  )
})
