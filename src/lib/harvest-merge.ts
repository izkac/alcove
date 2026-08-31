import { ICON_KINDS } from "../types.ts"
import type { Alcove, DesktopIcon, DesktopState, IconKind } from "../types.ts"

export type HarvestedIcon = {
  id: string
  name: string
  kind: string
  extension?: string
  groupHint: string
  path: string
  imageUrl: string
  byteSize?: number | null
  modifiedAt?: number | null
}

function asKind(kind: string): IconKind {
  return (ICON_KINDS as readonly string[]).includes(kind)
    ? (kind as IconKind)
    : "document"
}

export function toDesktopIcon(
  harvested: HarvestedIcon,
  alcoveId: string | null,
  groupId: string | null = null,
): DesktopIcon {
  return {
    id: harvested.id,
    name: harvested.name,
    kind: asKind(harvested.kind),
    extension: harvested.extension,
    alcoveId,
    groupHint: harvested.groupHint,
    path: harvested.path,
    imageUrl: harvested.imageUrl,
    byteSize: harvested.byteSize ?? null,
    modifiedAt: harvested.modifiedAt ?? null,
    groupId,
  }
}

function groupStillThere(alcoves: Alcove[], alcoveId: string | null, groupId: string | null) {
  if (!alcoveId || !groupId) return false
  const alcove = alcoves.find((item) => item.id === alcoveId)
  return Boolean(alcove?.groups?.some((group) => group.id === groupId))
}

export function folderLeaf(path: string) {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path
}

/** True only for the in-browser mock. Harvest must not use this to wipe a real layout. */
export function isSampleMock(state: {
  phase: string
  icons: { path?: string }[]
}): boolean {
  return (
    state.phase === "onboarding" &&
    state.icons.length > 0 &&
    state.icons.every((icon) => !icon.path)
  )
}

export function liveAlcoveIds(alcoves: Alcove[]): Set<string> {
  return new Set(
    alcoves.filter((alcove) => alcove.folderPath).map((alcove) => alcove.id),
  )
}


type Fingerprintable = {
  byteSize?: number | null
  modifiedAt?: number | null
}

/**
 * Length plus last-write time. A rename or a move changes neither, and the icon
 * id is the file path — so without this, renaming a file in Explorer makes its
 * old id vanish, a new one appear, and every bit of filing the user did land
 * back in the Inbox.
 */
function fingerprint(item: Fingerprintable): string | null {
  if (item.byteSize == null || item.modifiedAt == null) return null
  return `${item.byteSize}:${item.modifiedAt}`
}

/** Fingerprints claimed by exactly one item. Ambiguity is dropped, not guessed. */
function uniquePrints<T extends Fingerprintable>(items: T[]): Map<string, T> {
  const seen = new Map<string, T>()
  const collisions = new Set<string>()
  for (const item of items) {
    const print = fingerprint(item)
    if (!print) continue
    if (seen.has(print)) collisions.add(print)
    else seen.set(print, item)
  }
  for (const print of collisions) seen.delete(print)
  return seen
}

/**
 * New path -> the icon it used to be, for files renamed or moved outside
 * Alcove. Only one-to-one matches count: two files sharing a size and a
 * timestamp are left alone rather than swapped by a coin flip. Folders have no
 * size, so they are never matched.
 */
export function renameMap(
  priors: DesktopIcon[],
  harvested: HarvestedIcon[],
): Map<string, DesktopIcon> {
  const harvestedPaths = new Set(harvested.map((item) => item.path))
  const priorPaths = new Set(priors.map((icon) => icon.path))
  const gone = uniquePrints(priors.filter((icon) => !harvestedPaths.has(icon.path ?? "")))
  const fresh = uniquePrints(harvested.filter((item) => !priorPaths.has(item.path)))
  const out = new Map<string, DesktopIcon>()
  for (const [print, item] of fresh) {
    const prior = gone.get(print)
    if (prior) out.set(item.path, prior)
  }
  return out
}

/**
 * Carry every id-keyed list across a rename. Pins, frequent-strip slots and
 * frecency history are all keyed by path too, so they die with the old id
 * unless they are moved over with it.
 */
