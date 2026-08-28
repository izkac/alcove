import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DENSITY_CONFIG } from "@/lib/density"
import { cn } from "@/lib/utils"
import type { Density, LayoutId } from "@/types"
import { Focus, LayoutGrid, Search, SquareStack } from "lucide-react"

type TaskbarProps = {
  layoutId: LayoutId
  density: Density
  focusMode: boolean
  inboxCount: number
  onLayout: (id: LayoutId) => void
  onDensity: (density: Density) => void
  onFocusMode: (on: boolean) => void
  onCollapseAll: () => void
  onSearch: () => void
  onNewAlcove: () => void
  onDropIncoming: () => void
  onLoadSample: () => void
  onStartEmpty: () => void
}

const LAYOUTS: { id: LayoutId; label: string }[] = [
  { id: "work", label: "Work" },
  { id: "home", label: "Home" },
  { id: "clean", label: "Clean" },
]

export function Taskbar(props: TaskbarProps) {
  const [clock, setClock] = useState(() => formatClock(new Date()))

  useEffect(() => {
    const timer = window.setInterval(() => setClock(formatClock(new Date())), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <footer className="flex items-center justify-between gap-3 border-t border-white/10 bg-zinc-950/55 px-3 py-2 text-white backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              className="bg-white/15 text-white hover:bg-white/25"
            >
              <SquareStack />
              Alcove
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={props.onNewAlcove}>New Alcove</DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onDropIncoming}>
              Drop a new file onto the desktop
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={props.onLoadSample}>
              Load sample desktop
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onStartEmpty}>
              Start with an empty Inbox
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {props.inboxCount > 0 ? (
          <Badge className="hidden bg-amber-400 text-amber-950 sm:inline-flex">
            Inbox {props.inboxCount}
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-1 items-center justify-center gap-1">
        {LAYOUTS.map((layout) => (
          <Button
            key={layout.id}
            size="sm"
            variant={props.layoutId === layout.id ? "secondary" : "ghost"}
            className={cn(
              "text-white",
              props.layoutId !== layout.id && "hover:bg-white/10",
            )}
            onClick={() => props.onLayout(layout.id)}
          >
            {layout.label}
          </Button>
        ))}
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-white hover:bg-white/10"
          onClick={props.onSearch}
          title="Search (Ctrl+F)"
        >
          <Search />
        </Button>
      </div>

      <div className="flex items-center gap-1">
        <Button
          size="icon-sm"
          variant={props.focusMode ? "secondary" : "ghost"}
          className="text-white hover:bg-white/10"
          onClick={() => props.onFocusMode(!props.focusMode)}
          title="Focus one Alcove"
        >
          <Focus />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-white hover:bg-white/10"
              title="Density"
            >
              <LayoutGrid />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(DENSITY_CONFIG) as Density[]).map((density) => (
              <DropdownMenuItem
                key={density}
                onSelect={() => props.onDensity(density)}
              >
                {DENSITY_CONFIG[density].label}
                {props.density === density ? " · on" : ""}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="sm"
          variant="ghost"
          className="hidden text-white hover:bg-white/10 sm:inline-flex"
          onClick={props.onCollapseAll}
        >
          Collapse all
        </Button>
        <span className="hidden min-w-16 px-2 text-right text-xs tabular-nums text-white/80 md:inline">
          {clock}
        </span>
      </div>
    </footer>
  )
}

function formatClock(date: Date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}
