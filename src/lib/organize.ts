import { INBOX_ID, SUGGESTED_GROUP_META } from "@/data/sample"
import type { Alcove, DesktopIcon, LayoutSnapshots, SuggestedGroup } from "@/types"

export function suggestionsFromIcons(icons: DesktopIcon[]): SuggestedGroup[] {
  return SUGGESTED_GROUP_META.map((meta) => ({
    ...meta,
    enabled: true,
    iconIds: icons.filter((icon) => icon.groupHint === meta.id).map((icon) => icon.id),
  })).filter((group) => group.iconIds.length > 0)
}

export function buildInbox(): Alcove {
  return {
    id: INBOX_ID,
    name: "Inbox",
    color: "amber",
    glyph: "inbox",
    collapsed: false,
    isInbox: true,
    order: 0,
    page: 0,
  }
}

export function snapshotsForAlcoves(alcoves: Alcove[]): LayoutSnapshots {
  const collapsedMap = (expandedIds: string[]) =>
    Object.fromEntries(
      alcoves.map((alcove) => [
        alcove.id,
        !expandedIds.includes(alcove.id),
      ]),
    )

  return {
    work: collapsedMap([INBOX_ID, "apps", "client-a"]),
    home: collapsedMap([INBOX_ID, "photos", "folders"]),
    clean: collapsedMap([INBOX_ID]),
  }
}

export function applySnapshot(
  alcoves: Alcove[],
  snapshot: Record<string, boolean>,
): Alcove[] {
  return alcoves.map((alcove) => ({
    ...alcove,
    collapsed: snapshot[alcove.id] ?? (!alcove.isInbox),
    page: 0,
  }))
}

export function snapshotFromAlcoves(alcoves: Alcove[]): Record<string, boolean> {
  return Object.fromEntries(alcoves.map((alcove) => [alcove.id, alcove.collapsed]))
}
