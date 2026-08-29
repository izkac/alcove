import { LayoutGrid, List, Square, Table2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { FOLDER_VIEW_OPTIONS } from "@/lib/folder-view"
import type { FolderView } from "@/types"

const ICONS: Record<FolderView, typeof LayoutGrid> = {
  icons: LayoutGrid,
  large: Square,
  list: List,
  details: Table2,
}

type FolderViewSwitchProps = {
  value: FolderView
  onChange: (view: FolderView) => void
}

export function FolderViewSwitch({ value, onChange }: FolderViewSwitchProps) {
  return (
    <div
      role="group"
      aria-label="Folder view"
      className="flex shrink-0 rounded-lg border border-white/15 p-0.5"
    >
      {FOLDER_VIEW_OPTIONS.map((option) => {
        const Icon = ICONS[option.id]
        const active = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            title={option.label}
            aria-label={option.label}
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={cn(
              "flex size-7 items-center justify-center rounded-md text-white/55 transition",
              "hover:bg-white/10 hover:text-white",
              active && "bg-white/15 text-white",
            )}
          >
            <Icon className="size-3.5" />
          </button>
        )
      })}
    </div>
  )
}
