/**
 * Drawer order on the shelf rail. Run: npm run check
 */
import assert from "node:assert/strict"
import { reorderAlcoves } from "./alcove-order.ts"
import type { Alcove } from "../types.ts"

function drawer(id: string, order: number, isInbox = false): Alcove {
  return {
    id,
    name: id,
    color: "sky",
    collapsed: false,
    isInbox,
    order,
    page: 0,
  }
}

function ids(alcoves: Alcove[]) {
  return [...alcoves]
    .sort((a, b) => a.order - b.order)
    .map((alcove) => alcove.id)
}

const inbox = drawer("inbox", 0, true)
const apps = drawer("apps", 1)
const docs = drawer("docs", 2)
const games = drawer("games", 3)
const list = [inbox, apps, docs, games]

assert.deepEqual(ids(reorderAlcoves(list, "apps", "docs")), [
  "inbox",
  "docs",
  "apps",
  "games",
])
assert.deepEqual(ids(reorderAlcoves(list, "games", "apps")), [
  "inbox",
  "games",
  "apps",
  "docs",
])
assert.deepEqual(
  ids(reorderAlcoves(list, "games", "inbox")),
  ["games", "inbox", "apps", "docs"],
  "drop on Inbox takes the first slot; the rail still pins Inbox at the top",
)

const railAfterInboxDrop = reorderAlcoves(list, "games", "inbox")
assert.deepEqual(
  railAfterInboxDrop.filter((alcove) => !alcove.isInbox).map((alcove) => alcove.id),
  ["games", "apps", "docs"],
)

assert.equal(reorderAlcoves(list, "apps", "apps"), list)
assert.equal(reorderAlcoves(list, "missing", "apps"), list)
assert.equal(
  reorderAlcoves(list, "inbox", "games"),
  list,
  "Inbox stays put",
)

const orders = reorderAlcoves(list, "docs", "games").map((alcove) => alcove.order)
assert.deepEqual(orders, [0, 1, 2, 3])

console.log("alcove-order.check ok")
