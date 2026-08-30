import type { DesktopIcon } from "@/types"

/** Bytes held by an Alcove. Folders carry no size of their own, so they add nothing. */
export function totalByteSize(icons: DesktopIcon[]): number {
  return icons.reduce((sum, icon) => sum + (icon.byteSize ?? 0), 0)
}

/** The biggest file in an Alcove — what to name when the total looks surprising. */
export function largestIcon(icons: DesktopIcon[]): DesktopIcon | null {
  let biggest: DesktopIcon | null = null
  for (const icon of icons) {
    if ((icon.byteSize ?? 0) <= 0) continue
    if (!biggest || (icon.byteSize ?? 0) > (biggest.byteSize ?? 0)) biggest = icon
  }
  return biggest
}

/**
 * The one Alcove worth colouring: it outweighs the runner-up twice over.
 * Null on a balanced desk, so the size stays a hint you only notice when it matters.
 */
export function disproportionateId(
  sizes: { id: string; bytes: number }[],
): string | null {
  const ranked = sizes
    .filter((entry) => entry.bytes > 0)
    .sort((left, right) => right.bytes - left.bytes)
  // ponytail: needs two sized drawers to compare — one drawer is not "disproportionate".
  if (ranked.length < 2) return null
  const [first, second] = ranked
  return first.bytes >= second.bytes * 2 ? first.id : null
}
