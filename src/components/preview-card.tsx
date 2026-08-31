import { IconGlyph } from "@/components/icon-glyph"
import {
  fileTypeLabel,
  formatByteSize,
  formatModifiedAt,
} from "@/lib/folder-view"
import { useThumbnail } from "@/lib/thumbnail"
import type { DesktopIcon } from "@/types"

/**
 * What one selected file is, without opening it. Shows the shell thumbnail when
 * Windows has one and the icon plus its facts when it does not, so the card
 * never blinks in and out as the selection moves down a folder.
 */
export function PreviewCard({ icon }: { icon: DesktopIcon | null }) {
  const thumb = useThumbnail(icon?.path)
  if (!icon) return null
  return (
    <aside className="pointer-events-none absolute bottom-4 left-4 z-30 w-56 rounded-xl border border-white/15 bg-black/50 p-3 text-white/95 shadow-2xl backdrop-blur-xl md:bottom-6 md:left-6">
      <div className="flex h-40 items-center justify-center overflow-hidden rounded-lg bg-black/30">
        {thumb ? (
          <img src={thumb} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <IconGlyph icon={icon} size={72} />
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-[12px] font-medium leading-tight">
        {icon.name}
      </p>
      <p className="mt-0.5 text-[11px] text-white/60">
        {fileTypeLabel(icon)}
        {icon.kind === "folder" ? "" : ` · ${formatByteSize(icon.byteSize)}`}
      </p>
      <p className="text-[11px] text-white/60">{formatModifiedAt(icon.modifiedAt)}</p>
    </aside>
  )
}
