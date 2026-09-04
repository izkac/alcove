import type { Alcove, DesktopIcon } from "../types.ts"

/**
 * The launcher's supporting logic: what a typed line means when it matches
 * nothing, how a row describes itself, and which folders are worth walking.
 *
 * All of it is pure so `search-hits.check.ts` can hold it to account without a
 * webview, a disk, or a Windows box.
 */

/** Typed after this, the list becomes verbs instead of files. */
export const COMMAND_PREFIX = ">"

/**
 * Where "Search the web" goes. One constant because it is the single line
 * anyone would ever want to change, and no setting deserves to exist for it.
 */
export const WEB_SEARCH = "https://duckduckgo.com/?q="

export type PaletteEntry = {
  command: "new-alcove" | "collapse-all" | "wallpaper" | "settings" | "toggle-taskbar" | "empty-bin"
  label: string
  /** The chord that already does this, so the palette teaches its way out of itself. */
  hint?: string
  /** Throws work away. Rendered apart from the rest. */
  danger?: boolean
}

export const PALETTE: readonly PaletteEntry[] = [
  { command: "new-alcove", label: "New drawer", hint: "Ctrl+N" },
  { command: "collapse-all", label: "Collapse every drawer", hint: "Ctrl+Shift+H" },
  { command: "wallpaper", label: "Change wallpaper" },
  { command: "settings", label: "Settings" },
  { command: "toggle-taskbar", label: "Hide or show the Windows taskbar" },
  { command: "empty-bin", label: "Empty the Recycle Bin", danger: true },
]

/**
 * The text after the `>`, or null when this is an ordinary search. An empty
 * string is a real answer — a bare `>` means "show me every command".
 */
export function commandTerm(query: string): string | null {
  const trimmed = query.trimStart()
  if (!trimmed.startsWith(COMMAND_PREFIX)) return null
  return trimmed.slice(COMMAND_PREFIX.length).trim()
}

export function paletteFor(term: string): PaletteEntry[] {
  const needle = term.trim().toLowerCase()
  if (!needle) return [...PALETTE]
  return PALETTE.filter((entry) => entry.label.toLowerCase().includes(needle))
}

/**
 * A drive letter, a UNC share, an environment variable, or a `~`. Deliberately
 * strict: a bare word with a backslash in it is far more likely to be a typo
 * than a path, and offering to "open" it wastes the most valuable row.
 */
export function looksLikePath(query: string): boolean {
  const value = query.trim()
  if (value.length < 2) return false
  if (/^[a-zA-Z]:[\\/]/.test(value)) return true
  if (value.startsWith("\\\\")) return true
  if (/^%[^%]+%/.test(value)) return true
  return value.startsWith("~\\") || value.startsWith("~/")
}

const URL_SCHEME = /^https?:\/\/\S+$/i
/** A bare host: at least one dot, a plausible suffix, no spaces. */
const BARE_HOST = /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i

export function looksLikeUrl(query: string): boolean {
  const value = query.trim()
  if (URL_SCHEME.test(value)) return true
  if (/\s/.test(value)) return false
  // A file name is not a website. "notes.md" must never open a browser.
  if (BARE_HOST.test(value)) return !/\.(exe|msi|lnk|txt|md|pdf|zip|png|jpe?g|docx?|xlsx?)$/i.test(value)
  return false
}

export function asUrl(query: string): string {
  const value = query.trim()
  return URL_SCHEME.test(value) ? value : `https://${value}`
}

export function webUrl(query: string): string {
  return `${WEB_SEARCH}${encodeURIComponent(query.trim())}`
}

export type Fallback = {
  id: string
  label: string
  hint: string
  /** Handed straight to open_desktop_item. */
  target: string
}

/**
 * What to offer when nothing on the desktop matched. A launcher that answers
 * "no results" and stops has thrown away the one thing the user gave it, so
 * every branch here ends in something that runs.
 */
export function fallbacks(query: string): Fallback[] {
  const value = query.trim()
  if (!value) return []
  const out: Fallback[] = []
  if (looksLikePath(value)) {
    out.push({ id: "open-path", label: `Open ${value}`, hint: "Path", target: value })
  } else if (looksLikeUrl(value)) {
    const url = asUrl(value)
    out.push({ id: "open-url", label: `Open ${url}`, hint: "Website", target: url })
  } else if (!/\s/.test(value)) {
    // The Win+R case. With a space in it ShellExecute would only fail, so the
    // row is not offered.
    out.push({ id: "run", label: `Run ${value}`, hint: "Command", target: value })
  }
  out.push({
    id: "web",
    label: `Search the web for ${value}`,
    hint: "Browser",
    target: webUrl(value),
  })
  return out
}

