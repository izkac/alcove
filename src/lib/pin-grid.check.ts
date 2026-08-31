/**
 * Self-check for parked-pin placement. Run: npm run check
 *
 * The point of the grid is that an icon can never be lost — not under another
 * icon, and not off the edge of a screen that shrank — so that is what these
 * assert.
 */
import assert from "node:assert/strict"
import {
  PIN_CELL_H,
  PIN_CELL_W,
  cellAt,
  clampCell,
  freeCell,
  gridSize,
  spotsOnDesk,
} from "./pin-grid.ts"

const W = 1920
const H = 1080

// A drop lands on the cell the pointer sits in, tile centred on the pointer.
assert.deepEqual(cellAt(PIN_CELL_W / 2, PIN_CELL_H / 2, W, H), { col: 0, row: 0 })
assert.deepEqual(
  cellAt(PIN_CELL_W * 3 + PIN_CELL_W / 2, PIN_CELL_H * 2 + PIN_CELL_H / 2, W, H),
  { col: 3, row: 2 },
)

// Off-screen drops (a stray pointer, a monitor edge) still land on the grid.
const { cols, rows } = gridSize(W, H)
assert.deepEqual(cellAt(-500, -500, W, H), { col: 0, row: 0 })
assert.deepEqual(cellAt(99_999, 99_999, W, H), { col: cols - 1, row: rows - 1 })

// A taken cell pushes the newcomer to the cell below, not on top of the sitter.
const taken = [{ col: 2, row: 1 }]
assert.deepEqual(freeCell(taken, { col: 2, row: 1 }, W, H), { col: 2, row: 2 })
assert.deepEqual(freeCell(taken, { col: 2, row: 3 }, W, H), { col: 2, row: 3 })

// A full column spills sideways, into the cell beside the drop.
const column = Array.from({ length: rows }, (_, row) => ({ col: 0, row }))
assert.deepEqual(freeCell(column, { col: 0, row: 4 }, W, H), { col: 1, row: 4 })

// A drop on the bottom row lands beside the sitter, never at the top of the
// next column -- an icon that flies to the far corner reads as a lost icon.
assert.deepEqual(
  freeCell([{ col: 5, row: rows - 1 }], { col: 5, row: rows - 1 }, W, H),
  { col: 6, row: rows - 1 },
)

// A full grid stacks rather than throwing — worst case, not an error case.
const everything: { col: number; row: number }[] = []
for (let col = 0; col < cols; col += 1) {
  for (let row = 0; row < rows; row += 1) everything.push({ col, row })
}
assert.deepEqual(freeCell(everything, { col: 4, row: 4 }, W, H), { col: 4, row: 4 })

// Shrinking the screen pulls icons back on-screen instead of losing them.
assert.deepEqual(clampCell({ col: 40, row: 30 }, 800, 600), { col: 8, row: 5 })

// ...and two icons squashed onto the same edge cell get separated.
const squashed = spotsOnDesk(
  { a: { col: 40, row: 30 }, b: { col: 44, row: 33 } },
  "desk-1",
  800,
  600,
)
assert.equal(squashed.length, 2)
assert.notDeepEqual(squashed[0].cell, squashed[1].cell)

// A pin parked on another monitor stays there. Null means every desk shows it.
const perDesk = spotsOnDesk(
  {
    here: { col: 1, row: 1, deskId: "desk-1" },
    there: { col: 1, row: 2, deskId: "desk-2" },
    everywhere: { col: 1, row: 3, deskId: null },
  },
  "desk-1",
  W,
  H,
)
assert.deepEqual(
  perDesk.map((item) => item.id),
  ["here", "everywhere"],
)
assert.deepEqual(spotsOnDesk(undefined, "desk-1", W, H), [])

console.log("pin-grid.check.ts OK")
