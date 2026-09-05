import assert from "node:assert/strict"
import { samePersistentState, serializeDesktopState } from "./persistent-state.ts"
import type { DesktopState } from "../types.ts"

const state: DesktopState = {
  phase: "ready", alcoves: [], icons: [{ id: "file", name: "File", kind: "document", groupHint: "files", alcoveId: null, imageUrl: "large-art" }],
  pinIds: [], density: "comfortable", layoutId: "work", layoutSnapshots: { work: {}, home: {}, clean: {} },
  focusMode: false, stripEdge: "top", focusedAlcoveId: null, highlightedIconId: null,
  frecency: {}, topSlots: [], topKeep: [], topHide: [],
}
const focus = { ...state, focusedAlcoveId: "drawer", highlightedIconId: "file" }
assert.ok(samePersistentState(state, focus), "temporary focus/highlight skips serialization")
assert.equal(serializeDesktopState(state), serializeDesktopState(focus))
assert.equal(samePersistentState(state, { ...state, density: "compact" }), false)
assert.equal(samePersistentState(state, { ...state, icons: [...state.icons] }), false)
const saved = JSON.parse(serializeDesktopState(focus))
assert.equal(saved.icons[0].imageUrl, undefined)
assert.equal(saved.focusedAlcoveId, null)
assert.equal(saved.highlightedIconId, null)
assert.equal(saved.icons[0].id, "file")
console.log("persistent state checks passed")
