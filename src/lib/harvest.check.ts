/**
 * Restarting Alcove re-reads the Desktop folder. Placement (Alcove + group)
 * has to survive that merge. Run: npm run check
 */
import assert from "node:assert/strict"
import { mergeHarvest, mergeLiveFolder } from "./harvest-merge.ts"
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
    stripEdge: "top",
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
    byteSize: icon.byteSize,
    modifiedAt: icon.modifiedAt,
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

const downloads: Alcove = {
  ...apps,
  id: "downloads",
  name: "Downloads",
  folderPath: "C:\\Users\\me\\Downloads",
  folderView: "list",
  groups: [{ id: "zips", name: "Zips" }],
}

const zip: DesktopIcon = {
  id: "C:\\Users\\me\\Downloads\\a.zip",
  name: "a.zip",
  kind: "installer",
  alcoveId: "downloads",
  groupHint: "installers",
  path: "C:\\Users\\me\\Downloads\\a.zip",
  groupId: "zips",
  byteSize: 2048,
  modifiedAt: 1_700_000_000_000,
}

const withLive = {
  ...state([delphi, zip]),
  alcoves: [apps, downloads],
}

const afterDesktop = mergeHarvest(withLive, [harvested(delphi)], "inbox")
assert.equal(
  afterDesktop.alcoves.find((alcove) => alcove.id === "downloads")?.folderView,
  "list",
  "folder view choice survives a Desktop re-read",
)
assert.equal(
  afterDesktop.icons.find((icon) => icon.path === zip.path)?.groupId,
  "zips",
  "a live-folder drawer survives a Desktop re-read",
)
assert.equal(
  afterDesktop.icons.find((icon) => icon.path === delphi.path)?.alcoveId,
  "apps",
)

const afterLive = mergeLiveFolder(withLive, "downloads", [
  harvested(zip),
  {
    id: "C:\\Users\\me\\Downloads\\b.pdf",
    name: "b.pdf",
    kind: "document",
    groupHint: "documents",
    path: "C:\\Users\\me\\Downloads\\b.pdf",
    imageUrl: "data:image/png;base64,xx",
  },
])
assert.equal(afterLive.icons.filter((icon) => icon.alcoveId === "downloads").length, 2)
assert.equal(
  afterLive.icons.find((icon) => icon.path === zip.path)?.groupId,
  "zips",
  "groups inside a live folder survive a re-read",
)
assert.equal(
  afterLive.icons.find((icon) => icon.path === zip.path)?.byteSize,
  2048,
  "size survives a live-folder re-read",
)
assert.equal(
  afterLive.icons.find((icon) => icon.path === zip.path)?.modifiedAt,
  1_700_000_000_000,
)
assert.equal(
  afterLive.icons.find((icon) => icon.path === delphi.path)?.alcoveId,
  "apps",
  "Desktop icons stay put when a live folder refreshes",
)

console.log("harvest merge: all checks passed")
