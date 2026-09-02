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
    <aside className="alcove-rise pointer-events-none absolute bottom-4 left-4 z-30 w-56 rounded-xl border border-hairline bg-desk p-3 text-ink shadow-pop md:bottom-6 md:left-6">
      <div className="flex h-40 items-center justify-center overflow-hidden rounded-lg bg-surface-2">
        {thumb ? (
          <img src={thumb} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <IconGlyph icon={icon} size={72} />
        )}
      </div>
      <p className="mt-2.5 line-clamp-2 text-meta font-medium">{icon.name}</p>
      <p className="mt-0.5 text-label text-ink-muted">
        {fileTypeLabel(icon)}
        {icon.kind === "folder" ? "" : ` · ${formatByteSize(icon.byteSize)}`}
      </p>
      <p className="text-label text-ink-muted">{formatModifiedAt(icon.modifiedAt)}</p>
    </aside>
  )
}
