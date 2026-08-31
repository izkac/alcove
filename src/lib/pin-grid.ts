import type { PinSpot } from "@/types"

/**
 * The wallpaper grid parked icons snap to.
 *
 * Windows spaces desktop icons on a grid for a reason: free pixels mean two
 * icons landing on top of each other, and a resolution change leaving one
 * off-screen forever. Cells make both impossible — a smaller screen just
 * re-lays the same cells, and a taken cell is an integer comparison.
 */
export const PIN_CELL_W = 88
export const PIN_CELL_H = 98

export type Cell = { col: number; row: number }

/**
 * The patch of desktop the grid covers: right of the rail, below the strip.
 *
 * Measured rather than hard-coded, so the grid follows the chrome instead of
 * parking icons underneath it when a strip moves or a rail changes size.
 */
export function fieldRect() {
  const el =
    typeof document === "undefined"
      ? null
      : document.querySelector("[data-pin-origin]")
  if (el) {
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) return rect
  }
  return new DOMRect(0, 0, window.innerWidth, window.innerHeight)
}

const keyOf = (cell: Cell) => `${cell.col},${cell.row}`

export function gridSize(width: number, height: number) {
  return {
    cols: Math.max(1, Math.floor(width / PIN_CELL_W)),
    rows: Math.max(1, Math.floor(height / PIN_CELL_H)),
  }
}

export function clampCell(cell: Cell, width: number, height: number): Cell {
  const { cols, rows } = gridSize(width, height)
  return {
    col: Math.min(Math.max(0, Math.round(cell.col)), cols - 1),
    row: Math.min(Math.max(0, Math.round(cell.row)), rows - 1),
  }
}

/** The cell under a drop point. The icon centres on the pointer, not its corner. */
export function cellAt(x: number, y: number, width: number, height: number): Cell {
  return clampCell(
    {
      col: Math.round((x - PIN_CELL_W / 2) / PIN_CELL_W),
      row: Math.round((y - PIN_CELL_H / 2) / PIN_CELL_H),
    },
    width,
    height,
  )
}

export function cellStyle(cell: Cell) {
  return { left: cell.col * PIN_CELL_W, top: cell.row * PIN_CELL_H }
}

/**
 * The wanted cell, or the nearest empty one to it.
 *
 * Nearest, not "next in reading order": a drop on an occupied cell at the foot
 * of the screen has to land beside it, not at the top of the next column, or
 * the icon appears to fly away from the pointer. Ties go below first, then
 * right, which is where a hand expects the next one to sit.
 */
export function freeCell(
  taken: Iterable<Cell>,
  wanted: Cell,
  width: number,
  height: number,
): Cell {
  const { cols, rows } = gridSize(width, height)
  const start = clampCell(wanted, width, height)
  const used = new Set<string>()
  for (const cell of taken) used.add(keyOf(cell))
  if (!used.has(keyOf(start))) return start
  let best: Cell | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      if (used.has(keyOf({ col, row }))) continue
      const dc = col - start.col
      const dr = row - start.row
      const dist = dc * dc + dr * dr
      if (best) {
        if (dist > bestDist) continue
        // Same distance: below beats above, right beats left.
        if (dist === bestDist && row <= best.row && (row < best.row || col < best.col)) {
          continue
        }
      }
      best = { col, row }
      bestDist = dist
    }
  }
  // ponytail: grid full — stack on the wanted cell. Whoever fills 200 cells has
  // a bigger problem than an overlap, and this app exists to fix that one.
  return best ?? start
}

/** Parked pins for one monitor, clamped to what that monitor can show. */
export function spotsOnDesk(
  pinAt: Record<string, PinSpot> | undefined,
  deskId: string,
  width: number,
  height: number,
): { id: string; cell: Cell }[] {
  if (!pinAt) return []
  const seen = new Set<string>()
  const out: { id: string; cell: Cell }[] = []
  for (const [id, spot] of Object.entries(pinAt)) {
    if (spot.deskId != null && spot.deskId !== deskId) continue
    let cell = clampCell(spot, width, height)
    // Clamping can pile two icons onto one edge cell, so re-seat the loser.
    if (seen.has(keyOf(cell))) {
      cell = freeCell(
        out.map((item) => item.cell),
        cell,
        width,
        height,
      )
    }
    seen.add(keyOf(cell))
    out.push({ id, cell })
  }
  return out
}
