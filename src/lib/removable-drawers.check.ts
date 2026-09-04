/**
 * Self-check for removable-drive drawer sync. Run: npm run check
 */
import assert from "node:assert/strict"
import { dropDriveDrawer, stripRemovable, syncDriveDrawers } from "./removable-drawers.ts"
import { INBOX_ID } from "../data/sample.ts"
import type { Alcove, DesktopIcon, DesktopState, RemovableDrive } from "../types.ts"

function alcove(overrides: Partial<Alcove> = {}): Alcove {
  return {
    id: "keep",
    name: "Apps",
    color: "sky",
    collapsed: false,
    isInbox: false,
    order: 1,
    page: 0,
    ...overrides,
  }
}

function baseState(overrides: Partial<DesktopState> = {}): DesktopState {
  return {
    phase: "ready",
    alcoves: [alcove({ id: "inbox", isInbox: true, order: 0 }), alcove()],
    icons: [],
    pinIds: [],
    density: "comfortable",
    layoutId: "work",
    layoutSnapshots: { work: {}, home: {}, clean: {} },
    focusMode: false,
    stripEdge: "top",
    focusedAlcoveId: "keep",
    highlightedIconId: null,
    frecency: {},
    topSlots: [],
    topKeep: [],
    topHide: [],
    stripToolIds: [],
    ...overrides,
  }
}

const stick: RemovableDrive = { root: "E:\\", name: "FIELDWORK" }

// Insert adds one drawer for a drive with no drawer yet.
{
  const state = baseState()
  const next = syncDriveDrawers(state, [stick], true)
  assert.notEqual(next, state, "a new drive changes the state object")
  assert.equal(next.alcoves.length, 3)
  const drawer = next.alcoves.find((a) => a.removable)
  assert.ok(drawer, "a removable drawer was added")
  assert.equal(drawer!.folderPath, "E:\\")
  assert.equal(drawer!.removable, "E:\\")
  assert.equal(drawer!.name, "FIELDWORK")
  assert.equal(drawer!.isInbox, false)
  assert.equal(drawer!.collapsed, false)
  assert.ok(drawer!.order > 1, "sits above every existing alcove")
  assert.equal(drawer!.page, 0)
  // The untouched, non-inbox non-removable alcove is unaffected.
  const untouched = next.alcoves.find((a) => a.id === "keep")
  assert.deepEqual(untouched, state.alcoves[1])
}

// A second poll for the same drive is a no-op: identical object back.
{
  const state = baseState()
  const first = syncDriveDrawers(state, [stick], true)
  const second = syncDriveDrawers(first, [stick], true)
  assert.equal(second, first, "an unchanged drive list returns the SAME object")
}

// Removal drops the drawer, its icons, and its layout-snapshot entries.
{
  const state = baseState()
  const withDrawer = syncDriveDrawers(state, [stick], true)
  const drawerId = withDrawer.alcoves.find((a) => a.removable)!.id
  const withIcon: DesktopState = {
    ...withDrawer,
    icons: [
      { id: "f1", name: "notes.txt", kind: "document", alcoveId: drawerId, groupHint: "" },
    ],
    layoutSnapshots: {
      work: { ...withDrawer.layoutSnapshots.work, [drawerId]: false },
      home: { ...withDrawer.layoutSnapshots.home, [drawerId]: true },
      clean: { ...withDrawer.layoutSnapshots.clean, [drawerId]: true },
    },
    focusedAlcoveId: drawerId,
  }
  const gone = syncDriveDrawers(withIcon, [], true)
  assert.equal(gone.alcoves.some((a) => a.id === drawerId), false)
  assert.equal(gone.icons.some((icon) => icon.alcoveId === drawerId), false)
  assert.equal(drawerId in gone.layoutSnapshots.work, false)
  assert.equal(drawerId in gone.layoutSnapshots.home, false)
  assert.equal(drawerId in gone.layoutSnapshots.clean, false)
  assert.equal(gone.focusedAlcoveId, INBOX_ID, "focus falls back to the Inbox")
}

