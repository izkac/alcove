import { scoreAt, type Frecency } from "./frecency.ts"
import type { DesktopIcon } from "../types.ts"

/** 1–9 fire directly, so there is no tenth row to reach for. */
export const HOME_LIMIT = 9

/** Recent is volatile by nature; it must not crowd out the stable half. */
const TODAY_LIMIT = 5

/**
 * Pictures arrive in batches — one wallpaper hunt drops eight files into
 * Downloads in a minute and every one of them is "modified today". Left alone
 * they take the whole list and bury the document you were actually writing, so
 * only the two newest ever stand for the batch.
 */
const TODAY_IMAGE_LIMIT = 2

export type LauncherHome = {
  today: DesktopIcon[]
  frequent: DesktopIcon[]
}

function startOfDay(now: number): number {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/**
 * What the launcher shows before you type anything.
 *
 * Two lists, because they answer different questions. **Frequent** is what you
 * always open — the frequent strip already covers it, but the strip is not on
 * screen when another window is. **Today** is the thing the strip structurally
 * cannot hold: the file you were editing twenty minutes ago and will never open
 * again after Friday.
 *
 * Apps and shortcuts are excluded from Today. A `.lnk`'s timestamp is when it
 * was installed, not when it was used, so they would fill the list on the day
 * you set the machine up and never leave. Pictures are capped rather than
 * excluded — one saved photo is worth a row, eight downloaded ones are not.
 */
export function launcherHome(
  icons: DesktopIcon[],
  frecency: Frecency,
  hide: string[],
  now: number,
): LauncherHome {
  const hidden = new Set(hide)
  const midnight = startOfDay(now)

  let images = 0
  const today = icons
    .filter(
      (icon) =>
        !hidden.has(icon.id) &&
        icon.kind !== "app" &&
        icon.kind !== "shortcut" &&
        typeof icon.modifiedAt === "number" &&
        icon.modifiedAt >= midnight &&
        icon.modifiedAt <= now,
    )
    .sort((a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0))
    .filter((icon) => icon.kind !== "image" || (images += 1) <= TODAY_IMAGE_LIMIT)
    .slice(0, TODAY_LIMIT)

  const taken = new Set(today.map((icon) => icon.id))
  const frequent = icons
    .filter((icon) => !hidden.has(icon.id) && !taken.has(icon.id))
    .map((icon) => ({ icon, score: scoreAt(frecency[icon.id], now) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.icon.name.localeCompare(b.icon.name))
    .slice(0, HOME_LIMIT - today.length)
    .map((entry) => entry.icon)

  return { today, frequent }
}

/** Flat 1–9 order, so a number key means the same thing as the badge beside it. */
export function homeOrder(home: LauncherHome): DesktopIcon[] {
  return [...home.today, ...home.frequent].slice(0, HOME_LIMIT)
}
