import { IconGlyph } from "@/components/icon-glyph"
import { StripToolGlyph } from "@/components/strip-tool-glyph"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { cn } from "@/lib/utils"
import type { StripTool } from "@/lib/strip-tools"
import type { DesktopIcon, StripEdge } from "@/types"
import { Pin } from "lucide-react"

type FrequentStripProps = {
  tools: StripTool[]
  icons: DesktopIcon[]
  keepIds: string[]
  edge?: StripEdge
  onOpenTool: (tool: StripTool) => void
  onOpen: (icon: DesktopIcon) => void
  onToggleKeep: (iconId: string) => void
  onHide: (iconId: string) => void
  onReveal: (iconId: string) => void
}

/**
 * The things you actually open, held at the top or bottom edge (Settings).
 * Pinned system tools sit on the left; slot order for apps comes from the
 * caller and deliberately does not re-sort by rank — see lib/frecency.
 */
export function FrequentStrip({
  tools = [],
  icons,
  keepIds,
  edge = "top",
  onOpenTool,
  onOpen,
  onToggleKeep,
  onHide,
  onReveal,
}: FrequentStripProps) {
  if (tools.length === 0 && icons.length === 0) return null

  return (
    // In flow, so the desktop below it never has to know the strip's height.
    <div
      className={cn(
        // Only the bar takes clicks: the empty width either side of it is
        // desktop, and an icon parked up there has to stay reachable.
        "pointer-events-none relative z-20 flex shrink-0 justify-center px-4 md:px-6",
        edge === "bottom" ? "pt-1 pb-3" : "pt-3 pb-1",
      )}
    >
      <div className="pointer-events-auto flex max-w-full items-start gap-0.5 overflow-x-auto rounded-2xl border border-dock-line bg-dock px-2 py-1.5 shadow-dock">
        {tools.map((tool) => (
          <ToolSlot key={tool.id} tool={tool} onOpen={onOpenTool} />
        ))}
        {tools.length > 0 && icons.length > 0 ? (
          <div
            aria-hidden
            className="mx-1.5 mt-2.5 h-8 w-px shrink-0 self-start bg-dock-line"
          />
        ) : null}
        {icons.map((icon) => {
          const kept = keepIds.includes(icon.id)
          return (
            <ContextMenu key={icon.id}>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  title={icon.name}
                  // Only apps take a dropped file. Dropping a photo on a
                  // spreadsheet would be a launch command with no meaning.
                  data-strip-launch={
                    icon.kind === "app" || icon.kind === "shortcut"
                      ? icon.path
                      : undefined
                  }
                  data-strip-label={icon.name}
                  data-launch-pulse={icon.id}
                  onClick={() => onOpen(icon)}
                  className={SLOT}
                >
                  <IconGlyph icon={icon} size={34} className="home-mark" />
                  <SlotLabel>{icon.name.replace(/\.[^.]+$/, "")}</SlotLabel>
                  {kept ? (
                    <Pin
                      aria-label="Kept in this slot"
                      className="absolute top-1 right-1.5 size-2.5 fill-sel text-sel"
                    />
                  ) : null}
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => onOpen(icon)}>Open</ContextMenuItem>
                <ContextMenuItem onSelect={() => onReveal(icon.id)}>
                  Show in its Alcove
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => onToggleKeep(icon.id)}>
                  {kept ? "Stop keeping here" : "Keep in this slot"}
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => onHide(icon.id)}>
                  Never show here
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          )
        })}
      </div>
    </div>
  )
}

function ToolSlot({
  tool,
  onOpen,
}: {
  tool: StripTool
  onOpen: (tool: StripTool) => void
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          title={tool.label}
          data-strip-launch={tool.launch}
          data-strip-label={tool.label}
          data-launch-pulse={tool.id}
          onClick={() => onOpen(tool)}
          className={SLOT}
        >
          <StripToolGlyph tool={tool} size={34} className="home-mark" />
          <SlotLabel>{tool.label}</SlotLabel>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onOpen(tool)}>Open</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** One slot, tool or app: the same box, so the strip reads as one row. */
const SLOT =
  "relative flex w-[66px] shrink-0 flex-col items-center gap-1.5 rounded-[10px] px-1 pt-1.5 pb-1 outline-none transition-colors duration-150 hover:bg-veil-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sel"

function SlotLabel({ children }: { children: string }) {
  return (
    <span className="home-ink line-clamp-2 w-full text-center text-label break-words">
      {children}
    </span>
  )
}
