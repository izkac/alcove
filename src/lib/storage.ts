import { toast } from "sonner"

import { clampSlotCount, resizeSlots } from "@/lib/frecency"
import { invoke, isTauri } from "@/lib/tauri"
import { stripRemovable } from "@/lib/removable-drawers"
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
  // A removable drawer is never meant to be saved, but an older build or a
  // hand-edited file could still hand us one — drop it before anything else
  // touches alcoves/icons/layoutSnapshots below.
  const stripped = stripRemovable(state)
  return {
    ...stripped,
    alcoves: stripped.alcoves.map((alcove) => ({
      ...alcove,
      groups: alcove.groups ?? [],
      folderView: FOLDER_VIEWS.includes(alcove.folderView as FolderView)
        ? alcove.folderView
        : undefined,
      stripId: alcove.stripId ?? null,
      removable: alcove.removable ?? null,
    })),
    icons: stripped.icons.map((icon) => ({
      ...icon,
      groupId: icon.groupId ?? null,
    })),
    frecency: stripped.frecency ?? {},
    topSlotCount: clampSlotCount(stripped.topSlotCount),
    topSlots: resizeSlots(slots, stripped.topSlotCount),
    topKeep: stripped.topKeep ?? [],
    topHide: stripped.topHide ?? [],
    stripEdge: stripped.stripEdge === "bottom" ? "bottom" : "top",
    surfaceTone: SURFACE_TONES.includes(stripped.surfaceTone as SurfaceTone)
      ? stripped.surfaceTone
      : "tinted",
    textSize: TEXT_SIZES.includes(stripped.textSize as TextSize)
      ? stripped.textSize
      : "default",
    strongText: stripped.strongText === true,
    stripToolIds: migrateStripToolIds(stripped.stripToolIds),
    autoDriveDrawers: stripped.autoDriveDrawers ?? true,
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
  // Removable drawers are a live mirror of whatever is plugged in right now;
  // a drive that was here last Tuesday must not come back as an empty drawer.
  const clean = stripRemovable(state)
  const slim: DesktopState = {
    ...clean,
    icons: clean.icons.map(({ imageUrl: _imageUrl, ...icon }) => icon),
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
