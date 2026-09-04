import { useEffect, useMemo, useState } from "react"
import { Dock } from "@/components/taskbar"
import { hydrateDesktopState, loadDesktopState } from "@/lib/storage"
import { invoke, isTauri } from "@/lib/tauri"
import { applyText, applyTone, followDeskTheme } from "@/lib/wallpaper"
import { pulseLaunch } from "@/lib/launch-pulse"
import type { DesktopIcon } from "@/types"
import { SquareStack } from "lucide-react"

// Slim always-on-top window summoned at the bottom screen edge while the
// Windows taskbar is hidden. Read-only view of the desktop state.
export function BarStrip() {
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
    const timer = window.setInterval(
      () =>
        setClock(
          new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        ),
      1000,
    )
    return () => {
      window.removeEventListener("storage", onStorage)
      stopTheme()
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    applyTone(state?.surfaceTone ?? "tinted")
    applyText(state?.textSize ?? "default", state?.strongText === true)
  }, [state?.surfaceTone, state?.textSize, state?.strongText])

  // Saved state drops imageUrl to stay small; fetch real icon art directly.
  const [iconArt, setIconArt] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!isTauri()) return
    invoke<{ id: string; imageUrl: string }[]>("list_desktop_icons")
      .then((list) =>
        setIconArt(Object.fromEntries(list.map((item) => [item.id, item.imageUrl]))),
      )
      .catch(() => undefined)
  }, [])

  const pinnedIcons = useMemo(() => {
    if (!state) return []
    return state.pinIds
      .map((id) => state.icons.find((icon) => icon.id === id))
      .filter((icon): icon is DesktopIcon => Boolean(icon))
      .map((icon) => ({ ...icon, imageUrl: icon.imageUrl ?? iconArt[icon.id] }))
  }, [state, iconArt])

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
        <Dock pinnedIcons={pinnedIcons} onOpenIcon={openIcon} />
      </div>
      <span className="shrink-0 px-1.5 text-meta text-ink-muted">
        {clock}
      </span>
    </div>
  )
}
