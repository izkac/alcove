import { useEffect, useMemo, useState } from "react"
import { Dock } from "@/components/taskbar"
import { hydrateDesktopState, loadDesktopState } from "@/lib/storage"
import { invoke, isTauri } from "@/lib/tauri"
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
    const timer = window.setInterval(
      () =>
        setClock(
          new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        ),
      1000,
    )
    return () => {
      window.removeEventListener("storage", onStorage)
      window.clearInterval(timer)
    }
  }, [])

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
      invoke("open_desktop_item", { path: icon.path }).catch(() => undefined)
    }
  }

  return (
    <div className="flex h-svh items-center gap-2 border-t border-white/10 bg-zinc-950/85 px-3 text-white backdrop-blur-xl">
      <button
        type="button"
        title="Show the desktop"
        onClick={() => invoke("focus_desktop").catch(() => undefined)}
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15 transition hover:bg-white/25"
      >
        <SquareStack className="size-5" />
      </button>
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <Dock pinnedIcons={pinnedIcons} onOpenIcon={openIcon} />
      </div>
      <span className="shrink-0 px-1.5 text-xs tabular-nums text-white/80">
        {clock}
      </span>
    </div>
  )
}
