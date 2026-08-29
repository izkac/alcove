import { TOP_SLOTS } from "@/lib/frecency"
import type { DesktopState } from "@/types"

const STORAGE_KEY = "alcove.desktop.v1"

/** Fills in fields added after a state was saved, so old saves still load. */
function migrate(state: DesktopState): DesktopState {
  const slots = state.topSlots ?? []
  return {
    ...state,
    alcoves: state.alcoves.map((alcove) => ({
      ...alcove,
      groups: alcove.groups ?? [],
    })),
    icons: state.icons.map((icon) => ({
      ...icon,
      groupId: icon.groupId ?? null,
    })),
    frecency: state.frecency ?? {},
    topSlots: Array.from({ length: TOP_SLOTS }, (_, index) => slots[index] ?? null),
    topKeep: state.topKeep ?? [],
    topHide: state.topHide ?? [],
  }
}

export function loadDesktopState(): DesktopState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return migrate(JSON.parse(raw) as DesktopState)
  } catch {
    return null
  }
}

export function saveDesktopState(state: DesktopState) {
  try {
    const slim: DesktopState = {
      ...state,
      icons: state.icons.map(({ imageUrl: _imageUrl, ...icon }) => icon),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim))
  } catch (error) {
    console.error("Could not save Alcove desktop", error)
  }
}

export function clearDesktopState() {
  localStorage.removeItem(STORAGE_KEY)
}
