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
    groupId,
  }
}

function groupStillThere(alcoves: Alcove[], alcoveId: string | null, groupId: string | null) {
  if (!alcoveId || !groupId) return false
  const alcove = alcoves.find((item) => item.id === alcoveId)
  return Boolean(alcove?.groups?.some((group) => group.id === groupId))
}

/** Re-reads Desktop files without dropping the user's Alcove / group placement. */
export function mergeHarvest(
  current: DesktopState,
  harvested: HarvestedIcon[],
  inboxId: string,
): DesktopState {
  const previous = new Map(
    current.icons.filter((icon) => icon.path).map((icon) => [icon.path, icon]),
  )
  const alcoveIds = new Set(current.alcoves.map((alcove) => alcove.id))
  const icons = harvested.map((item) => {
    const prior = previous.get(item.path)
    const alcoveId =
      current.phase === "onboarding"
        ? (prior?.alcoveId ?? null)
        : prior?.alcoveId && alcoveIds.has(prior.alcoveId)
          ? prior.alcoveId
          : inboxId
    const groupId =
      prior?.groupId && groupStillThere(current.alcoves, alcoveId, prior.groupId)
        ? prior.groupId
        : null
    return toDesktopIcon(item, alcoveId, groupId)
  })
  const ids = new Set(icons.map((icon) => icon.id))
  return {
    ...current,
    icons,
    pinIds: current.pinIds.filter((id) => ids.has(id)),
  }
}
