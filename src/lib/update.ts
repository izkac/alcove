import { useEffect } from "react"
import { toast } from "sonner"
import { invoke, isTauri } from "./tauri.ts"

/** Long enough that the desk is drawn and settled before we touch the network. */
const CHECK_DELAY_MS = 20_000

/**
 * Download the new build and restart into it. Rust hands the desktop back to
 * Explorer first, so the gap between the two processes is not an empty desktop.
 */
export function installUpdate() {
  toast("Downloading update…", { id: "alcove-update" })
  invoke("install_update").catch((error) => {
    toast(typeof error === "string" ? error : "Could not install the update", {
      id: "alcove-update",
    })
  })
}

function offer(version: string) {
  toast(`Alcove ${version} is available`, {
    id: "alcove-update",
    duration: Infinity,
    action: { label: "Install", onClick: installUpdate },
  })
}

/** Look now. Used by the Settings button, where silence would read as broken. */
export function checkForUpdate() {
  if (!isTauri()) return
  invoke<string | null>("update_available")
    .then((available) => {
      if (available) offer(available)
      else toast("Alcove is up to date", { id: "alcove-update" })
    })
    .catch(() => toast("Could not reach the update feed", { id: "alcove-update" }))
}

/**
 * One quiet check per run, on the primary desk only: every monitor renders its
 * own copy of the shell, and three identical toasts is not three times the news.
 * A failed check says nothing — being offline is not an event worth a popup.
 */
export function useUpdateCheck(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !isTauri()) return
    let alive = true
    const timer = window.setTimeout(() => {
      invoke<string | null>("update_available")
        .then((available) => {
          if (alive && available) offer(available)
        })
        .catch(() => undefined)
    }, CHECK_DELAY_MS)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [enabled])
}
