import type { DesktopIcon } from "@/types"

/** If the grabbed icon is already selected, the whole selection comes along. */
export function dragIconIds(selected: string[], grabbedId: string): string[] {
  if (selected.includes(grabbedId) && selected.length > 1) {
    return [grabbedId, ...selected.filter((id) => id !== grabbedId)]
  }
  return [grabbedId]
}

export function toggleIconId(selected: string[], id: string): string[] {
  return selected.includes(id)
    ? selected.filter((item) => item !== id)
    : [...selected, id]
}

/** Inclusive range between the anchor and the target, in visible order. */
export function rangeIconIds(
  ordered: string[],
  anchorId: string,
  targetId: string,
): string[] {
  const from = ordered.indexOf(anchorId)
  const to = ordered.indexOf(targetId)
  if (to < 0) return from < 0 ? [targetId] : [anchorId]
  if (from < 0) return [targetId]
  const start = Math.min(from, to)
  const end = Math.max(from, to)
  return ordered.slice(start, end + 1)
}

export function visibleIconIds(): string[] {
  return [...document.querySelectorAll("[data-desktop-icon]")]
    .map((node) => (node instanceof HTMLElement ? node.dataset.desktopIcon : undefined))
    .filter((id): id is string => Boolean(id))
}

/** The clicked icon, plus the rest of the selection when it is part of one. */
export function iconPack(
  icon: DesktopIcon,
  selectedIds: string[],
  icons: DesktopIcon[],
): DesktopIcon[] {
  const ids = dragIconIds(selectedIds, icon.id)
  const byId = new Map(icons.map((item) => [item.id, item]))
  const pack = ids
    .map((id) => byId.get(id))
    .filter((item): item is DesktopIcon => Boolean(item))
  return pack.length > 0 ? pack : [icon]
}