const DAY_MS = 24 * 60 * 60 * 1000

export type WhenBucket = "none" | "time" | "yesterday" | "weekday" | "date" | "year"

/**
 * How precise a timestamp needs to be to tell two rows apart. Today only the
 * clock matters; last month only the date does. Split from the formatting so
 * the rule can be checked without pinning a locale.
 */
export function whenBucket(ms: number | null | undefined, now: number): WhenBucket {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "none"
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const start = today.getTime()
  if (ms >= start) return "time"
  if (ms >= start - DAY_MS) return "yesterday"
  if (ms >= start - 6 * DAY_MS) return "weekday"
  return new Date(ms).getFullYear() === today.getFullYear() ? "date" : "year"
}

export function shortWhen(ms: number | null | undefined, now: number): string {
  const bucket = whenBucket(ms, now)
  if (bucket === "none") return ""
  const date = new Date(ms as number)
  if (bucket === "time")
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  if (bucket === "yesterday") return "Yesterday"
  if (bucket === "weekday") return date.toLocaleDateString(undefined, { weekday: "short" })
  if (bucket === "date")
    return date.toLocaleDateString(undefined, { day: "numeric", month: "short" })
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" })
}

/**
 * The folder a file sits in, for rows that came from a walk rather than a
 * drawer. Only the leaf: the full path is too wide for the row and the leaf is
 * what people actually remember.
 */
export function parentFolder(path?: string): string {
  if (!path) return ""
  const parts = path.split(/[\\/]+/).filter(Boolean)
  return parts.length >= 2 ? parts[parts.length - 2] : ""
}

/**
 * The folder to open for Shift+Enter. Empty when the path has no folder above
 * it: opening the whole drive because someone hit the wrong modifier is worse
 * than doing nothing.
 */
export function parentPath(path?: string): string {
  if (!path) return ""
  const cut = path.replace(/[\\/]+$/, "").replace(/[\\/]+[^\\/]+$/, "")
  return /[\\/:]/.test(cut) ? cut : ""
}

/**
 * Roots for the deep walk. Capped: every extra root is another tree competing
 * for the same time budget, so past a handful each one only makes the others
 * worse.
 */
export const DEEP_ROOT_CAP = 6

export function deepRoots(alcoves: Alcove[]): string[] {
  const seen = new Set<string>()
  const roots: string[] = []
  for (const alcove of alcoves) {
    const path = alcove.folderPath?.trim()
    if (!path || seen.has(path.toLowerCase())) continue
    seen.add(path.toLowerCase())
    roots.push(path)
    if (roots.length === DEEP_ROOT_CAP) break
  }
  return roots
}

/** Below this the walk costs more than it can possibly return. */
export const DEEP_MIN_QUERY = 2

/** Deep hits are extra rows, not the main event, so they get a modest ceiling. */
export const DEEP_LIMIT = 40

/**
 * Drops anything the drawers already list. A file inside a live folder is
 * indexed twice — once from the drawer's own listing and once by the walk — and
 * the drawer's copy is the better row because it carries a real icon.
 */
export function newDeepHits(known: DesktopIcon[], deep: DesktopIcon[]): DesktopIcon[] {
  const seen = new Set(known.map((icon) => icon.id.toLowerCase()))
  const out: DesktopIcon[] = []
  for (const icon of deep) {
    const key = icon.id.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(icon)
  }
  return out
}

/**
 * A cheap reject before the fuzzy scorer. command-score only ever scores a
 * subsequence, so anything that is not one can be thrown away in a single pass
 * instead of a whole scoring table — which is the difference between the
 * launcher keeping up with typing and not.
 *
 * `search` must already be lowercase; the caller lowercases it once per
 * keystroke rather than once per row.
 */
export function couldMatch(text: string, search: string): boolean {
  let at = 0
  const lower = text.toLowerCase()
  for (let index = 0; index < lower.length && at < search.length; index += 1) {
    if (lower[index] === search[at]) at += 1
  }
  return at === search.length
}
