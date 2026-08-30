import { useCallback, useEffect, useRef } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { invoke, isTauri } from "@/lib/tauri"
import {
  deskChannel,
  ghostStaysHere,
  type DeskChannelMessage,
  type DeskHit,
} from "@/lib/desk-strip"
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

function fillGhostFromArt(name: string, imageUrl?: string) {
  const ghost = ghostEl()
  ghost.replaceChildren()
  if (imageUrl) {
    const img = document.createElement("img")
    img.src = imageUrl
    img.alt = ""
    img.draggable = false
    img.style.width = "48px"
    img.style.height = "48px"
    img.style.objectFit = "contain"
    ghost.appendChild(img)
    return
  }
  ghost.textContent = name
  ghost.style.color = "white"
  ghost.style.fontSize = "12px"
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
    fillGhostFromArt(icon.name, icon.imageUrl)
  }
}

function ghostArt(icon: DesktopIcon) {
  const img = ghostEl().querySelector("img")
  return {
    iconId: icon.id,
    name: icon.name,
    imageUrl: img instanceof HTMLImageElement ? img.src : icon.imageUrl,
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

export function resolveTarget(x: number, y: number): {
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
  deskId: string,
  onDrop: (icon: DesktopIcon, target: IconDropTarget) => void,
  onForeignDesk?: (icon: DesktopIcon, hit: DeskHit) => boolean,
  onRemoteDrop?: (iconId: string, x: number, y: number) => void,
) {
  const originRef = useRef<{ icon: DesktopIcon; x: number; y: number } | null>(
    null,
  )
  const draggingRef = useRef(false)
  const handedOffRef = useRef(false)
  const awayRef = useRef(false)
  const hoverRef = useRef<Element | null>(null)
  const pointRef = useRef({ x: 0, y: 0 })
  const rafRef = useRef(0)
  const deskIdRef = useRef(deskId)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const foreignArtRef = useRef<{
    iconId: string
    name: string
    imageUrl?: string
  } | null>(null)
  const foreignHereRef = useRef(false)
  const takeHandoffRef = useRef(false)
  const onDropRef = useRef(onDrop)
  const onForeignRef = useRef(onForeignDesk)
  const onRemoteRef = useRef(onRemoteDrop)

  useEffect(() => {
    deskIdRef.current = deskId
  }, [deskId])

  useEffect(() => {
    onDropRef.current = onDrop
  }, [onDrop])

  useEffect(() => {
    onForeignRef.current = onForeignDesk
  }, [onForeignDesk])

  useEffect(() => {
    onRemoteRef.current = onRemoteDrop
  }, [onRemoteDrop])

  const stopRaf = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [])

  const endDrag = useCallback(() => {
    stopRaf()
    draggingRef.current = false
    handedOffRef.current = false
    awayRef.current = false
    originRef.current = null
    hideGhost()
    hoverRef.current = setHover(null, hoverRef.current)
    document.body.style.removeProperty("cursor")
    document
      .querySelectorAll(`[${SOURCE_ATTR}]`)
      .forEach((node) => node.removeAttribute(SOURCE_ATTR))
  }, [stopRaf])

  const clearForeignGhost = useCallback(() => {
    foreignHereRef.current = false
    takeHandoffRef.current = false
    foreignArtRef.current = null
    hideGhost()
    hoverRef.current = setHover(null, hoverRef.current)
    document.body.style.removeProperty("cursor")
  }, [])

  useEffect(() => () => endDrag(), [endDrag])

  useEffect(() => {
    const channel = deskChannel()
    if (!channel) return
    channelRef.current = channel

    function onMessage(event: MessageEvent<DeskChannelMessage>) {
      const data = event.data
      if (data.type === "icon-drag-begin") {
        if (draggingRef.current) return
        foreignArtRef.current = data
        return
      }
      if (data.type === "icon-ghost") {
        if (draggingRef.current) return
        if (data.deskId !== deskIdRef.current) {
          if (foreignHereRef.current) {
            foreignHereRef.current = false
            hideGhost()
            hoverRef.current = setHover(null, hoverRef.current)
          }
          return
        }
        const art = foreignArtRef.current
        if (!art) return
        foreignHereRef.current = true
        fillGhostFromArt(art.name, art.imageUrl)
        showGhost(data.x, data.y)
        hoverRef.current = setHover(
          resolveTarget(data.x, data.y).hover,
          hoverRef.current,
        )
        document.body.style.cursor = "grabbing"
        return
      }
      if (data.type === "icon-drag-handoff") {
        if (draggingRef.current) return
        takeHandoffRef.current = true
        return
      }
      if (data.type === "icon-ghost-end") {
        // Same-window channel also hears our own "back on this desk" ping.
        if (draggingRef.current && !handedOffRef.current) return
        if (draggingRef.current) {
          endDrag()
          return
        }
        clearForeignGhost()
      }
    }

    function onPointerMove(event: PointerEvent) {
      if (draggingRef.current || !foreignArtRef.current) return
      if (!foreignHereRef.current && !takeHandoffRef.current) return
      foreignHereRef.current = true
      const art = foreignArtRef.current
      fillGhostFromArt(art.name, art.imageUrl)
      showGhost(event.clientX, event.clientY)
      hoverRef.current = setHover(
        resolveTarget(event.clientX, event.clientY).hover,
        hoverRef.current,
      )
      document.body.style.cursor = "grabbing"
    }

    function onPointerUp(event: PointerEvent) {
      if (draggingRef.current || !takeHandoffRef.current) return
      const art = foreignArtRef.current
      if (!art) return
      if (
        event.clientX < 0 ||
        event.clientY < 0 ||
        event.clientX > window.innerWidth ||
        event.clientY > window.innerHeight
      ) {
        return
      }
      const x = event.clientX
      const y = event.clientY
      clearForeignGhost()
      channel?.postMessage({ type: "icon-ghost-end" } satisfies DeskChannelMessage)
      onRemoteRef.current?.(art.iconId, x, y)
    }

    channel.addEventListener("message", onMessage)
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    return () => {
      if (channelRef.current === channel) channelRef.current = null
      channel.removeEventListener("message", onMessage)
      channel.close()
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
    }
  }, [clearForeignGhost, endDrag])

  const onPointerDown = useCallback(
    (icon: DesktopIcon, event: ReactPointerEvent) => {
      if (event.button !== 0) return
      originRef.current = { icon, x: event.clientX, y: event.clientY }
      draggingRef.current = false
      handedOffRef.current = false
      awayRef.current = false
      event.currentTarget.setPointerCapture?.(event.pointerId)

      const paintAway = (hit: DeskHit) => {
        hideGhost()
        hoverRef.current = setHover(null, hoverRef.current)
        const origin = originRef.current
        if (!origin) return
        awayRef.current = true
        channelRef.current?.postMessage({
          type: "icon-ghost",
          deskId: hit.id,
          x: hit.x,
          y: hit.y,
        } satisfies DeskChannelMessage)
      }

      const paintHere = (x: number, y: number) => {
        if (awayRef.current) {
          channelRef.current?.postMessage({
            type: "icon-ghost-end",
          } satisfies DeskChannelMessage)
          awayRef.current = false
          const origin = originRef.current
          if (origin) fillGhost(origin.icon)
        }
        showGhost(x, y)
        hoverRef.current = setHover(resolveTarget(x, y).hover, hoverRef.current)
      }

      const paint = () => {
        rafRef.current = 0
        if (!draggingRef.current || handedOffRef.current) return
        const { x, y } = pointRef.current
        const offscreen =
          x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight
        if (!offscreen && !awayRef.current) {
          paintHere(x, y)
          if (autoScroll(x, y)) {
            rafRef.current = requestAnimationFrame(paint)
          }
          return
        }
        if (!isTauri()) {
          paintHere(x, y)
          return
        }
        invoke<DeskHit | null>("desk_hit")
          .then((hit) => {
            if (!draggingRef.current || handedOffRef.current) return
            if (ghostStaysHere(hit, deskIdRef.current)) {
              paintHere(x, y)
            } else if (hit) {
              paintAway(hit)
            }
            if (awayRef.current || autoScroll(x, y)) {
              rafRef.current = requestAnimationFrame(paint)
            }
          })
          .catch(() => paintHere(x, y))
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
          channelRef.current?.postMessage({
            type: "icon-drag-begin",
            ...ghostArt(origin.icon),
          } satisfies DeskChannelMessage)
        }
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(paint)
        }
      }

      const finishDrop = (origin: DesktopIcon, x: number, y: number) => {
        const done = (target: IconDropTarget) => onDropRef.current(origin, target)
        if (isTauri() && onForeignRef.current) {
          invoke<DeskHit | null>("desk_hit")
            .then((hit) => {
              if (hit && onForeignRef.current?.(origin, hit)) return
              done(resolveTarget(x, y).target)
            })
            .catch(() => done(resolveTarget(x, y).target))
          return
        }
        done(resolveTarget(x, y).target)
      }

      const onUp = (upEvent: PointerEvent) => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        window.removeEventListener("pointercancel", onCancel)
        const origin = originRef.current
        const wasDragging = draggingRef.current
        const handedOff = handedOffRef.current
        const x = upEvent.clientX
        const y = upEvent.clientY
        channelRef.current?.postMessage({
          type: "icon-ghost-end",
        } satisfies DeskChannelMessage)
        endDrag()
        if (!origin || !wasDragging || handedOff) return
        finishDrop(origin.icon, x, y)
      }

      const onCancel = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        window.removeEventListener("pointercancel", onCancel)
        if (!draggingRef.current) {
          endDrag()
          return
        }
        handedOffRef.current = true
        stopRaf()
        hideGhost()
        hoverRef.current = setHover(null, hoverRef.current)
        channelRef.current?.postMessage({
          type: "icon-drag-handoff",
        } satisfies DeskChannelMessage)
        if (isTauri()) {
          invoke<DeskHit | null>("desk_hit")
            .then((hit) => {
              if (!hit || ghostStaysHere(hit, deskIdRef.current)) return
              channelRef.current?.postMessage({
                type: "icon-ghost",
                deskId: hit.id,
                x: hit.x,
                y: hit.y,
              } satisfies DeskChannelMessage)
            })
            .catch(() => undefined)
        }
      }

      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
      window.addEventListener("pointercancel", onCancel)
    },
    [endDrag, stopRaf],
  )

  return { onPointerDown }
}

