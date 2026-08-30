/**
 * Per-Alcove file weight. Run: npm run check
 */
import assert from "node:assert/strict"
import { disproportionateId, largestIcon, totalByteSize } from "./weight.ts"
import type { DesktopIcon } from "../types.ts"

function icon(
  id: string,
  byteSize?: number | null,
  kind: DesktopIcon["kind"] = "document",
): DesktopIcon {
  return {
    id,
    name: id,
    kind,
    alcoveId: "downloads",
    groupHint: "files",
    byteSize,
  }
}

assert.equal(totalByteSize([]), 0)
assert.equal(totalByteSize([icon("a", 1000), icon("b", 24)]), 1024)
assert.equal(
  totalByteSize([icon("a", 500), icon("Old stuff", null, "folder"), icon("c", null)]),
  500,
  "folders and unsized entries add nothing",
)

assert.equal(largestIcon([]), null)
assert.equal(largestIcon([icon("Old stuff", null, "folder"), icon("c", null)]), null)
assert.equal(largestIcon([icon("a", 10), icon("b", 90)])?.id, "b")

assert.equal(disproportionateId([]), null)
assert.equal(
  disproportionateId([{ id: "solo", bytes: 900 }]),
  null,
  "one sized drawer has nothing to outweigh",
)
assert.equal(
  disproportionateId([
    { id: "a", bytes: 100 },
    { id: "b", bytes: 60 },
  ]),
  null,
  "a balanced desk colours nothing",
)
assert.equal(
  disproportionateId([
    { id: "a", bytes: 100 },
    { id: "big", bytes: 900 },
    { id: "c", bytes: 50 },
  ]),
  "big",
  "twice the runner-up is worth a colour",
)
assert.equal(
  disproportionateId([
    { id: "a", bytes: 100 },
    { id: "b", bytes: 200 },
    { id: "empty", bytes: 0 },
  ]),
  "b",
  "empty drawers are not runners-up",
)

console.log("weight: all checks passed")
