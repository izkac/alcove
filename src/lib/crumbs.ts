import { folderLeaf } from "./harvest-merge.ts"

export type Crumb = { name: string; path: string }

const TRAILING = /[\\/]+$/
const SEGMENT = /[\\/]/

function sepOf(path: string) {
  return path.includes("\\") ? "\\" : "/"
}

function trimEnd(path: string) {
  return path.replace(TRAILING, "")
}

/** Windows paths differ only in case all the time; a drawer must still own them. */
function under(root: string, path: string) {
  return path.toLowerCase().startsWith(`${root.toLowerCase()}${sepOf(root)}`)
}

/**
 * The trail from a drawer's own folder down to the one being shown: the root's
 * leaf name first, then one crumb per level below it. A path outside the root
 * collapses to the root alone, so a drawer can never claim to be showing a
 * folder it does not own.
 */
export function crumbTrail(root: string, path: string): Crumb[] {
  const base = trimEnd(root)
  const here = trimEnd(path)
  const trail: Crumb[] = [{ name: folderLeaf(base), path: base }]
  if (here.toLowerCase() === base.toLowerCase() || !under(base, here)) return trail
  const sep = sepOf(base)
  let cursor = base
  for (const part of here.slice(base.length + 1).split(SEGMENT)) {
    if (!part) continue
    cursor = `${cursor}${sep}${part}`
    trail.push({ name: part, path: cursor })
  }
  return trail
}

/** One level up, or null at the drawer's own folder — where Backspace stops. */
export function parentWithin(root: string, path: string): string | null {
  const trail = crumbTrail(root, path)
  return trail.length > 1 ? (trail[trail.length - 2]?.path ?? null) : null
}
