/**
 * Turns the removable-drive list Rust reports every poll into drawer Alcoves,
 * and keeps `desktop.json` from ever remembering one. Pure: no Tauri, no React.
 */
// Relative, not "@/", and from the plain-.ts glyph core rather than the
// JSX-bearing alcove-glyphs.tsx: this module has to run under plain `node`
// for its self-check, which cannot resolve the "@/" alias or parse JSX.
import { ALCOVE_COLOR_IDS } from "../types.ts"
import type { Alcove, AlcoveColor, DesktopState, LayoutId, RemovableDrive } from "../types.ts"
import { INBOX_ID } from "../data/sample.ts"
import { defaultAlcoveGlyph } from "./alcove-glyphs-core.ts"

/** Drive roots come back as `"E:\\"` or `"E:"`; compare them the same way. */
export function normalizeDriveRoot(root: string): string {
  return root.trim().toUpperCase().replace(/\\+$/, "")
}

/** Cheap string hash so the same drive root always lands on the same colour. */
function hashRoot(root: string): number {
  let hash = 0
  for (let i = 0; i < root.length; i += 1) {
    hash = (hash * 31 + root.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function colorForRoot(root: string): AlcoveColor {
  return ALCOVE_COLOR_IDS[hashRoot(normalizeDriveRoot(root)) % ALCOVE_COLOR_IDS.length]
}

function dropIds(
  snap: Record<string, boolean>,
  ids: Set<string>,
): Record<string, boolean> {
  if (ids.size === 0) return snap
  const next = { ...snap }
  for (const id of ids) delete next[id]
  return next
}

/**
 * Drops whole drawers: the Alcoves, their icons, the desk cells those icons
 * were parked on, and their layout-snapshot entries. Parking is the easy one
 * to miss — an icon dragged out of a USB drawer onto the wallpaper leaves a
 * `pinAt` cell behind, and `parkIcons` reads `pinAt` to find free cells, so a
 * stale entry blocks that cell for good with nothing drawn in it.
 */
function dropAlcoves(state: DesktopState, removeIds: Set<string>): DesktopState {
  if (removeIds.size === 0) return state
  const goneIconIds = new Set(
    state.icons
      .filter((icon) => icon.alcoveId && removeIds.has(icon.alcoveId))
      .map((icon) => icon.id),
  )
  const pinAt = { ...(state.pinAt ?? {}) }
  for (const id of goneIconIds) delete pinAt[id]
  return {
    ...state,
    alcoves: state.alcoves.filter((alcove) => !removeIds.has(alcove.id)),
    icons: state.icons.filter((icon) => !goneIconIds.has(icon.id)),
    pinIds: state.pinIds.filter((id) => !goneIconIds.has(id)),
    pinAt,
    layoutSnapshots: {
      work: dropIds(state.layoutSnapshots.work, removeIds),
      home: dropIds(state.layoutSnapshots.home, removeIds),
      clean: dropIds(state.layoutSnapshots.clean, removeIds),
    },
    // Matches every other removal path in the app: focus falls back to the
    // Inbox rather than to nothing.
    focusedAlcoveId:
      state.focusedAlcoveId && removeIds.has(state.focusedAlcoveId)
        ? INBOX_ID
        : state.focusedAlcoveId,
  }
}

/** Drops one drawer, by id. The eject path's whole state update. */
export function dropDriveDrawer(state: DesktopState, alcoveId: string): DesktopState {
  if (!state.alcoves.some((alcove) => alcove.id === alcoveId)) return state
  return dropAlcoves(state, new Set([alcoveId]))
}

/**
 * Removes every removable drawer, its icons, and its layout-snapshot entries.
 * Shared by the disabled-feature path here and by storage's save/migrate, so
 * a stray removable drawer can never survive a write or a reload.
 */
export function stripRemovable(state: DesktopState): DesktopState {
  return dropAlcoves(
    state,
    new Set(state.alcoves.filter((alcove) => alcove.removable).map((alcove) => alcove.id)),
  )
}

/**
 * A new drawer starts expanded only in the layout open right now — the same
 * rule `createAlcove` uses — and always collapsed in Clean, which exists to
 * hide everything.
 */
function withAdded(
  layoutId: LayoutId,
  currentLayoutId: LayoutId,
  snap: Record<string, boolean>,
  added: Alcove[],
): Record<string, boolean> {
  if (added.length === 0) return snap
  const next = { ...snap }
  for (const alcove of added) {
    next[alcove.id] = layoutId === "clean" ? true : currentLayoutId !== layoutId
  }
  return next
}

/**
 * Reconciles the removable drawers in `state.alcoves` against the drives Rust
 * currently reports. Runs on a 2s poll, so it must return the SAME object
 * (not just an equal one) when nothing changed — otherwise every tick would
 * re-render the desk and re-save state that never actually moved.
 */
export function syncDriveDrawers(
  state: DesktopState,
  drives: RemovableDrive[],
  enabled: boolean,
): DesktopState {
  if (!enabled) return stripRemovable(state)

  const driveByRoot = new Map(drives.map((drive) => [normalizeDriveRoot(drive.root), drive]))
  const present = new Set<string>()
  const removeIds = new Set<string>()
  let renamed = false

  for (const alcove of state.alcoves) {
    if (!alcove.removable) continue
    const key = normalizeDriveRoot(alcove.removable)
    const drive = driveByRoot.get(key)
    if (!drive) {
      removeIds.add(alcove.id)
      continue
    }
    present.add(key)
    if (drive.name !== alcove.name) renamed = true
  }

  const toAdd = drives.filter((drive) => !present.has(normalizeDriveRoot(drive.root)))

  if (removeIds.size === 0 && !renamed && toAdd.length === 0) return state

  const kept = dropAlcoves(state, removeIds)

  let order = kept.alcoves.reduce((max, alcove) => Math.max(max, alcove.order), 0)
  const added: Alcove[] = toAdd.map((drive) => {
    order += 1
    return {
      id: crypto.randomUUID(),
      name: drive.name,
      color: colorForRoot(drive.root),
      glyph: defaultAlcoveGlyph(drive.root, drive.name),
      collapsed: false,
      isInbox: false,
      order,
      page: 0,
      folderPath: drive.root,
      removable: drive.root,
    }
  })

  const alcoves = kept.alcoves
    .map((alcove) => {
      if (!alcove.removable) return alcove
      const drive = driveByRoot.get(normalizeDriveRoot(alcove.removable))
      return drive && drive.name !== alcove.name ? { ...alcove, name: drive.name } : alcove
    })
    .concat(added)

  return {
    ...kept,
    alcoves,
    layoutSnapshots: {
      work: withAdded("work", state.layoutId, kept.layoutSnapshots.work, added),
      home: withAdded("home", state.layoutId, kept.layoutSnapshots.home, added),
      clean: withAdded("clean", state.layoutId, kept.layoutSnapshots.clean, added),
    },
  }
}
