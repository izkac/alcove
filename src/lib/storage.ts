import { toast } from "sonner"

import { clampSlotCount, resizeSlots } from "@/lib/frecency"
import { invoke, isTauri } from "@/lib/tauri"
import { migrateStripToolIds } from "@/lib/strip-tools"
import {
  FOLDER_VIEWS,
  SURFACE_TONES,
  TEXT_SIZES,
  type DesktopState,
  type FolderView,
  type SurfaceTone,
  type TextSize,
} from "@/types"

const STORAGE_KEY = "alcove.desktop.v1"

/** Fills in fields added after a state was saved, so old saves still load. */
function migrate(state: DesktopState): DesktopState {
  const slots = state.topSlots ?? []
  return {
    ...state,
    alcoves: state.alcoves.map((alcove) => ({
      ...alcove,
      groups: alcove.groups ?? [],
      folderView: FOLDER_VIEWS.includes(alcove.folderView as FolderView)
        ? alcove.folderView
        : undefined,
      stripId: alcove.stripId ?? null,
    })),
    icons: state.icons.map((icon) => ({
      ...icon,
      groupId: icon.groupId ?? null,
    })),
    frecency: state.frecency ?? {},
    topSlotCount: clampSlotCount(state.topSlotCount),
    topSlots: resizeSlots(slots, state.topSlotCount),
    topKeep: state.topKeep ?? [],
    topHide: state.topHide ?? [],
    stripEdge: state.stripEdge === "bottom" ? "bottom" : "top",
    surfaceTone: SURFACE_TONES.includes(state.surfaceTone as SurfaceTone)
      ? state.surfaceTone
      : "tinted",
    textSize: TEXT_SIZES.includes(state.textSize as TextSize)
      ? state.textSize
      : "default",
    strongText: state.strongText === true,
    stripToolIds: migrateStripToolIds(state.stripToolIds),
  }
}

export function parseDesktopState(raw: string): DesktopState | null {
  try {
    return migrate(JSON.parse(raw) as DesktopState)
  } catch {
    return null
  }
}

export function loadDesktopState(): DesktopState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return parseDesktopState(raw)
  } catch {
    return null
  }
}

function serialize(state: DesktopState): string {
  const slim: DesktopState = {
    ...state,
    icons: state.icons.map(({ imageUrl: _imageUrl, ...icon }) => icon),
  }
  return JSON.stringify(slim)
}

export function saveDesktopState(state: DesktopState) {
  try {
    localStorage.setItem(STORAGE_KEY, serialize(state))
  } catch (error) {
    console.error("Could not save Alcove desktop", error)
  }
}

export async function hydrateDesktopState(): Promise<DesktopState | null> {
  if (isTauri()) {
    try {
      const raw = await invoke<string | null>("load_desktop_state")
      const parsed = raw ? parseDesktopState(raw) : null
      if (parsed) return parsed
    } catch (error) {
      console.error("Could not load Alcove desktop from disk", error)
    }
  }
  return loadDesktopState()
}

export async function persistDesktopState(state: DesktopState) {
  const json = serialize(state)
  try {
    localStorage.setItem(STORAGE_KEY, json)
  } catch (error) {
    console.error("Could not save Alcove desktop", error)
  }
  if (!isTauri()) return
  try {
    await invoke("save_desktop_state", { json })
    warnedAboutDisk = false
  } catch (error) {
    console.error("Could not save Alcove desktop to disk", error)
    if (!warnedAboutDisk) {
      warnedAboutDisk = true
      toast("Alcove cannot save to disk; this session's changes may be lost", {
        id: "alcove-save-failed",
      })
    }
  }
}

/** One complaint per outage, not one per keystroke. */
let warnedAboutDisk = false

export function subscribeDesktopState(
  onChange: (state: DesktopState) => void,
): () => void {
  function onStorage(event: StorageEvent) {
    if (event.key !== STORAGE_KEY || !event.newValue) return
    try {
      onChange(migrate(JSON.parse(event.newValue) as DesktopState))
    } catch {
      // ignore a corrupt write from another window
    }
  }
  window.addEventListener("storage", onStorage)
  return () => window.removeEventListener("storage", onStorage)
}

export function clearDesktopState() {
  localStorage.removeItem(STORAGE_KEY)
}
