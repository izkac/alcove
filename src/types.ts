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

/**
 * How far the surfaces lean into the wallpaper. Blend sits closest to the
 * picture and lets a little of it through; Solid is a fixed paper or slate.
 */
export const SURFACE_TONES = ["blend", "tinted", "solid"] as const
export type SurfaceTone = (typeof SURFACE_TONES)[number]

/**
 * Scales the whole type scale together. Only ever up: 11px is the floor for a
 * label read at a glance, so there is no smaller stop.
 */
export const TEXT_SIZES = ["default", "large", "larger"] as const
export type TextSize = (typeof TEXT_SIZES)[number]

/**
 * One open window, as Windows reports it. Shared by the taskbar and the
 * launcher — both answer "switch me to that thing", just from different ends.
 */
export type RunningApp = {
  hwnd: number
  title: string
  exePath: string
  iconUrl: string | null
  foreground: boolean
}

export type DesktopIcon = {
  id: string
  name: string
  kind: IconKind
  extension?: string
  alcoveId: string | null
  groupHint: string
  path?: string
  imageUrl?: string
  /** File length in bytes. Absent for folders. */
  byteSize?: number | null
  /** Last write time, milliseconds since Unix epoch. */
  modifiedAt?: number | null
  /** Row inside the owning Alcove's canvas. Null/absent = "Everything else". */
  groupId?: string | null
}

/**
 * Where a parked icon sits on the wallpaper. Cells, not pixels: a monitor that
 * changes resolution must not strand an icon off-screen, and two icons must
 * never land on the same spot.
 */
export type PinSpot = {
  col: number
  row: number
  /** Monitor it was parked on. Null = every desk shows it. */
  deskId?: string | null
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
  /** Monitor this drawer lives on. Null = primary. Inbox ignores this. */
  stripId?: string | null
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
  /** Pins the user parked somewhere. No entry = the bottom-right stack. */
  pinAt?: Record<string, PinSpot>
  density: Density
  layoutId: LayoutId
  layoutSnapshots: LayoutSnapshots
  focusMode: boolean
  /** Frequent strip sits on this screen edge. */
  stripEdge: StripEdge
  /** How far the surfaces lean into the wallpaper. */
  surfaceTone?: SurfaceTone
  /** Scales every text size together. */
  textSize?: TextSize
  /** Pushes label and supporting text further from the surface behind it. */
  strongText?: boolean
  focusedAlcoveId: string | null
  highlightedIconId: string | null
  /** Open history behind the frequent strip, keyed by icon id. */
  frecency: Record<string, FrecencyEntry>
  /** Fixed-length slots; an icon keeps its index until something evicts it. */
  topSlots: (string | null)[]
  /** How many app slots the strip holds. Clamped to the frecency limits. */
  topSlotCount?: number
  /** Slots the user locked — never evicted. */
  topKeep: string[]
  /** Icons banned from the strip. */
  topHide: string[]
  /** System shortcuts pinned on the left of the frequent strip. */
  stripToolIds: string[]
}
