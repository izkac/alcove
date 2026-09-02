import type { LucideIcon } from "lucide-react"
import {
  Activity,
  AppWindow,
  Boxes,
  Braces,
  CalendarClock,
  Code,
  Cog,
  Cpu,
  Database,
  Download,
  FileText,
  Folder,
  FolderOpen,
  HardDrive,
  Info,
  LayoutGrid,
  LayoutList,
  Monitor,
  Network,
  Rocket,
  ScrollText,
  Settings,
  Shield,
  SlidersHorizontal,
  SquareTerminal,
  User,
} from "lucide-react"
import type { StripTool } from "@/lib/strip-tools"
import { useShellIcon } from "@/lib/shell-icon"
import { cn } from "@/lib/utils"

const GLYPHS: Record<string, LucideIcon> = {
  activity: Activity,
  "app-window": AppWindow,
  boxes: Boxes,
  braces: Braces,
  calendar: CalendarClock,
  code: Code,
  cog: Cog,
  cpu: Cpu,
  database: Database,
  download: Download,
  "file-text": FileText,
  folder: Folder,
  "folder-open": FolderOpen,
  "hard-drive": HardDrive,
  info: Info,
  "layout-grid": LayoutGrid,
  "layout-list": LayoutList,
  monitor: Monitor,
  network: Network,
  rocket: Rocket,
  scroll: ScrollText,
  settings: Settings,
  shield: Shield,
  sliders: SlidersHorizontal,
  terminal: SquareTerminal,
  user: User,
}

type StripToolGlyphProps = {
  tool: StripTool
  size: number
  className?: string
}

export function StripToolGlyph({ tool, size, className }: StripToolGlyphProps) {
  const art = useShellIcon(tool.icon ?? tool.launch)
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
  const Icon = GLYPHS[tool.glyph] ?? SquareTerminal
  const inner = Math.round(size * 0.46)
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-[22%] text-white ring-1 ring-black/10",
        className,
      )}
      style={{ width: size, height: size, background: "oklch(50% 0.02 var(--wp-h))" }}
      aria-hidden
    >
      <Icon style={{ width: inner, height: inner }} strokeWidth={1.75} />
    </div>
  )
}
