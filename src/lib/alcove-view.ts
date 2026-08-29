import type { Alcove, AlcoveView } from "@/types"

/** Above this, a drawer is a scroll well in panel view, so it opens as canvas. */
export const CANVAS_MIN_ITEMS = 12

/** An explicit choice always wins; otherwise size decides. */
export function viewFor(alcove: Pick<Alcove, "view">, count: number): AlcoveView {
  return alcove.view ?? (count > CANVAS_MIN_ITEMS ? "canvas" : "panel")
}
