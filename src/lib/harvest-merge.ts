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

export function liveAlcoveIds(alcoves: Alcove[]): Set<string> {
  return new Set(
    alcoves.filter((alcove) => alcove.folderPath).map((alcove) => alcove.id),
  )
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
  const desktop = harvested
    .filter((item) => !livePaths.has(item.path))
    .map((item) => {
      const prior = previous.get(item.path)
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
  return {
    ...current,
    icons,
    pinIds: current.pinIds.filter((id) => ids.has(id)),
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
  const live = harvested.map((item) => {
    const prior = previous.get(item.path)
    const groupId =
      prior?.groupId && groupStillThere(current.alcoves, alcoveId, prior.groupId)
        ? prior.groupId
        : null
    return toDesktopIcon(item, alcoveId, groupId)
  })
  const others = current.icons.filter((icon) => icon.alcoveId !== alcoveId)
  const icons = [...others, ...live]
  const ids = new Set(icons.map((icon) => icon.id))
  return {
    ...current,
    icons,
    pinIds: current.pinIds.filter((id) => ids.has(id)),
  }
}
