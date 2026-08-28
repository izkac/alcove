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

export type DesktopIcon = {
  id: string
  name: string
  kind: IconKind
  extension?: string
  alcoveId: string | null
  groupHint: string
}

export type Alcove = {
  id: string
  name: string
  color: AlcoveColor
  collapsed: boolean
  isInbox: boolean
  order: number
  page: number
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
  focusedAlcoveId: string | null
  highlightedIconId: string | null
}
