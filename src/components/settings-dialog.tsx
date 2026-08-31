import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { StripToolGlyph } from "@/components/strip-tool-glyph"
import { cn } from "@/lib/utils"
import { DENSITY_CONFIG } from "@/lib/density"
import {
  STRIP_TOOL_CATEGORIES,
  STRIP_TOOLS,
  toggleStripToolId,
} from "@/lib/strip-tools"
import { invoke, isTauri } from "@/lib/tauri"
import { BUY_URL, checkForUpdate, type Licence } from "@/lib/update"
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

type SettingsTab = "general" | "strip" | "system"

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "strip", label: "Frequent strip" },
  { id: "system", label: "System" },
]

export function SettingsDialog(props: SettingsDialogProps) {
  const [tab, setTab] = useState<SettingsTab>("general")

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[min(40rem,85vh)] gap-0 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="-mx-4 mt-3 flex gap-1 border-b border-border px-4 pb-3">
          {TABS.map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant={tab === t.id ? "secondary" : "ghost"}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </Button>
          ))}
        </div>

        <div className="flex h-[440px] flex-col gap-5 pt-4">
          {tab === "general" && <GeneralTab {...props} />}
          {tab === "strip" && <StripTab {...props} />}
          {tab === "system" && <SystemTab {...props} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function GeneralTab(props: SettingsDialogProps) {
  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">Layout</p>
        <Segmented
          value={props.layoutId}
          options={LAYOUTS.map((l) => ({ value: l.id, label: l.label }))}
          onChange={props.onLayout}
        />
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">Icon size</p>
        <Segmented
          value={props.density}
          options={(Object.keys(DENSITY_CONFIG) as Density[]).map((d) => ({
            value: d,
            label: DENSITY_CONFIG[d].label,
          }))}
          onChange={props.onDensity}
        />
      </section>

      <Separator />

      <SettingRow
        label="Focus one Alcove"
        description="Expanding an Alcove collapses the others"
      >
        <Switch checked={props.focusMode} onCheckedChange={props.onFocusMode} />
      </SettingRow>

      <SettingRow
        label="Collapse everything"
        description="Fold every open Alcove down to its chip"
      >
        <Button size="sm" variant="outline" onClick={props.onCollapseAll}>
          Collapse all
        </Button>
      </SettingRow>
    </>
  )
}

function StripTab(props: SettingsDialogProps) {
  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Position on screen
        </p>
        <Segmented
          value={props.stripEdge}
          options={[
            { value: "top", label: "Top" },
            { value: "bottom", label: "Bottom" },
          ]}
          onChange={props.onStripEdge}
        />
      </section>

      <section className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Shortcuts</p>
          <Badge variant="outline">{props.stripToolIds.length} selected</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Shown on the left of the strip, before your pinned apps.
        </p>
        <StripToolPicker
          selected={props.stripToolIds}
          onChange={props.onStripToolIds}
        />
      </section>
    </>
  )
}

/**
 * Alcove is free and complete without this. A licence buys the update stream —
 * when it lapses the installed copy keeps working, so there is nothing to
 * revoke, nothing to phone home about, and no reason to nag.
 */
function LicenceSection() {
  const [licence, setLicence] = useState<Licence | null>(null)
  const [key, setKey] = useState("")
  useEffect(() => {
    invoke<Licence | null>("licence_status").then(setLicence).catch(() => undefined)
  }, [])

  const until = licence
    ? new Date(licence.expires * 1000).toLocaleDateString()
    : null

  return (
    <>
      <section className="flex flex-col gap-3">
        <p className="text-xs font-medium text-muted-foreground">Licence</p>
        {licence ? (
          <SettingRow
            label={licence.active ? `Licensed to ${licence.name}` : "Licence expired"}
            description={
              licence.active
                ? `Updates until ${until}`
                : `Updates ended ${until}. Alcove keeps working; renew for newer versions.`
            }
          >
            {licence.active ? (
              <Badge variant="secondary">Active</Badge>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  invoke("open_desktop_item", { path: BUY_URL }).catch(() => undefined)
                }}
              >
                Renew
              </Button>
            )}
          </SettingRow>
        ) : (
          <>
            <SettingRow
              label="Alcove is free"
              description="A licence keeps it updated, and keeps it worked on"
            >
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  invoke("open_desktop_item", { path: BUY_URL }).catch(() => undefined)
                }}
              >
                Get one
              </Button>
            </SettingRow>
            <div className="flex items-center gap-2">
              <Input
                value={key}
                placeholder="Paste a licence key"
                spellCheck={false}
                onChange={(event) => setKey(event.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!key.trim()}
                onClick={() => {
                  invoke<Licence>("activate_licence", { key: key.trim() })
                    .then((next) => {
                      setLicence(next)
                      setKey("")
                      toast(`Thank you — Alcove is licensed to ${next.name}`)
                    })
                    .catch((err) => toast(typeof err === "string" ? err : String(err)))
                }}
              >
                Activate
              </Button>
            </div>
          </>
        )}
      </section>
      <Separator />
    </>
  )
}

