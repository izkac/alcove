import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { DENSITY_CONFIG } from "@/lib/density"
import {
  STRIP_TOOL_CATEGORIES,
  STRIP_TOOLS,
  toggleStripToolId,
} from "@/lib/strip-tools"
import { invoke, isTauri } from "@/lib/tauri"
import type { Density, LayoutId, StripEdge } from "@/types"

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  layoutId: LayoutId
  density: Density
  focusMode: boolean
  stripEdge: StripEdge
  stripToolIds: string[]
  desktopAttached?: boolean | null
  onLayout: (id: LayoutId) => void
  onDensity: (density: Density) => void
  onFocusMode: (on: boolean) => void
  onStripEdge: (edge: StripEdge) => void
  onStripToolIds: (ids: string[]) => void
  onCollapseAll: () => void
  onDropIncoming: () => void
  onLoadSample: () => void
  onStartEmpty: () => void
  onToggleDesktopLayer?: () => void
}

const LAYOUTS: { id: LayoutId; label: string }[] = [
  { id: "work", label: "Work" },
  { id: "home", label: "Home" },
  { id: "clean", label: "Clean" },
]

export function SettingsDialog(props: SettingsDialogProps) {
  const [winTaskbarHidden, setWinTaskbarHidden] = useState(false)
  const [autostartOn, setAutostartOn] = useState(false)

  useEffect(() => {
    if (!props.open || !isTauri()) return
    invoke<boolean>("windows_taskbar_hidden")
      .then(setWinTaskbarHidden)
      .catch(() => undefined)
    invoke<boolean>("autostart_enabled")
      .then(setAutostartOn)
      .catch(() => undefined)
  }, [props.open])

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[min(40rem,85vh)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Layout and desktop options. Running apps stay on the Windows
            taskbar.
          </DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">Layout</p>
          <div className="flex flex-wrap gap-1.5">
            {LAYOUTS.map((layout) => (
              <Button
                key={layout.id}
                size="sm"
                variant={props.layoutId === layout.id ? "secondary" : "outline"}
                onClick={() => props.onLayout(layout.id)}
              >
                {layout.label}
              </Button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">Icon size</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(DENSITY_CONFIG) as Density[]).map((density) => (
              <Button
                key={density}
                size="sm"
                variant={props.density === density ? "secondary" : "outline"}
                onClick={() => props.onDensity(density)}
              >
                {DENSITY_CONFIG[density].label}
              </Button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            Frequent items
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant={props.stripEdge === "top" ? "secondary" : "outline"}
              onClick={() => props.onStripEdge("top")}
            >
              Top
            </Button>
            <Button
              size="sm"
              variant={props.stripEdge === "bottom" ? "secondary" : "outline"}
              onClick={() => props.onStripEdge("bottom")}
            >
              Bottom
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Shortcuts stay on the left of the strip. Pick which ones to show.
          </p>
          <StripToolPicker
            selected={props.stripToolIds}
            onChange={props.onStripToolIds}
          />
        </section>

        <section className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant={props.focusMode ? "secondary" : "outline"}
            onClick={() => props.onFocusMode(!props.focusMode)}
          >
            Focus one Alcove
          </Button>
          <Button size="sm" variant="outline" onClick={props.onCollapseAll}>
            Collapse all
          </Button>
        </section>

        <Separator />

        <section className="flex flex-col gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="justify-start"
            onClick={props.onDropIncoming}
          >
            Drop a new file onto the desktop
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="justify-start"
            onClick={props.onLoadSample}
          >
            {isTauri() ? "Reload desktop icons" : "Load sample desktop"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="justify-start"
            onClick={props.onStartEmpty}
          >
            Start with an empty Inbox
          </Button>
        </section>

        {props.onToggleDesktopLayer || isTauri() ? (
          <>
            <Separator />
            <section className="flex flex-col gap-1.5">
              {props.onToggleDesktopLayer ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="justify-start"
                  onClick={props.onToggleDesktopLayer}
                >
                  {props.desktopAttached
                    ? "Show as a window"
                    : "Use as the desktop"}
                </Button>
              ) : null}
              {isTauri() ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="justify-start"
                  onClick={() => {
                    invoke<boolean>("set_autostart", {
                      enabled: !autostartOn,
                    })
                      .then((on) => {
                        setAutostartOn(on)
                        toast(
                          on
                            ? "Alcove will start when you sign in"
                            : "Alcove will not start at sign-in",
                        )
                      })
                      .catch((err) => {
                        toast(err instanceof Error ? err.message : String(err))
                      })
                  }}
                >
                  {autostartOn
                    ? "Stop starting when I sign in"
                    : "Start when I sign in to Windows"}
                </Button>
              ) : null}
              {isTauri() ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="justify-start"
                  onClick={() => {
                    invoke<boolean>("set_windows_taskbar_hidden", {
                      hidden: !winTaskbarHidden,
                    })
                      .then((hidden) => {
                        setWinTaskbarHidden(hidden)
                        toast(
                          hidden
                            ? "Windows taskbar hidden — mouse to the screen edge to peek"
                            : "Windows taskbar restored",
                        )
                      })
                      .catch((err) => {
                        toast(err instanceof Error ? err.message : String(err))
                      })
                  }}
                >
                  {winTaskbarHidden
                    ? "Show the Windows taskbar"
                    : "Hide the Windows taskbar"}
                </Button>
              ) : null}
            </section>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function StripToolPicker({
  selected,
  onChange,
}: {
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  return (
    <div className="max-h-52 overflow-y-auto rounded-lg border border-border p-2">
      {STRIP_TOOL_CATEGORIES.map((category) => (
        <div key={category.id} className="mb-2 last:mb-0">
          <p className="px-1 pb-1 text-[11px] font-medium text-muted-foreground">
            {category.label}
          </p>
          {STRIP_TOOLS.filter((tool) => tool.category === category.id).map((tool) => {
            const on = selected.includes(tool.id)
            return (
              <label
                key={tool.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-muted/60"
              >
                <input
                  type="checkbox"
                  className="size-3.5 accent-sky-500"
                  checked={on}
                  onChange={() => onChange(toggleStripToolId(selected, tool.id))}
                />
                {tool.label}
              </label>
            )
          })}
        </div>
      ))}
    </div>
  )
}