function carryIds(state: DesktopState, renamed: Map<string, DesktopIcon>): DesktopState {
  if (renamed.size === 0) return state
  const toNew = new Map<string, string>()
  for (const [path, prior] of renamed) toNew.set(prior.id, path)
  const swap = (id: string) => toNew.get(id) ?? id
  const frecency: DesktopState["frecency"] = {}
  for (const [id, entry] of Object.entries(state.frecency)) frecency[swap(id)] = entry
  const pinAt: NonNullable<DesktopState["pinAt"]> = {}
  for (const [id, spot] of Object.entries(state.pinAt ?? {})) pinAt[swap(id)] = spot
  return {
    ...state,
    pinIds: state.pinIds.map(swap),
    pinAt,
    topSlots: state.topSlots.map((id) => (id ? swap(id) : id)),
    topKeep: state.topKeep.map(swap),
    topHide: state.topHide.map(swap),
    frecency,
  }
}

/** A deleted file keeps no spot on the wallpaper. */
function prunePinAt(
  pinAt: DesktopState["pinAt"],
  ids: Set<string>,
): DesktopState["pinAt"] {
  if (!pinAt) return pinAt
  const kept: NonNullable<DesktopState["pinAt"]> = {}
  for (const [id, spot] of Object.entries(pinAt)) if (ids.has(id)) kept[id] = spot
  return kept
}

/** Re-reads Desktop files without dropping the user's Alcove / group placement. */
export function mergeHarvest(
  current: DesktopState,
  harvested: HarvestedIcon[],
  inboxId: string,
): DesktopState {
  const liveIds = liveAlcoveIds(current.alcoves)
  const liveIcons = current.icons.filter(
    (icon) => icon.alcoveId && liveIds.has(icon.alcoveId),
  )
  const livePaths = new Set(liveIcons.map((icon) => icon.path).filter(Boolean))
  const previous = new Map(
    current.icons.filter((icon) => icon.path).map((icon) => [icon.path, icon]),
  )
  const alcoveIds = new Set(current.alcoves.map((alcove) => alcove.id))
  // Live-folder icons are owned by mergeLiveFolder; a renamed Desktop file must
  // not be able to claim one of their slots.
  const renamed = renameMap(
    current.icons.filter(
      (icon) => icon.path && !(icon.alcoveId && liveIds.has(icon.alcoveId)),
    ),
    harvested.filter((item) => !livePaths.has(item.path)),
  )
  const desktop = harvested
    .filter((item) => !livePaths.has(item.path))
    .map((item) => {
      const prior = previous.get(item.path) ?? renamed.get(item.path)
      let alcoveId =
        current.phase === "onboarding"
          ? (prior?.alcoveId ?? null)
          : prior?.alcoveId && alcoveIds.has(prior.alcoveId)
            ? prior.alcoveId
            : inboxId
      if (alcoveId && liveIds.has(alcoveId)) alcoveId = inboxId
      const groupId =
        prior?.groupId && groupStillThere(current.alcoves, alcoveId, prior.groupId)
          ? prior.groupId
          : null
      return toDesktopIcon(item, alcoveId, groupId)
    })
  const icons = [...desktop, ...liveIcons]
  const ids = new Set(icons.map((icon) => icon.id))
  const carried = carryIds(current, renamed)
  return {
    ...carried,
    icons,
    pinIds: carried.pinIds.filter((id) => ids.has(id)),
    pinAt: prunePinAt(carried.pinAt, ids),
  }
}

/** Replace one live-folder drawer from a fresh directory listing. */
export function mergeLiveFolder(
  current: DesktopState,
  alcoveId: string,
  harvested: HarvestedIcon[],
): DesktopState {
  const alcove = current.alcoves.find((item) => item.id === alcoveId)
  if (!alcove?.folderPath) return current
  const previous = new Map(
    current.icons
      .filter((icon) => icon.alcoveId === alcoveId && icon.path)
      .map((icon) => [icon.path, icon]),
  )
  const renamed = renameMap(
    current.icons.filter((icon) => icon.alcoveId === alcoveId && icon.path),
    harvested,
  )
  const live = harvested.map((item) => {
    const prior = previous.get(item.path) ?? renamed.get(item.path)
    const groupId =
      prior?.groupId && groupStillThere(current.alcoves, alcoveId, prior.groupId)
        ? prior.groupId
        : null
    return toDesktopIcon(item, alcoveId, groupId)
  })
  const others = current.icons.filter((icon) => icon.alcoveId !== alcoveId)
  const icons = [...others, ...live]
  const ids = new Set(icons.map((icon) => icon.id))
  const carried = carryIds(current, renamed)
  return {
    ...carried,
    icons,
    pinIds: carried.pinIds.filter((id) => ids.has(id)),
    pinAt: prunePinAt(carried.pinAt, ids),
  }
}
