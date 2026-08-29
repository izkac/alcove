/**
 * Catalog for the frequent-strip system shortcuts. Run: npm run check
 */
import assert from "node:assert/strict"
import {
  DEFAULT_STRIP_TOOL_IDS,
  migrateStripToolIds,
  STRIP_TOOLS,
  toggleStripToolId,
  toolsForIds,
} from "./strip-tools.ts"

const ids = STRIP_TOOLS.map((tool) => tool.id)
assert.equal(new Set(ids).size, ids.length, "tool ids must be unique")
assert.ok(
  DEFAULT_STRIP_TOOL_IDS.every((id) => ids.includes(id)),
  "defaults must exist in the catalog",
)

assert.deepEqual(
  migrateStripToolIds(undefined),
  [...DEFAULT_STRIP_TOOL_IDS],
  "old saves without the field get Command Prompt, Control Panel, Services",
)
assert.deepEqual(migrateStripToolIds([]), [])
assert.deepEqual(migrateStripToolIds(["cmd", "nope", "cmd"]), ["cmd"])

assert.deepEqual(
  toolsForIds(undefined).map((tool) => tool.id),
  ["control", "services", "cmd"],
  "missing ids fall back to defaults, in catalog order",
)

const selected = toolsForIds(["services", "cmd", "control"])
assert.deepEqual(
  selected.map((tool) => tool.id),
  ["control", "services", "cmd"],
  "strip order follows the catalog, not click order",
)

assert.deepEqual(toggleStripToolId(["cmd"], "control"), ["cmd", "control"])
assert.deepEqual(toggleStripToolId(["cmd", "control"], "cmd"), ["control"])
assert.deepEqual(toggleStripToolId(["cmd"], "nope"), ["cmd"])

console.log("strip tools: all checks passed")