function SystemTab(props: SettingsDialogProps) {
  const [winTaskbarHidden, setWinTaskbarHidden] = useState(false)
  const [autostartOn, setAutostartOn] = useState(false)
  useEffect(() => {
    if (!isTauri()) return
    invoke<boolean>("windows_taskbar_hidden")
      .then(setWinTaskbarHidden)
      .catch(() => undefined)
    invoke<boolean>("autostart_enabled")
      .then(setAutostartOn)
      .catch(() => undefined)
  }, [])

  const showDesktop = Boolean(props.onToggleDesktopLayer) || isTauri()

  return (
    <>
      {showDesktop ? (
        <>
          <section className="flex flex-col gap-3">
            <p className="text-xs font-medium text-muted-foreground">Desktop</p>
            {props.onToggleDesktopLayer ? (
              <SettingRow
                label="Use as the desktop"
                description="Alcove covers the Windows desktop instead of floating as a window"
              >
                <Switch
                  checked={Boolean(props.desktopAttached)}
                  onCheckedChange={props.onToggleDesktopLayer}
                />
              </SettingRow>
            ) : null}
            {isTauri() ? (
              <SettingRow
                label="Hide the Windows taskbar"
                description="Running apps stay on the taskbar — mouse to the screen edge to peek"
              >
                <Switch
                  checked={winTaskbarHidden}
                  onCheckedChange={(hidden) => {
                    invoke<boolean>("set_windows_taskbar_hidden", { hidden })
                      .then(setWinTaskbarHidden)
                      .catch((err) => {
                        toast(err instanceof Error ? err.message : String(err))
                      })
                  }}
                />
              </SettingRow>
            ) : null}
          </section>
          <Separator />
        </>
      ) : null}

      {isTauri() ? (
        <>
          <section className="flex flex-col gap-3">
            <p className="text-xs font-medium text-muted-foreground">Startup</p>
            <SettingRow
              label="Start when I sign in"
              description="Launch Alcove automatically at Windows sign-in"
            >
              <Switch
                checked={autostartOn}
                onCheckedChange={(enabled) => {
                  invoke<boolean>("set_autostart", { enabled })
                    .then(setAutostartOn)
                    .catch((err) => {
                      toast(err instanceof Error ? err.message : String(err))
                    })
                }}
              />
            </SettingRow>
          </section>
          <Separator />
        </>
      ) : null}

      {isTauri() ? <LicenceSection /> : null}

      {isTauri() ? (
        <>
          <section className="flex flex-col gap-3">
            <p className="text-xs font-medium text-muted-foreground">Updates</p>
            <SettingRow
              label="Check for updates"
              description="Alcove also looks once shortly after it starts"
            >
              <Button size="sm" variant="outline" onClick={checkForUpdate}>
                Check
              </Button>
            </SettingRow>
          </section>
          <Separator />
        </>
      ) : null}

      <section className="flex flex-col gap-3">
        <p className="text-xs font-medium text-muted-foreground">Maintenance</p>
        <SettingRow
          label={isTauri() ? "Desktop icons" : "Sample desktop"}
          description={
            isTauri()
              ? "Re-read the icons from your Windows desktop"
              : "Load the sample desktop"
          }
        >
          <Button size="sm" variant="outline" onClick={props.onLoadSample}>
            {isTauri() ? "Reload" : "Load"}
          </Button>
        </SettingRow>
        <SettingRow
          label="Inbox"
          description="Clear everything and start with an empty Inbox"
        >
          <Button size="sm" variant="outline" onClick={props.onStartEmpty}>
            Start empty
          </Button>
        </SettingRow>
        <SettingRow
          label="Test drop"
          description="Drop a sample file onto the desktop"
        >
          <Button size="sm" variant="outline" onClick={props.onDropIncoming}>
            Drop a file
          </Button>
        </SettingRow>
      </section>
    </>
  )
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm">{label}</p>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="inline-flex w-fit gap-0.5 rounded-[10px] bg-foreground/5 p-[3px]">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "h-[26px] rounded-lg px-3.5 text-[0.8rem] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            option.value === value
              ? "bg-foreground/15 text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
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
    <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border p-2">
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
                <StripToolGlyph tool={tool} size={18} />
                {tool.label}
              </label>
            )
          })}
        </div>
      ))}
    </div>
  )
}
