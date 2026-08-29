/**
 * Restarting Alcove re-reads the Desktop folder. Placement (Alcove + group)
 * has to survive that merge. Run: npm run check
 */
import assert from "node:assert/strict"
import { mergeHarvest } from "./harvest-merge.ts"
import type { Alcove, DesktopIcon, DesktopState } from "../types.ts"

const apps: Alcove = {
  id: "apps",
  name: "Apps",
  color: "sky",
  collapsed: false,
  isInbox: false,
  order: 1,
  page: 0,
  groups: [
    { id: "coding", name: "CODING" },
    { id: "browsers", name: "BROWSERS" },
  ],
}

const delphi: DesktopIcon = {
  id: "C:\\Delphi.lnk",
  name: "Delphi 12",
  kind: "app",
  alcoveId: "apps",
  groupHint: "apps",
  path: "C:\\Delphi.lnk",
  groupId: "coding",
}

const chrome: DesktopIcon = {
  id: "C:\\Chrome.lnk",
  name: "Google Chrome",
  kind: "app",
  alcoveId: "apps",
  groupHint: "apps",
  path: "C:\\Chrome.lnk",
  groupId: "browsers",
}

function state(icons: DesktopIcon[]): DesktopState {
  return {
    phase: "ready",
    alcoves: [apps],
    icons,
    pinIds: [],
    density: "comfortable",
    layoutId: "work",
    layoutSnapshots: { work: {}, home: {}, clean: {} },
    focusMode: false,
    focusedAlcoveId: "apps",
    highlightedIconId: null,
    frecency: {},
    topSlots: [null, null, null, null, null],
    topKeep: [],
    topHide: [],
  }
}

function harvested(icon: DesktopIcon) {
  return {
    id: icon.path!,
    name: icon.name,
    kind: icon.kind,
    groupHint: icon.groupHint,
    path: icon.path!,
    imageUrl: "data:image/png;base64,xx",
  }
}

const merged = mergeHarvest(state([delphi, chrome]), [harvested(delphi), harvested(chrome)], "inbox")
assert.equal(merged.alcoves[0]?.groups?.length, 2, "group rows stay on the Alcove")
assert.equal(
  merged.icons.find((icon) => icon.path === delphi.path)?.groupId,
  "coding",
  "Delphi stays in CODING after a Desktop re-read",
)
assert.equal(
  merged.icons.find((icon) => icon.path === chrome.path)?.groupId,
  "browsers",
)

const stale = mergeHarvest(
  state([{ ...delphi, groupId: "gone" }]),
  [harvested(delphi)],
  "inbox",
)
assert.equal(stale.icons[0]?.groupId, null, "a deleted group does not come back")

console.log("harvest merge: all checks passed")
