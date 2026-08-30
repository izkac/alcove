import { useEffect, useMemo, useRef, useState } from "react"
import { SearchOverlayCard } from "@/components/search-spotlight"
import { hydrateDesktopState, loadDesktopState } from "@/lib/storage"
import { invoke, isTauri } from "@/lib/tauri"
import type { Alcove, DesktopIcon, DesktopState } from "@/types"

function hide() {
  invoke("hide_search_window").catch(() => undefined)
}

export function SearchOverlay() {
  const [state, setState] = useState<DesktopState | null>(() => loadDesktopState())
  const [iconArt, setIconArt] = useState<Record<string, string>>({})
  const [session, setSession] = useState(0)

  useEffect(() => {
    void hydrateDesktopState().then((saved) => {
      if (saved) setState(saved)
    })
    const onStorage = () => setState(loadDesktopState())
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  useEffect(() => {
    if (!isTauri()) return
    invoke<{ id: string; imageUrl: string }[]>("list_desktop_icons")
      .then((list) =>
        setIconArt(Object.fromEntries(list.map((item) => [item.id, item.imageUrl]))),
      )
      .catch(() => undefined)
  }, [])

  const shownAt = useRef(0)

  useEffect(() => {
    function onFocus() {
      shownAt.current = Date.now()
      void hydrateDesktopState().then((saved) => {
        if (saved) setState(saved)
      })
      setSession((value) => value + 1)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        hide()
      }
    }
    function onBlur() {
      window.setTimeout(() => {
        if (document.hasFocus()) return
        if (Date.now() - shownAt.current < 400) return
        hide()
      }, 150)
    }
    window.addEventListener("focus", onFocus)
    window.addEventListener("keydown", onKey)
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("blur", onBlur)
    }
  }, [])

  const alcoves: Alcove[] = state?.alcoves ?? []
  const icons: DesktopIcon[] = useMemo(() => {
    if (!state) return []
    return state.icons.map((icon) => ({
      ...icon,
      imageUrl: icon.imageUrl ?? iconArt[icon.id],
    }))
  }, [state, iconArt])

  function pick(icon: DesktopIcon) {
    if (icon.path && isTauri()) {
      invoke("open_desktop_item", { path: icon.path }).catch(() => undefined)
    }
    hide()
  }

  return (
    <div
      className="box-border h-full bg-transparent p-3"
      onClick={() => hide()}
    >
      <div
        className="flex h-full flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-2xl ring-1 ring-white/15"
        onClick={(event) => event.stopPropagation()}
      >
        <SearchOverlayCard
          key={session}
          icons={icons}
          alcoves={alcoves}
          onSelect={pick}
        />
      </div>
    </div>
  )
}
