import { useEffect, useMemo, useState } from "react"
import { IconGlyph } from "@/components/icon-glyph"
import { invoke, isTauri } from "@/lib/tauri"
import { cn } from "@/lib/utils"
import type { DesktopIcon } from "@/types"
import { AppWindow } from "lucide-react"

type RunningApp = {
  hwnd: number
  title: string
  exePath: string
  iconUrl: string | null
  foreground: boolean
}

type AppGroup = {
  exePath: string
  iconUrl: string | null
  windows: RunningApp[]
}

function RunningApps({ active }: { active: boolean }) {
  const [apps, setApps] = useState<RunningApp[]>([])

  useEffect(() => {
    if (!isTauri() || !active) return
    let alive = true
    let pending = false
    const tick = () => {
      // Native visibility drives `active`; the non-activating bar does not
      // depend on WebView2 updating document.hidden before its first poll.
      if (pending) return
      pending = true
      invoke<RunningApp[]>("list_running_windows")
        .then((list) => {
          if (alive) setApps(list)
        })
        .catch(() => undefined)
        .finally(() => { pending = false })
    }
    tick()
    const timer = window.setInterval(tick, 2500)
    document.addEventListener("visibilitychange", tick)
    return () => {
      alive = false
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [active])

  const groups = useMemo(() => {
    const map = new Map<string, AppGroup>()
    for (const app of apps) {
      const group = map.get(app.exePath)
      if (group) group.windows.push(app)
      else
        map.set(app.exePath, {
          exePath: app.exePath,
          iconUrl: app.iconUrl,
          windows: [app],
        })
    }
    return [...map.values()]
  }, [apps])

  function activate(group: AppGroup) {
    const index = group.windows.findIndex((win) => win.foreground)
    const target = group.windows[(index + 1) % group.windows.length]
    invoke("activate_window", { hwnd: target.hwnd }).catch(() => undefined)
  }

  if (groups.length === 0) return null
  return (
    <>
      {groups.map((group) => {
        const active = group.windows.some((win) => win.foreground)
        const count = group.windows.length
        return (
          <button
            key={group.exePath}
            type="button"
            title={
              count > 1
                ? `${group.windows[0].title} (+${count - 1} more)`
                : group.windows[0].title
            }
            onClick={() => activate(group)}
            className={cn(
              "relative flex size-10 shrink-0 items-center justify-center rounded-xl outline-none transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-sel",
              active && "bg-surface-2",
            )}
          >
            {group.iconUrl ? (
              <img
                src={group.iconUrl}
                alt=""
                className="size-[30px]"
                draggable={false}
              />
            ) : (
              <AppWindow className="size-[26px] text-ink-muted" strokeWidth={1.5} />
            )}
            <span className="absolute bottom-0.5 left-1/2 flex -translate-x-1/2 gap-0.5">
              <span
                className={cn(
                  "h-1 rounded-full transition-all",
                  active ? "w-4 bg-sel" : "w-1 bg-ink-faint",
                )}
              />
              {count > 1 ? (
                <span className="h-1 w-1 rounded-full bg-ink-faint" />
              ) : null}
            </span>
          </button>
        )
      })}
    </>
  )
}

export function Dock({
  pinnedIcons,
  onOpenIcon,
  active = true,
}: {
  pinnedIcons: DesktopIcon[]
  onOpenIcon: (icon: DesktopIcon) => void
  active?: boolean
}) {
  return (
    <div
      data-pin-rail=""
      className="flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-xl px-1"
    >
      {pinnedIcons.map((icon) => (
        <button
          key={icon.id}
          type="button"
          title={icon.name}
          data-launch-pulse={icon.id}
          onClick={() => onOpenIcon(icon)}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl outline-none transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-sel"
        >
          <IconGlyph icon={icon} size={30} />
        </button>
      ))}
      {pinnedIcons.length > 0 ? (
        <span className="mx-1 h-6 w-px shrink-0 bg-hairline" />
      ) : null}
      <RunningApps active={active} />
    </div>
  )
}
