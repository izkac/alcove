/**
 * Which drawers appear on which monitor rail. Run: npm run check
 */
import assert from "node:assert/strict"
import { alcovesOnDesk, homeDeskId, type DeskInfo } from "./desk-strip.ts"
import type { Alcove } from "../types.ts"

const left: DeskInfo = { id: "DISPLAY1", name: "Display 1", primary: true }
const right: DeskInfo = { id: "DISPLAY2", name: "Display 2", primary: false }
const desks = [left, right]

function drawer(id: string, stripId?: string | null, isInbox = false): Alcove {
  return {
    id,
    name: id,
    color: "sky",
    collapsed: false,
    isInbox,
    order: 0,
    page: 0,
    stripId,
  }
}

const inbox = drawer("inbox", null, true)
const apps = drawer("apps", "DISPLAY1")
const docs = drawer("docs", "DISPLAY2")
const orphan = drawer("old", "DISPLAY-GONE")
const unset = drawer("new", null)

assert.equal(homeDeskId("DISPLAY2", ["DISPLAY1", "DISPLAY2"], "DISPLAY1"), "DISPLAY2")
assert.equal(homeDeskId(null, ["DISPLAY1", "DISPLAY2"], "DISPLAY1"), "DISPLAY1")
assert.equal(
  homeDeskId("DISPLAY-GONE", ["DISPLAY1", "DISPLAY2"], "DISPLAY1"),
  "DISPLAY1",
  "unplugged strip merges onto primary without rewriting",
)

const all = [inbox, apps, docs, orphan, unset]
assert.deepEqual(
  alcovesOnDesk(all, left, desks).map((item) => item.id),
  ["inbox", "apps", "old", "new"],
)
assert.deepEqual(
  alcovesOnDesk(all, right, desks).map((item) => item.id),
  ["inbox", "docs"],
)

assert.deepEqual(
  alcovesOnDesk(all, left, [left]).map((item) => item.id),
  ["inbox", "apps", "docs", "old", "new"],
  "a lone remaining monitor shows every non-inbox drawer",
)

console.log("desk-strip.check ok")
