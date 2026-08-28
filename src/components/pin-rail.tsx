import { IconGlyph } from "@/components/icon-glyph"
import { cn } from "@/lib/utils"
import type { DesktopIcon } from "@/types"

type PinRailProps = {
  icons: DesktopIcon[]
  onOpen: (icon: DesktopIcon) => void
}

export function PinRail({ icons, onOpen }: PinRailProps) {
  return (
    <div
      data-pin-rail=""
      className={cn(
        "mx-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-white/15",
        "bg-black/25 px-2 py-1.5 shadow-lg backdrop-blur-xl",
      )}
    >
      {icons.length === 0 ? (
        <p className="px-3 py-1 text-xs text-white/60">
          Pin a few icons here so they never collapse.
        </p>
      ) : (
        icons.map((icon) => (
          <button
            key={icon.id}
            type="button"
            title={icon.name}
            onClick={() => onOpen(icon)}
            className="rounded-xl p-1.5 hover:bg-white/10"
          >
            <IconGlyph icon={icon} size={36} />
          </button>
        ))
      )}
    </div>
  )
}
