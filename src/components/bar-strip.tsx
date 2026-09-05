import { useEffect, useMemo, useState } from "react"
import { Dock } from "@/components/taskbar"
import { hydrateDesktopState, loadDesktopState } from "@/lib/storage"
import { invoke } from "@/lib/tauri"
import { useWindowVisible } from "@/hooks/use-window-visible"
import { applyText, applyTone, followDeskTheme } from "@/lib/wallpaper"
import { pulseLaunch } from "@/lib/launch-pulse"
import type { DesktopIcon } from "@/types"
import { SquareStack } from "lucide-react"

// Slim always-on-top window summoned at the bottom screen edge while the
// Windows taskbar is hidden. Read-only view of the desktop state.
export function BarStrip() {
  const visible = useWindowVisible()
  const [state, setState] = useState(loadDesktopState)
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
  )

  useEffect(() => {
    void hydrateDesktopState().then((saved) => {
      if (saved) setState(saved)
    })
    const onStorage = () => setState(loadDesktopState())
    window.addEventListener("storage", onStorage)
    const stopTheme = followDeskTheme()
    return () => {
      window.removeEventListener("storage", onStorage)
      stopTheme()
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    let alive = true
    void hydrateDesktopState().then((saved) => {
      if (alive && saved) setState(saved)
    })
    const tick = () => setClock(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))
    tick()
    const timer = window.setInterval(
      () =>
        setClock(
          new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        ),
      10000,
    )
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [visible])

  useEffect(() => {
    applyTone(state?.surfaceTone ?? "tinted")
    applyText(state?.textSize ?? "default", state?.strongText === true)
  }, [state?.surfaceTone, state?.textSize, state?.strongText])

  const pinnedIcons = useMemo(() => {
    if (!state) return []
    return state.pinIds
      .map((id) => state.icons.find((icon) => icon.id === id))
      .filter((icon): icon is DesktopIcon => Boolean(icon))
  }, [state])

  function openIcon(icon: DesktopIcon) {
    if (icon.path) {
      pulseLaunch(icon.id)
      invoke("open_desktop_item", { path: icon.path }).catch(() => undefined)
    }
  }

  return (
    <div className="flex h-svh items-center gap-2 border-t border-hairline bg-surface px-3 text-ink">
      <button
        type="button"
        title="Show the desktop"
        aria-label="Show the desktop"
        onClick={() => invoke("focus_desktop").catch(() => undefined)}
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-muted outline-none transition-colors duration-150 hover:bg-surface-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-sel"
      >
        <SquareStack className="size-5" />
      </button>
      <div className="flex min-w-0 flex-1 items-center justify-center">
        {visible && <Dock pinnedIcons={pinnedIcons} onOpenIcon={openIcon} active={visible} />}
      </div>
      <span className="shrink-0 px-1.5 text-meta text-ink-muted">
        {clock}
      </span>
    </div>
  )
}
