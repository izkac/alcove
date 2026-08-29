export const ICON_KINDS = [
  "app",
  "document",
  "folder",
  "installer",
  "shortcut",
  "image",
] as const

export type IconKind = (typeof ICON_KINDS)[number]

export const ALCOVE_COLOR_IDS = [
  "sky",
  "violet",
  "amber",
  "emerald",
  "rose",
  "slate",
] as const

export type AlcoveColor = (typeof ALCOVE_COLOR_IDS)[number]

export const LAYOUT_IDS = ["work", "home", "clean"] as const
export type LayoutId = (typeof LAYOUT_IDS)[number]

export const DENSITY_IDS = ["comfortable", "compact", "tiny"] as const
export type Density = (typeof DENSITY_IDS)[number]

export const ALCOVE_VIEWS = ["panel", "canvas"] as const
export type AlcoveView = (typeof ALCOVE_VIEWS)[number]

export const FOLDER_VIEWS = ["icons", "large", "list", "details"] as const
export type FolderView = (typeof FOLDER_VIEWS)[number]

export const STRIP_EDGES = ["top", "bottom"] as const
export type StripEdge = (typeof STRIP_EDGES)[number]

export type DesktopIcon = {
  id: string
  name: string
  kind: IconKind
  extension?: string
  alcoveId: string | null
  groupHint: string
  path?: string
  imageUrl?: string
  /** Row inside the owning Alcove's canvas. Null/absent = "Everything else". */
  groupId?: string | null
}

export type IconGroup = {
  id: string
  name: string
}

export type Alcove = {
  id: string
  name: string
  color: AlcoveColor
  glyph?: string
  collapsed: boolean
  isInbox: boolean
  order: number
  page: number
  /** Canvas rows, in render order. */
  groups?: IconGroup[]
  /** Forces an open mode; absent means pick by item count. */
  view?: AlcoveView
  /** When set, this drawer lists that folder instead of holding Desktop items. */
  folderPath?: string | null
  /** Layout for a live-folder drawer. Ignored when folderPath is empty. */
  folderView?: FolderView
}

/** One open, decayed to `at`. Score is meaningless without its timestamp. */
export type FrecencyEntry = {
  score: number
  at: number
}

export type SuggestedGroup = {
  id: string
  name: string
  color: AlcoveColor
  iconIds: string[]
  enabled: boolean
}

export type LayoutSnapshots = Record<LayoutId, Record<string, boolean>>

export type DesktopPhase = "onboarding" | "ready"

export type DesktopState = {
  phase: DesktopPhase
  alcoves: Alcove[]
  icons: DesktopIcon[]
  pinIds: string[]
  density: Density
  layoutId: LayoutId
  layoutSnapshots: LayoutSnapshots
  focusMode: boolean
  /** Frequent strip sits on this screen edge. */
  stripEdge: StripEdge
  focusedAlcoveId: string | null
  highlightedIconId: string | null
  /** Open history behind the frequent strip, keyed by icon id. */
  frecency: Record<string, FrecencyEntry>
  /** Fixed-length slots; an icon keeps its index until something evicts it. */
  topSlots: (string | null)[]
  /** Slots the user locked — never evicted. */
  topKeep: string[]
  /** Icons banned from the strip. */
  topHide: string[]
}
