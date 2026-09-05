import { useEffect, useMemo, useRef, useState } from "react"
import { SearchOverlayCard } from "@/components/search-spotlight"
import { useWindowVisible } from "@/hooks/use-window-visible"
import { deskChannel, type DeskChannelMessage } from "@/lib/desk-strip"
import { parentPath } from "@/lib/search-hits"
import { hydrateDesktopState, loadDesktopState } from "@/lib/storage"
import { invoke, isTauri } from "@/lib/tauri"
import { applyText, applyTone, followDeskTheme } from "@/lib/wallpaper"
import type { LauncherPick } from "@/components/search-spotlight"
import type { Alcove, DesktopIcon, DesktopState } from "@/types"

function hide() {
  invoke("hide_search_window").catch(() => undefined)
}

/**
 * Says what happened and lets the desks decide. This window holds a read-only
 * copy of the state, so it must never write it back — that would clobber
 * whatever the desks changed meanwhile — and it owns none of the dialogs.
 */
function tellDesks(message: DeskChannelMessage) {
  const channel = deskChannel()
  if (!channel) return
  channel.postMessage(message)
  channel.close()
}

export function SearchOverlay() {
  const visible = useWindowVisible()
  const [state, setState] = useState<DesktopState | null>(() => loadDesktopState())
  const [session, setSession] = useState(0)

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

  useEffect(() => {
    applyTone(state?.surfaceTone ?? "tinted")
    applyText(state?.textSize ?? "default", state?.strongText === true)
  }, [state?.surfaceTone, state?.textSize, state?.strongText])

  const alcoves: Alcove[] = state?.alcoves ?? []
  const icons: DesktopIcon[] = useMemo(() => {
    if (!state) return []
    return state.icons
  }, [state])

  function openIcon(icon: DesktopIcon, how: "open" | "reveal" | "folder") {
    if (!icon.path || !isTauri()) return
    if (how === "reveal") {
      invoke("reveal_desktop_item", { path: icon.path }).catch(() => undefined)
      return
    }
    if (how === "folder") {
      const parent = parentPath(icon.path)
      if (parent) invoke("open_desktop_item", { path: parent }).catch(() => undefined)
      return
    }
    invoke("open_desktop_item", { path: icon.path }).catch(() => undefined)
    // Only a real open counts as an open; revealing a file is not using it.
    tellDesks({ type: "icon-launched", iconId: icon.id })
  }

  function pick(chosen: LauncherPick) {
    if (chosen.kind === "icon") openIcon(chosen.icon, chosen.how)
    if (chosen.kind === "window" && isTauri()) {
      invoke("activate_window", { hwnd: chosen.app.hwnd }).catch(() => undefined)
    }
    if (chosen.kind === "alcove") {
      tellDesks({ type: "desk-command", command: "open-alcove", alcoveId: chosen.alcove.id })
    }
    if (chosen.kind === "command") {
      tellDesks({ type: "desk-command", command: chosen.command })
    }
    if (chosen.kind === "target" && isTauri()) {
      invoke("open_desktop_item", { path: chosen.target }).catch(() => undefined)
    }
    hide()
  }

  return (
    <div
      className="box-border h-full bg-transparent p-3"
      onClick={() => hide()}
    >
      <div
        data-slot="search-card"
        className="flex h-full flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-pop ring-1 ring-hairline"
        onClick={(event) => event.stopPropagation()}
      >
        {visible && <SearchOverlayCard
          key={session}
          open={visible}
          icons={icons}
          alcoves={alcoves}
          frecency={state?.frecency}
          hide={state?.topHide}
          onPick={pick}
        />}
      </div>
    </div>
  )
}
