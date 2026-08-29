/**
 * Self-check for the frequent strip and the drawer view rule. Run: npm run check
 *
 * The strip is only worth having if it stays still, so most of these assertions
 * are about stability: slots keep their index, and a near-tie never swaps.
 */
import assert from "node:assert/strict"
import { CANVAS_MIN_ITEMS, viewFor } from "./alcove-view.ts"
import { TOP_SLOTS, recordOpen, refreshSlots, scoreAt } from "./frecency.ts"
import type { Frecency } from "./frecency.ts"

const DAY = 24 * 60 * 60 * 1000
const now = 1_700_000_000_000
const always = () => true
const opts = { now, exists: always, keep: [] as string[], hide: [] as string[] }
const empty: (string | null)[] = Array.from({ length: TOP_SLOTS }, () => null)

function opens(id: string, times: number, at = now): Frecency {
  let store: Frecency = {}
  for (let i = 0; i < times; i += 1) store = recordOpen(store, id, at)
  return store
}

// Opens decay: one open two weeks ago is worth half of one open now.
assert.equal(scoreAt({ score: 1, at: now - 14 * DAY }, now), 0.5)
assert.equal(scoreAt(undefined, now), 0)

// Empty slots fill from the strongest candidate down.
const filled = refreshSlots(empty, { ...opens("a", 3), ...opens("b", 5) }, opts)
assert.deepEqual(filled.slice(0, 2), ["b", "a"])

// An incumbent keeps its index even when its rank slips beneath a slot-mate.
const ranked = refreshSlots(
  ["a", "b", ...empty.slice(2)],
  { ...opens("a", 1), ...opens("b", 9) },
  opts,
)
assert.deepEqual(ranked.slice(0, 2), ["a", "b"], "ranks must not re-sort slots")

// A near-tie challenger does NOT evict — this is the anti-churn guarantee.
const full = Array.from({ length: TOP_SLOTS }, (_, i) => `slot${i}`)
let heavy: Frecency = {}
for (const id of full) heavy = { ...heavy, ...opens(id, 10) }
const nearTie = refreshSlots(full, { ...heavy, ...opens("new", 12) }, opts)
assert.deepEqual(nearTie, full, "1.2x challenger must not displace an incumbent")

// A clear challenger takes exactly one slot: the weakest, leaving the rest put.
let mixed: Frecency = {}
for (const id of full) mixed = { ...mixed, ...opens(id, 10) }
mixed = { ...mixed, ...opens("slot3", 2) }
const evicted = refreshSlots(full, { ...mixed, ...opens("new", 20) }, opts)
assert.equal(evicted[3], "new", "challenger takes the weakest slot")
assert.equal(evicted.filter((id) => id === null).length, 0)
assert.deepEqual(
  evicted.filter((_, i) => i !== 3),
  full.filter((_, i) => i !== 3),
  "no other slot may move",
)

// Locking a slot protects it even when it is the weakest.
const locked = refreshSlots(full, { ...mixed, ...opens("new", 20) }, {
  ...opts,
  keep: ["slot3"],
})
assert.equal(locked[3], "slot3", "kept slots are never evicted")
assert.ok(locked.includes("new"), "challenger still lands elsewhere")

// Hidden and deleted icons leave their slot, and hidden ones cannot come back.
const hidden = refreshSlots(["a", "b", ...empty.slice(2)], opens("a", 5), {
  ...opts,
  hide: ["a"],
})
assert.ok(!hidden.includes("a"), "hidden icons stay off the strip")

const gone = refreshSlots(["a", ...empty.slice(1)], opens("a", 5), {
  ...opts,
  exists: (id) => id !== "a",
})
assert.deepEqual(gone, empty, "deleted icons free their slot")

// A drawer opens as canvas only once a panel would start scrolling…
assert.equal(viewFor({}, CANVAS_MIN_ITEMS), "panel")
assert.equal(viewFor({}, CANVAS_MIN_ITEMS + 1), "canvas")
// …and an explicit choice always beats the count, in both directions.
assert.equal(viewFor({ view: "panel" }, 500), "panel")
assert.equal(viewFor({ view: "canvas" }, 0), "canvas")

console.log("frecency + view rule: all checks passed")
