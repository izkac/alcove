import type { Alcove } from "@/types"
import type { WallpaperTheme } from "@/lib/wallpaper"

export type DeskInfo = {
  id: string
  name: string
  primary: boolean
}

export type DeskHit = {
  id: string
  x: number
  y: number
}

export const LOCAL_DESK: DeskInfo = {
  id: "local",
  name: "This screen",
  primary: true,
}

export function injectedDesk(): DeskInfo | null {
  const id = (window as unknown as { __ALCOVE_DESK_ID__?: string }).__ALCOVE_DESK_ID__
  if (!id) return null
  return { id, name: id, primary: false }
}

const CHANNEL = "alcove-desk"

export type DeskDropMessage = {
  type: "icon-drop"
  iconId: string
  iconIds?: string[]
  deskId: string
  x: number
  y: number
}

export type DeskHoverMessage = {
  type: "hover"
  deskId: string | null
}

export type DeskDragBeginMessage = {
  type: "icon-drag-begin"
  iconId: string
  name: string
  imageUrl?: string
  iconIds?: string[]
}

export type DeskGhostMessage = {
  type: "icon-ghost"
  deskId: string
  x: number
  y: number
}

export type DeskDragHandoffMessage = {
  type: "icon-drag-handoff"
}

export type DeskGhostEndMessage = {
  type: "icon-ghost-end"
}

/**
 * The search window launched something. It owns no state, so it says what it
 * did and the primary desk records it — otherwise the launcher, where the most
 * deliberate launches happen, teaches the frequent strip nothing.
 */
export type DeskLaunchMessage = {
  type: "icon-launched"
  iconId: string
}

/**
 * The launcher asked for something only a desk can do — open a drawer, show a
 * dialog, collapse the rail. The search window holds a read-only copy of the
 * state and none of the dialogs, so it names the job and the desk performs it.
 */
export type DeskCommandMessage = {
  type: "desk-command"
  command: DeskCommand
  /** Only for "open-alcove". */
  alcoveId?: string
}

export const DESK_COMMANDS = [
  "open-alcove",
  "new-alcove",
  "settings",
  "collapse-all",
  "wallpaper",
  "toggle-taskbar",
  "empty-bin",
] as const

export type DeskCommand = (typeof DESK_COMMANDS)[number]

/**
 * The wallpaper is a Windows-wide thing, but each desk window paints and samples
 * it separately, so whoever changes it tells the others to look again.
 */
export type DeskWallpaperMessage = {
  type: "wallpaper-changed"
}

/** The desk sampled the wallpaper. Search and the bar paint from these numbers. */
export type DeskThemeMessage = {
  type: "theme"
  theme: WallpaperTheme
}

export type DeskChannelMessage =
  | DeskDropMessage
  | DeskHoverMessage
  | DeskDragBeginMessage
  | DeskGhostMessage
  | DeskDragHandoffMessage
  | DeskGhostEndMessage
  | DeskLaunchMessage
  | DeskCommandMessage
  | DeskWallpaperMessage
  | DeskThemeMessage

/** The ghost lives in one webview. Paint it here only while the cursor is on this desk. */
export function ghostStaysHere(hit: DeskHit | null, currentDeskId: string) {
  return !hit || hit.id === currentDeskId
}

/** Unassigned or unplugged drawers sit on the primary desk until their screen returns. */
export function homeDeskId(
  stripId: string | null | undefined,
  liveIds: string[],
  primaryId: string,
): string {
  if (stripId && liveIds.includes(stripId)) return stripId
  return primaryId
}

/** Inbox is on every rail. Other drawers live on exactly one. */
export function alcovesOnDesk(
  alcoves: Alcove[],
  desk: DeskInfo,
  desks: DeskInfo[],
): Alcove[] {
  const liveIds = desks.map((item) => item.id)
  const primaryId = desks.find((item) => item.primary)?.id ?? desk.id
  return alcoves.filter((alcove) => {
    if (alcove.isInbox) return true
    return homeDeskId(alcove.stripId, liveIds, primaryId) === desk.id
  })
}

export function deskChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null
  return new BroadcastChannel(CHANNEL)
}