// An icon dragged out of a USB drawer and parked on the wallpaper must not
// leave its desk cell reserved after the stick is pulled: parkIcons reads
// pinAt to find free cells, so a stale entry blocks that cell forever with
// nothing drawn in it.
{
  const state = baseState()
  const withDrawer = syncDriveDrawers(state, [stick], true)
  const drawerId = withDrawer.alcoves.find((a) => a.removable)!.id
  const parked: DesktopState = {
    ...withDrawer,
    icons: [
      { id: "f1", name: "notes.txt", kind: "document", alcoveId: drawerId, groupHint: "" },
      { id: "d1", name: "desk.txt", kind: "document", alcoveId: null, groupHint: "" },
    ],
    pinIds: ["f1", "d1"],
    pinAt: { f1: { col: 2, row: 3 }, d1: { col: 0, row: 0 } },
  }
  const gone = syncDriveDrawers(parked, [], true)
  assert.equal(gone.pinIds.includes("f1"), false, "the drive icon leaves the pin list")
  assert.equal("f1" in (gone.pinAt ?? {}), false, "its desk cell is released")
  assert.equal(gone.pinIds.includes("d1"), true, "a desktop icon's pin is untouched")
  assert.deepEqual(gone.pinAt?.d1, { col: 0, row: 0 })

  // Ejecting takes the same path, so it must release the cell too.
  const ejected = dropDriveDrawer(parked, drawerId)
  assert.equal(ejected.alcoves.some((a) => a.id === drawerId), false)
  assert.equal("f1" in (ejected.pinAt ?? {}), false, "eject releases the cell as well")
  assert.equal(ejected.pinIds.includes("d1"), true)
  assert.equal(
    dropDriveDrawer(parked, "no-such-alcove"),
    parked,
    "dropping an unknown id changes nothing",
  )
}

// A drive reporting a new label renames the drawer in place, same id.
{
  const state = baseState()
  const withDrawer = syncDriveDrawers(state, [stick], true)
  const drawerId = withDrawer.alcoves.find((a) => a.removable)!.id
  const relabelled: RemovableDrive = { root: "E:\\", name: "TRAILCAM" }
  const renamed = syncDriveDrawers(withDrawer, [relabelled], true)
  const drawer = renamed.alcoves.find((a) => a.id === drawerId)
  assert.ok(drawer, "same drawer id kept across a relabel")
  assert.equal(drawer!.name, "TRAILCAM")
  assert.equal(renamed.alcoves.length, withDrawer.alcoves.length)
}

// Trailing backslash / case differences still match the same drive.
{
  const state = baseState()
  const withDrawer = syncDriveDrawers(state, [stick], true)
  const stillHere: RemovableDrive = { root: "e:", name: "FIELDWORK" }
  const again = syncDriveDrawers(withDrawer, [stillHere], true)
  assert.equal(again, withDrawer, "a missing backslash / case change is the same drive")
}

// enabled:false clears every removable drawer and leaves ordinary ones alone.
{
  const state = baseState()
  const withDrawer = syncDriveDrawers(state, [stick], true)
  const cleared = syncDriveDrawers(withDrawer, [stick], false)
  assert.equal(cleared.alcoves.some((a) => a.removable), false)
  assert.equal(cleared.alcoves.some((a) => a.id === "keep"), true)
  assert.equal(cleared.alcoves.some((a) => a.id === "inbox"), true)
  // Already clear: disabling again with no removable drawers changes nothing.
  const still = syncDriveDrawers(cleared, [stick], false)
  assert.equal(still, cleared)
}

// stripRemovable: used directly by storage.ts's serialize()/migrate().
{
  const state = baseState()
  const withDrawer = syncDriveDrawers(state, [stick], true)
  const drawerId = withDrawer.alcoves.find((a) => a.removable)!.id
  const withIcon: DesktopState = {
    ...withDrawer,
    icons: [
      { id: "f1", name: "notes.txt", kind: "document", alcoveId: drawerId, groupHint: "" } as DesktopIcon,
    ],
  }
  const stripped = stripRemovable(withIcon)
  assert.equal(stripped.alcoves.some((a) => a.removable), false)
  assert.equal(stripped.icons.length, 0)
  // Nothing removable: identical object back.
  const untouched = stripRemovable(state)
  assert.equal(untouched, state)
}

console.log("removable-drawers check ok")
