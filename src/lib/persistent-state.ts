import type { DesktopState } from "../types.ts"
import { stripRemovable } from "./removable-drawers.ts"

const transient = new Set(["focusedAlcoveId", "highlightedIconId"])

/** Skip serialization entirely when only temporary view state changed. */
export function samePersistentState(a: DesktopState, b: DesktopState): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (!transient.has(key) && a[key as keyof DesktopState] !== b[key as keyof DesktopState]) return false
  }
  return true
}

export function serializeDesktopState(state: DesktopState): string {
  const clean = stripRemovable(state)
  return JSON.stringify({
    ...clean,
    focusedAlcoveId: null,
    highlightedIconId: null,
    icons: clean.icons.map(({ imageUrl: _imageUrl, ...icon }) => icon),
  })
}
