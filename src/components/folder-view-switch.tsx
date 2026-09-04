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
      className="flex shrink-0 rounded-lg bg-veil p-0.5"
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
              "home-ink-faint flex size-7 items-center justify-center rounded-md outline-none transition-colors duration-150",
              "hover:home-ink focus-visible:outline-2 focus-visible:outline-sel",
              active && "home-ink bg-veil-hover",
            )}
          >
            <Icon className="size-3.5" />
          </button>
        )
      })}
    </div>
  )
}
