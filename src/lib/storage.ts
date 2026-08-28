import type { DesktopState } from "@/types"

const STORAGE_KEY = "alcove.desktop.v1"

export function loadDesktopState(): DesktopState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as DesktopState
  } catch {
    return null
  }
}

export function saveDesktopState(state: DesktopState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.error("Could not save Alcove desktop", error)
  }
}

export function clearDesktopState() {
  localStorage.removeItem(STORAGE_KEY)
}
