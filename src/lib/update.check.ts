/**
 * Self-check for the licence nudge timing. Run: npm run check
 *
 * This is the one place Alcove asks for money unprompted, so the only thing
 * worth asserting is that it stays rare: never early, never twice, never at all
 * on a desk that has not been used for a month.
 */
import assert from "node:assert/strict"
import { shouldNudge } from "./update.ts"

const DAY = 24 * 60 * 60 * 1000
const now = 1_800_000_000_000

assert.equal(shouldNudge(now - 31 * DAY, null, now), true, "a month of use earns one ask")
assert.equal(shouldNudge(now - 29 * DAY, null, now), false, "not before a month")
assert.equal(shouldNudge(now - 30 * DAY + 1, null, now), false, "not a day early")

assert.equal(
  shouldNudge(now - 400 * DAY, now - 300 * DAY, now),
  false,
  "asked once is asked forever — dismissal never expires",
)

assert.equal(
  shouldNudge(undefined, null, now),
  false,
  "a desk with no first run yet is never nudged",
)

// A layout saved before firstRunAt existed gets stamped on load, so its clock
// starts then. Erring towards asking late is the correct direction.
assert.equal(shouldNudge(now, null, now), false, "a fresh stamp waits its month")

console.log("update.check ok")
