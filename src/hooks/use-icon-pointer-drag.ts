import { useCallback, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import type { DesktopIcon } from "@/types"

export type IconDropTarget =
  | { kind: "alcove"; id: string }
  | { kind: "pin" }
  | { kind: "wallpaper" }

type DragState = {
  icon: DesktopIcon
  x: number
  y: number
}

const DRAG_THRESHOLD = 6

export function useIconPointerDrag(
  onDrop: (icon: DesktopIcon, target: IconDropTarget) => void,
) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const originRef = useRef<{ icon: DesktopIcon; x: number; y: number } | null>(
    null,
  )
  const draggingRef = useRef(false)
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop

  const resolveTarget = useCallback((x: number, y: number): IconDropTarget => {
    const stack = document.elementsFromPoint(x, y)
    for (const node of stack) {
      if (!(node instanceof Element)) continue
      if (node.closest("[data-drag-ghost]")) continue
      const alcove = node.closest("[data-alcove-id]")
      if (alcove instanceof HTMLElement && alcove.dataset.alcoveId) {
        return { kind: "alcove", id: alcove.dataset.alcoveId }
      }
      if (node.closest("[data-pin-rail]")) {
        return { kind: "pin" }
      }
    }
    return { kind: "wallpaper" }
  }, [])

  const onPointerDown = useCallback(
    (icon: DesktopIcon, event: ReactPointerEvent) => {
      if (event.button !== 0) return
      originRef.current = { icon, x: event.clientX, y: event.clientY }
      draggingRef.current = false

      const onMove = (moveEvent: PointerEvent) => {
        const origin = originRef.current
        if (!origin) return
        const dx = moveEvent.clientX - origin.x
        const dy = moveEvent.clientY - origin.y
        if (!draggingRef.current) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
          draggingRef.current = true
        }
        setDrag({
          icon: origin.icon,
          x: moveEvent.clientX,
          y: moveEvent.clientY,
        })
      }

      const onUp = (upEvent: PointerEvent) => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        window.removeEventListener("pointercancel", onUp)
        const origin = originRef.current
        const wasDragging = draggingRef.current
        originRef.current = null
        draggingRef.current = false
        setDrag(null)
        if (!origin || !wasDragging) return
        onDropRef.current(origin.icon, resolveTarget(upEvent.clientX, upEvent.clientY))
      }

      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
      window.addEventListener("pointercancel", onUp)
    },
    [resolveTarget],
  )

  return {
    drag,
    onPointerDown,
  }
}
