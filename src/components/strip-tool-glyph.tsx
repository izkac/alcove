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
  glyph: string
  size: number
  className?: string
}

export function StripToolGlyph({ glyph, size, className }: StripToolGlyphProps) {
  const Icon = GLYPHS[glyph] ?? SquareTerminal
  const inner = Math.round(size * 0.46)
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl bg-linear-to-br from-slate-500 to-slate-800 text-white shadow-md ring-1 ring-white/25",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon style={{ width: inner, height: inner }} strokeWidth={1.75} />
    </div>
  )
}
