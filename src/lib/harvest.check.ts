/**
 * Restarting Alcove re-reads the Desktop folder. Placement (Alcove + group)
 * has to survive that merge. Run: npm run check
 */
import assert from "node:assert/strict"
import {
  fileableIds,
  isSampleMock,
  mergeHarvest,
  mergeLiveFolder,
  renameMap,
} from "./harvest-merge.ts"
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
    stripToolIds: [],
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

const opera: DesktopIcon = {
  ...chrome,
  id: "C:\\Opera Browser.lnk",
  name: "Opera Browser",
  path: "C:\\Opera Browser.lnk",
  groupId: "browsers",
}
const dropped = mergeHarvest(state([delphi, opera]), [harvested(delphi)], "inbox")
assert.equal(
  dropped.icons.some((icon) => icon.path === opera.path),
  false,
  "a Desktop shortcut that is no longer harvested is dropped",
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

assert.equal(
  isSampleMock({ phase: "onboarding", icons: [{}, {}] }),
  true,
  "onboarding sample icons with no paths are the browser mock",
)
assert.equal(
  isSampleMock({ phase: "ready", icons: [] }),
  false,
  "an empty real desktop is not the mock — harvest must not wipe it",
)
assert.equal(
  isSampleMock({ phase: "onboarding", icons: [] }),
  false,
  "empty onboarding is not the mock",
)
assert.equal(
  isSampleMock({ phase: "ready", icons: [{ path: "C:\\a.lnk" }] }),
  false,
)

// --- renaming a file outside Alcove must not unfile it ---

const notes: DesktopIcon = {
  id: "C:\\notes.docx",
  name: "notes.docx",
  kind: "document",
  alcoveId: "apps",
  groupHint: "documents",
  path: "C:\\notes.docx",
  groupId: "coding",
  byteSize: 4096,
  modifiedAt: 1_700_000_000_000,
}
const renamedNotes = { ...notes, id: "C:\\Q3 notes.docx", name: "Q3 notes.docx", path: "C:\\Q3 notes.docx" }

assert.equal(
  renameMap([notes], [harvested(renamedNotes)]).get(renamedNotes.path!)?.id,
  notes.id,
  "same size and mtime at a new path is the same file",
)

const afterRename = mergeHarvest(
  { ...state([notes]), pinIds: [notes.id], frecency: { [notes.id]: { score: 3, at: 1 } } },
  [harvested(renamedNotes)],
  "inbox",
)
const carriedIcon = afterRename.icons.find((icon) => icon.path === renamedNotes.path)
assert.equal(carriedIcon?.alcoveId, "apps", "a renamed file keeps its drawer")
assert.equal(carriedIcon?.groupId, "coding", "a renamed file keeps its group row")
assert.deepEqual(afterRename.pinIds, [renamedNotes.id], "the pin follows the rename")
assert.equal(
  afterRename.frecency[renamedNotes.id!]?.score,
  3,
  "frecency history follows the rename",
)
assert.equal(afterRename.frecency[notes.id], undefined, "the dead id is not left behind")

// Two files sharing a size and a timestamp are ambiguous — guessing would file
// one of them into the other's drawer, so neither is matched.
const twinA: DesktopIcon = { ...notes, id: "C:\\a.txt", path: "C:\\a.txt", name: "a.txt" }
const twinB: DesktopIcon = { ...notes, id: "C:\\b.txt", path: "C:\\b.txt", name: "b.txt" }
assert.equal(
  renameMap(
    [twinA, twinB],
    [harvested({ ...twinA, id: "C:\\c.txt", path: "C:\\c.txt" })],
  ).size,
  0,
  "an ambiguous fingerprint is left unmatched",
)

// A folder has no size, so it can never be fingerprinted into someone else.
const folder: DesktopIcon = {
  ...notes,
  id: "C:\\Work",
  path: "C:\\Work",
  name: "Work",
  kind: "folder",
  byteSize: null,
}
assert.equal(
  renameMap([folder], [harvested({ ...folder, id: "C:\\Work2", path: "C:\\Work2" })]).size,
  0,
  "folders are never matched by fingerprint",
)

// A genuinely new file must not inherit a deleted file's placement by accident.
const deleted = mergeHarvest(state([delphi]), [], "inbox")
assert.equal(deleted.icons.length, 0, "a deleted file with no replacement just goes")

const renamedInFolder = mergeLiveFolder(withLive, "downloads", [
  harvested({ ...zip, id: "C:\\Users\\me\\Downloads\\final.zip", path: "C:\\Users\\me\\Downloads\\final.zip" }),
])
assert.equal(
  renamedInFolder.icons.find((icon) => icon.path?.endsWith("final.zip"))?.groupId,
  "zips",
  "renaming inside a live folder keeps the group row",
)

// --- what a drop is allowed to file ---------------------------------------
// A drawer mirroring a folder on disk is not a filing cabinet in either
// direction, and a drilled row is not state at all.
const rooms = [
  { id: "apps", folderPath: null },
  { id: "downloads", folderPath: "C:\Users\me\Downloads" },
]
const onDesk = new Set(["a", "b"])

assert.deepEqual(
  fileableIds(rooms, "apps", [{ id: "a", alcoveId: "inbox" }], onDesk),
  ["a"],
  "an ordinary drawer takes an ordinary icon",
)
assert.deepEqual(
  fileableIds(rooms, "downloads", [{ id: "a", alcoveId: "inbox" }], onDesk),
  [],
  "nothing can be filed into a drawer that mirrors a folder",
)
assert.deepEqual(
  fileableIds(rooms, "apps", [{ id: "a", alcoveId: "downloads" }], onDesk),
  [],
  "nothing can be filed out of a drawer that mirrors a folder",
)
assert.deepEqual(
  fileableIds(rooms, "apps", [{ id: "ghost", alcoveId: null }], onDesk),
  [],
  "a drilled row is a view, not state, so it files nowhere",
)
assert.deepEqual(
  fileableIds(
    rooms,
    "apps",
    [{ id: "a", alcoveId: "inbox" }, { id: "ghost", alcoveId: null }],
    onDesk,
  ),
  ["a"],
  "a mixed drop files the real icons and drops the rest",
)

console.log("harvest merge: all checks passed")
