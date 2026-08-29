import { useCallback, useEffect, useRef } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import type { DesktopIcon } from "@/types"

export type IconDropTarget =
  | { kind: "alcove"; id: string }
  | { kind: "group"; alcoveId: string; groupId: string | null }
  | { kind: "pin" }
  | { kind: "wallpaper" }

const DRAG_THRESHOLD = 6
const GHOST_ID = "alcove-drag-ghost"
const HOVER_ATTR = "data-drop-hover"
const SOURCE_ATTR = "data-drag-source"

function ghostEl(): HTMLElement {
  let el = document.getElementById(GHOST_ID)
  if (el instanceof HTMLElement) return el
  el = document.createElement("div")
  el.id = GHOST_ID
  el.dataset.dragGhost = ""
  el.style.cssText =
    "position:fixed;z-index:200;pointer-events:none;transform:translate(-50%,-50%);left:0;top:0;display:none;filter:drop-shadow(0 12px 16px rgb(0 0 0 / 0.45));will-change:left,top"
  document.body.appendChild(el)
  return el
}

function fillGhost(icon: DesktopIcon) {
  const ghost = ghostEl()
  ghost.replaceChildren()
  const source = document.querySelector(
    `[data-desktop-icon="${CSS.escape(icon.id)}"]`,
  )
  const glyph = source?.querySelector("img, div")
  if (glyph instanceof HTMLElement) {
    const clone = glyph.cloneNode(true) as HTMLElement
    clone.style.width = "48px"
    clone.style.height = "48px"
    if (clone instanceof HTMLImageElement) clone.style.objectFit = "contain"
    ghost.appendChild(clone)
  } else {
    ghost.textContent = icon.name
    ghost.style.color = "white"
    ghost.style.fontSize = "12px"
  }
}

function moveGhost(x: number, y: number) {
  const ghost = ghostEl()
  ghost.style.left = `${x}px`
  ghost.style.top = `${y}px`
}

function showGhost(x: number, y: number) {
  const ghost = ghostEl()
  ghost.style.display = "block"
  moveGhost(x, y)
}

function hideGhost() {
  const ghost = document.getElementById(GHOST_ID)
  if (!(ghost instanceof HTMLElement)) return
  ghost.style.display = "none"
  ghost.replaceChildren()
}

function resolveTarget(x: number, y: number): {
  target: IconDropTarget
  hover: Element | null
} {
  const stack = document.elementsFromPoint(x, y)
  for (const node of stack) {
    if (!(node instanceof Element)) continue
    if (node.closest("[data-drag-ghost]")) continue
    const group = node.closest("[data-group-row]")
    if (group instanceof HTMLElement && group.dataset.groupOwner) {
      return {
        target: {
          kind: "group",
          alcoveId: group.dataset.groupOwner,
          groupId: group.dataset.groupRow || null,
        },
        hover: group,
      }
    }
    const alcove = node.closest("[data-alcove-id]")
    if (alcove instanceof HTMLElement && alcove.dataset.alcoveId) {
      return {
        target: { kind: "alcove", id: alcove.dataset.alcoveId },
        hover: alcove,
      }
    }
    if (node.closest("[data-pin-rail]")) {
      const pin = node.closest("[data-pin-rail]")
      return { target: { kind: "pin" }, hover: pin }
    }
  }
  return { target: { kind: "wallpaper" }, hover: null }
}

function setHover(node: Element | null, previous: Element | null) {
  if (previous === node) return node
  if (previous instanceof HTMLElement) previous.removeAttribute(HOVER_ATTR)
  if (node instanceof HTMLElement) node.setAttribute(HOVER_ATTR, "")
  return node
}

function autoScroll(x: number, y: number): boolean {
  const scroller = document.querySelector("[data-drawer-scroll]")
  if (!(scroller instanceof HTMLElement)) return false
  const rect = scroller.getBoundingClientRect()
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
    return false
  }
  const margin = 56
  const step = 22
  if (y < rect.top + margin) {
    scroller.scrollTop -= step
    return scroller.scrollTop > 0
  }
  if (y > rect.bottom - margin) {
    const max = scroller.scrollHeight - scroller.clientHeight
    scroller.scrollTop += step
    return scroller.scrollTop < max
  }
  return false
}

export function useIconPointerDrag(
  onDrop: (icon: DesktopIcon, target: IconDropTarget) => void,
) {
  const originRef = useRef<{ icon: DesktopIcon; x: number; y: number } | null>(
    null,
  )
  const draggingRef = useRef(false)
  const hoverRef = useRef<Element | null>(null)
  const pointRef = useRef({ x: 0, y: 0 })
  const rafRef = useRef(0)
  const onDropRef = useRef(onDrop)

  useEffect(() => {
    onDropRef.current = onDrop
  }, [onDrop])

  const stopRaf = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [])

  const endDrag = useCallback(() => {
    stopRaf()
    draggingRef.current = false
    originRef.current = null
    hideGhost()
    hoverRef.current = setHover(null, hoverRef.current)
    document.body.style.removeProperty("cursor")
    document
      .querySelectorAll(`[${SOURCE_ATTR}]`)
      .forEach((node) => node.removeAttribute(SOURCE_ATTR))
  }, [stopRaf])

  useEffect(() => () => endDrag(), [endDrag])

  const onPointerDown = useCallback(
    (icon: DesktopIcon, event: ReactPointerEvent) => {
      if (event.button !== 0) return
      originRef.current = { icon, x: event.clientX, y: event.clientY }
      draggingRef.current = false

      const paint = () => {
        rafRef.current = 0
        if (!draggingRef.current) return
        const { x, y } = pointRef.current
        moveGhost(x, y)
        hoverRef.current = setHover(resolveTarget(x, y).hover, hoverRef.current)
        if (autoScroll(x, y)) {
          rafRef.current = requestAnimationFrame(paint)
        }
      }

      const onMove = (moveEvent: PointerEvent) => {
        const origin = originRef.current
        if (!origin) return
        pointRef.current = { x: moveEvent.clientX, y: moveEvent.clientY }
        if (!draggingRef.current) {
          const dx = moveEvent.clientX - origin.x
          const dy = moveEvent.clientY - origin.y
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
          draggingRef.current = true
          fillGhost(origin.icon)
          showGhost(moveEvent.clientX, moveEvent.clientY)
          document.body.style.cursor = "grabbing"
          document
            .querySelector(`[data-desktop-icon="${CSS.escape(origin.icon.id)}"]`)
            ?.setAttribute(SOURCE_ATTR, "")
        }
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(paint)
        }
      }

      const onUp = (upEvent: PointerEvent) => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        window.removeEventListener("pointercancel", onUp)
        const origin = originRef.current
        const wasDragging = draggingRef.current
        const x = upEvent.clientX
        const y = upEvent.clientY
        endDrag()
        if (!origin || !wasDragging) return
        onDropRef.current(origin.icon, resolveTarget(x, y).target)
      }

      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
      window.addEventListener("pointercancel", onUp)
    },
    [endDrag],
  )

  return { onPointerDown }
}