export function useAlcoveStripDrag(
  currentDeskId: string,
  onMoveToDesk: (alcoveId: string, deskId: string) => void,
) {
  const originRef = useRef<{ id: string; x: number; y: number } | null>(null)
  const draggingRef = useRef(false)
  const movedRef = useRef(false)
  const onMoveRef = useRef(onMoveToDesk)
  const deskRef = useRef(currentDeskId)
  const channelRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    onMoveRef.current = onMoveToDesk
    deskRef.current = currentDeskId
  }, [onMoveToDesk, currentDeskId])

  useEffect(() => {
    channelRef.current = deskChannel()
    return () => channelRef.current?.close()
  }, [])

  const onPointerDown = useCallback(
    (alcoveId: string, event: ReactPointerEvent) => {
      if (event.button !== 0) return
      originRef.current = { id: alcoveId, x: event.clientX, y: event.clientY }
      draggingRef.current = false
      movedRef.current = false
      event.currentTarget.setPointerCapture?.(event.pointerId)

      const onMove = (moveEvent: PointerEvent) => {
        const origin = originRef.current
        if (!origin) return
        if (!draggingRef.current) {
          const dx = moveEvent.clientX - origin.x
          const dy = moveEvent.clientY - origin.y
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
          draggingRef.current = true
          movedRef.current = true
          document.body.style.cursor = "grabbing"
        }
        if (isTauri()) {
          invoke<DeskHit | null>("desk_hit")
            .then((hit) => {
              channelRef.current?.postMessage({
                type: "hover",
                deskId: hit && hit.id !== deskRef.current ? hit.id : null,
              })
            })
            .catch(() => undefined)
        }
      }

      const onUp = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        window.removeEventListener("pointercancel", onUp)
        document.body.style.removeProperty("cursor")
        const origin = originRef.current
        const wasDragging = draggingRef.current
        originRef.current = null
        draggingRef.current = false
        channelRef.current?.postMessage({ type: "hover", deskId: null })
        if (!origin || !wasDragging || !isTauri()) return
        invoke<DeskHit | null>("desk_hit")
          .then((hit) => {
            if (hit && hit.id !== deskRef.current) {
              onMoveRef.current(origin.id, hit.id)
            }
          })
          .catch(() => undefined)
      }

      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
      window.addEventListener("pointercancel", onUp)
    },
    [],
  )

  const skipClick = useCallback(() => {
    if (!movedRef.current) return false
    movedRef.current = false
    return true
  }, [])

  return { onPointerDown, skipClick }
}
