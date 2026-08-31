/**
 * Multi-select and which icons a drag takes with it. Run: npm run check
 */
import assert from "node:assert/strict"
import { dragIconIds, iconPack, rangeIconIds, toggleIconId } from "./icon-select.ts"
import type { DesktopIcon } from "../types.ts"

assert.deepEqual(toggleIconId([], "a"), ["a"])
assert.deepEqual(toggleIconId(["a"], "a"), [])
assert.deepEqual(toggleIconId(["a"], "b"), ["a", "b"])

const row = ["a", "b", "c", "d"]
assert.deepEqual(rangeIconIds(row, "b", "d"), ["b", "c", "d"])
assert.deepEqual(rangeIconIds(row, "d", "b"), ["b", "c", "d"])
assert.deepEqual(rangeIconIds(row, "a", "a"), ["a"])
assert.deepEqual(rangeIconIds(row, "missing", "c"), ["c"])

assert.deepEqual(dragIconIds(["a", "c"], "c"), ["c", "a"])
assert.deepEqual(
  dragIconIds(["a", "c"], "b"),
  ["b"],
  "grabbing an unselected icon leaves the rest behind",
)
assert.deepEqual(dragIconIds(["a"], "a"), ["a"])

function icon(id: string): DesktopIcon {
  return {
    id,
    name: id,
    kind: "app",
    alcoveId: "apps",
    groupHint: id,
  }
}

const a = icon("a")
const b = icon("b")
const c = icon("c")
assert.deepEqual(
  iconPack(c, ["a", "c"], [a, b, c]).map((item) => item.id),
  ["c", "a"],
)
assert.deepEqual(
  iconPack(b, ["a", "c"], [a, b, c]).map((item) => item.id),
  ["b"],
)

console.log("icon-select.check ok")
