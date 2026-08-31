import type { Alcove } from "@/types"

/** Put `dragId` in `targetId`'s slot. Inbox cannot be dragged. */
export function reorderAlcoves(
  alcoves: Alcove[],
  dragId: string,
  targetId: string,
): Alcove[] {
  if (dragId === targetId) return alcoves
  const sorted = [...alcoves].sort((a, b) => a.order - b.order)
  const from = sorted.findIndex((alcove) => alcove.id === dragId)
  const to = sorted.findIndex((alcove) => alcove.id === targetId)
  if (from < 0 || to < 0) return alcoves
  if (sorted[from]?.isInbox) return alcoves
  const next = [...sorted]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next.map((alcove, index) => ({ ...alcove, order: index }))
}
