import { useEffect } from "react"
import { toast } from "sonner"
import { invoke, isTauri } from "./tauri.ts"

/** Long enough that the desk is drawn and settled before we touch the network. */
const CHECK_DELAY_MS = 20_000

/** Alcove has to have earned its keep before it asks for anything. */
const NUDGE_AFTER_DAYS = 30

export const BUY_URL = "https://github.com/izkac/alcove#licence"

export type Available = { version: string; licensed: boolean }
export type Licence = { name: string; expires: number; active: boolean }

function openBuyPage() {
  if (isTauri()) invoke("open_desktop_item", { path: BUY_URL }).catch(() => undefined)
  else window.open(BUY_URL, "_blank", "noopener")
}

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

function offer({ version, licensed }: Available) {
  // Unlicensed installs are told too. The version they have keeps working, so
  // this is news rather than a lockout, and pretending otherwise would be the
  // dishonest half of a paywall.
  toast(`Alcove ${version} is available`, {
    id: "alcove-update",
    duration: Infinity,
    description: licensed ? undefined : "Updates are part of a licence",
    action: licensed
      ? { label: "Install", onClick: installUpdate }
      : { label: "Get a licence", onClick: openBuyPage },
  })
}

/** Look now. Used by the Settings button, where silence would read as broken. */
export function checkForUpdate() {
  if (!isTauri()) return
  invoke<Available | null>("update_available")
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
      invoke<Available | null>("update_available")
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

export function shouldNudge(
  firstRunAt: number | undefined,
  nudgedAt: number | null | undefined,
  now: number,
): boolean {
  if (!firstRunAt || nudgedAt) return false
  return now - firstRunAt >= NUDGE_AFTER_DAYS * 24 * 60 * 60 * 1000
}

/**
 * The single ask. Not at startup — Alcove starts with Windows and is the first
 * thing you see, and a daily popup there is what bundled junk does. This waits
 * a month, fires once, and never returns whether or not it is acted on.
 */
export function useLicenceNudge(
  enabled: boolean,
  firstRunAt: number | undefined,
  nudgedAt: number | null | undefined,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!enabled || !isTauri()) return
    if (!shouldNudge(firstRunAt, nudgedAt, Date.now())) return
    let alive = true
    const timer = window.setTimeout(() => {
      invoke<Licence | null>("licence_status")
        .then((licence) => {
          if (!alive || licence?.active) return
          onDismiss()
          toast("Enjoying Alcove?", {
            id: "alcove-licence",
            duration: Infinity,
            description:
              "It stays free and complete. A licence keeps it updated — and keeps it worked on.",
            action: { label: "Take a look", onClick: openBuyPage },
          })
        })
        .catch(() => undefined)
    }, CHECK_DELAY_MS * 2)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [enabled, firstRunAt, nudgedAt, onDismiss])
}
