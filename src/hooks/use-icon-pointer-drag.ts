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
  /** An app on the frequent strip: open the dragged files with it. */
  | { kind: "launch"; app: string; label: string }
  /** Empty desktop: park the icons on the wallpaper, where they were dropped. */
  | { kind: "wallpaper"; x: number; y: number }

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

function fillAlcoveGhost(alcoveId: string) {
  const ghost = ghostEl()
  ghost.replaceChildren()
  ghost.style.color = ""
  ghost.style.fontSize = ""
  const source = document.querySelector(
    `[data-alcove-strip] [data-alcove-id="${CSS.escape(alcoveId)}"]`,
  )
  if (!(source instanceof HTMLElement)) return
  const clone = source.cloneNode(true) as HTMLElement
  clone.removeAttribute("data-alcove-id")
  clone.removeAttribute(SOURCE_ATTR)
  clone.style.opacity = "1"
  clone.style.pointerEvents = "none"
  ghost.appendChild(clone)
}

function fillGhostFromArt(name: string, imageUrl?: string, count = 1) {
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
  } else {
    ghost.textContent = name
    ghost.style.color = "white"
    ghost.style.fontSize = "12px"
  }
  addCountBadge(count)
}

function fillGhost(icon: DesktopIcon, count = 1) {
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
    fillGhostFromArt(icon.name, icon.imageUrl, count)
    return
  }
  addCountBadge(count)
}

function addCountBadge(count: number) {
  if (count < 2) return
  const badge = document.createElement("span")
  badge.textContent = String(count)
  badge.style.cssText =
    "position:absolute;top:-8px;right:-8px;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#38bdf8;color:#0c4a6e;font:700 11px/20px sans-serif;text-align:center"
  ghostEl().appendChild(badge)
}

function ghostArt(icon: DesktopIcon, iconIds: string[]) {
  const img = ghostEl().querySelector("img")
  return {
    iconId: icon.id,
    name: icon.name,
    imageUrl: img instanceof HTMLImageElement ? img.src : icon.imageUrl,
    iconIds,
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


/** Set on <html> for the length of a drag, so the rail can show it is live. */
const DRAG_ATTR = "data-icon-drag"

function markDragging(on: boolean) {
  if (on) {
    document.body.style.cursor = "grabbing"
    document.documentElement.setAttribute(DRAG_ATTR, "")
  } else {
    document.body.style.removeProperty("cursor")
    document.documentElement.removeAttribute(DRAG_ATTR)
  }
}

/**
 * The rail as one contiguous column of drop targets.
 *
 * Rail tiles are 52px with a 10px gap, and a miss in that gap is not a no-op --
 * the file silently lands in the neighbouring drawer and has to be hunted down
 * later. From the first frame of a drag every pixel between the first tile's top
 * and the last tile's bottom belongs to the nearest row, and anything left of
 * the rail's right edge counts, so overshooting into the screen edge is free.
 * The tool buttons below the stack are left alone -- they are not drawers.
 */
function railBand(
  x: number,
  y: number,
): { target: IconDropTarget; hover: Element | null } | null {
  const rail = document.querySelector("[data-alcove-strip]")
  if (!(rail instanceof HTMLElement)) return null
  if (x > rail.getBoundingClientRect().right) return null
  const rows = [...rail.querySelectorAll("[data-alcove-id]")].filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  )
  const first = rows[0]?.getBoundingClientRect()
  const last = rows[rows.length - 1]?.getBoundingClientRect()
  if (!first || !last || y < first.top || y > last.bottom) return null
  let best: HTMLElement | null = null
  let bestGap = Number.POSITIVE_INFINITY
  for (const row of rows) {
    const rect = row.getBoundingClientRect()
    const gap = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
    if (gap < bestGap) {
      bestGap = gap
      best = row
    }
  }
  const id = best?.dataset.alcoveId
  return id ? { target: { kind: "alcove", id }, hover: best } : null
}

export function resolveTarget(x: number, y: number): {
  target: IconDropTarget
  hover: Element | null
} {
  // Rail first: it sits at the screen edge, so nothing else can be under it.
  const band = railBand(x, y)
  if (band) return band
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
    // Before the drawer check: a strip app is a launcher, not a filing target,
    // and the strip sits inside no drawer so nothing else claims these pixels.
    const launch = node.closest("[data-strip-launch]")
    if (launch instanceof HTMLElement && launch.dataset.stripLaunch) {
      return {
        target: {
          kind: "launch",
          app: launch.dataset.stripLaunch,
          label: launch.dataset.stripLabel || launch.dataset.stripLaunch,
        },
        hover: launch,
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
  return { target: { kind: "wallpaper", x, y }, hover: null }
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

type DragOrigin = {
  icon: DesktopIcon
  icons: DesktopIcon[]
  x: number
  y: number
}

type GhostArt = {
  iconId: string
  name: string
  imageUrl?: string
  iconIds?: string[]
}

export function useIconPointerDrag(
  deskId: string,
  onDrop: (icons: DesktopIcon[], target: IconDropTarget) => void,
  onForeignDesk?: (icons: DesktopIcon[], hit: DeskHit) => boolean,
  onRemoteDrop?: (iconIds: string[], x: number, y: number) => void,
  companionsFor?: (grabbed: DesktopIcon) => DesktopIcon[],
  onClickWithoutDrag?: (icon: DesktopIcon) => void,
) {
  const originRef = useRef<DragOrigin | null>(null)
  const draggingRef = useRef(false)
  const handedOffRef = useRef(false)
  const handoffTimerRef = useRef<number | null>(null)
  const awayRef = useRef(false)
  const hoverRef = useRef<Element | null>(null)
  const pointRef = useRef({ x: 0, y: 0 })
  const rafRef = useRef(0)
  const deskIdRef = useRef(deskId)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const foreignArtRef = useRef<GhostArt | null>(null)
  const foreignHereRef = useRef(false)
  const takeHandoffRef = useRef(false)
  const onDropRef = useRef(onDrop)
  const onForeignRef = useRef(onForeignDesk)
  const onRemoteRef = useRef(onRemoteDrop)
  const companionsRef = useRef(companionsFor)
  const onClickRef = useRef(onClickWithoutDrag)

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

  useEffect(() => {
    companionsRef.current = companionsFor
  }, [companionsFor])

  useEffect(() => {
    onClickRef.current = onClickWithoutDrag
  }, [onClickWithoutDrag])

  const stopRaf = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [])

  const endDrag = useCallback(() => {
    if (handoffTimerRef.current !== null) {
      window.clearTimeout(handoffTimerRef.current)
      handoffTimerRef.current = null
    }
    stopRaf()
    draggingRef.current = false
    handedOffRef.current = false
    awayRef.current = false
    originRef.current = null
    hideGhost()
    hoverRef.current = setHover(null, hoverRef.current)
    markDragging(false)
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
    markDragging(false)
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
        fillGhostFromArt(art.name, art.imageUrl, art.iconIds?.length ?? 1)
        showGhost(data.x, data.y)
        hoverRef.current = setHover(
          resolveTarget(data.x, data.y).hover,
          hoverRef.current,
        )
        markDragging(true)
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
      fillGhostFromArt(art.name, art.imageUrl, art.iconIds?.length ?? 1)
      showGhost(event.clientX, event.clientY)
      hoverRef.current = setHover(
        resolveTarget(event.clientX, event.clientY).hover,
        hoverRef.current,
      )
      markDragging(true)
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
      onRemoteRef.current?.(art.iconIds?.length ? art.iconIds : [art.iconId], x, y)
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
      originRef.current = { icon, icons: [icon], x: event.clientX, y: event.clientY }
      draggingRef.current = false
      handedOffRef.current = false
      awayRef.current = false
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId)
      } catch {
        // Capture needs a real pointer; window listeners still see the drag.
      }

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
          if (origin) fillGhost(origin.icon, origin.icons.length)
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
          const pack = companionsRef.current?.(origin.icon) ?? [origin.icon]
          origin.icons = pack.length > 0 ? pack : [origin.icon]
          draggingRef.current = true
          fillGhost(origin.icon, origin.icons.length)
          showGhost(moveEvent.clientX, moveEvent.clientY)
          markDragging(true)
          for (const item of origin.icons) {
            document
              .querySelector(`[data-desktop-icon="${CSS.escape(item.id)}"]`)
              ?.setAttribute(SOURCE_ATTR, "")
          }
          channelRef.current?.postMessage({
            type: "icon-drag-begin",
            ...ghostArt(origin.icon, origin.icons.map((item) => item.id)),
          } satisfies DeskChannelMessage)
        }
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(paint)
        }
      }

      const finishDrop = (icons: DesktopIcon[], target: IconDropTarget) => {
        const done = () => onDropRef.current(icons, target)
        if (isTauri() && onForeignRef.current) {
          invoke<DeskHit | null>("desk_hit")
            .then((hit) => {
              if (hit && onForeignRef.current?.(icons, hit)) return
              done()
            })
            .catch(done)
          return
        }
        done()
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
        // Read the target before endDrag: a drawer only lets a drop through to
        // the wallpaper while the drag is on, and endDrag turns that off.
        const target = wasDragging ? resolveTarget(x, y).target : null
        channelRef.current?.postMessage({
          type: "icon-ghost-end",
        } satisfies DeskChannelMessage)
        endDrag()
        if (!origin) return
        if (!wasDragging || !target) {
          onClickRef.current?.(origin.icon)
          return
        }
        if (handedOff) return
        finishDrop(origin.icons, target)
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
        // A cancelled drag hands off and waits to be told the ghost landed.
        // On one monitor nobody answers, and the drag chrome it leaves behind
        // makes the open drawer see-through and click-through until the next
        // drag. Give the hand-off a deadline.
        handoffTimerRef.current = window.setTimeout(() => {
          handoffTimerRef.current = null
          endDrag()
        }, 2000)
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

function railAlcoveAt(x: number, y: number): { id: string; node: HTMLElement } | null {
  for (const node of document.elementsFromPoint(x, y)) {
    if (!(node instanceof Element)) continue
    const tile = node.closest("[data-alcove-id]")
    if (!(tile instanceof HTMLElement) || !tile.dataset.alcoveId) continue
    if (!tile.closest("[data-alcove-strip]")) continue
    return { id: tile.dataset.alcoveId, node: tile }
  }
  return null
}

export function useAlcoveStripDrag(
  currentDeskId: string,
  onMoveToDesk: (alcoveId: string, deskId: string) => void,
  onReorder: (dragId: string, targetId: string) => void,
) {
  const originRef = useRef<{ id: string; x: number; y: number } | null>(null)
  const draggingRef = useRef(false)
  const movedRef = useRef(false)
  const hoverRef = useRef<Element | null>(null)
  const onMoveRef = useRef(onMoveToDesk)
  const onReorderRef = useRef(onReorder)
  const deskRef = useRef(currentDeskId)
  const channelRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    onMoveRef.current = onMoveToDesk
    onReorderRef.current = onReorder
    deskRef.current = currentDeskId
  }, [onMoveToDesk, onReorder, currentDeskId])

  useEffect(() => {
    channelRef.current = deskChannel()
    return () => {
      channelRef.current?.close()
      hideGhost()
    }
  }, [])

  const onPointerDown = useCallback(
    (alcoveId: string, event: ReactPointerEvent) => {
      if (event.button !== 0) return
      originRef.current = { id: alcoveId, x: event.clientX, y: event.clientY }
      draggingRef.current = false
      movedRef.current = false
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId)
      } catch {
        // Capture needs a real pointer; window listeners still see the drag.
      }

      const paintHover = (x: number, y: number, sourceId: string) => {
        const hit = railAlcoveAt(x, y)
        const node = hit && hit.id !== sourceId ? hit.node : null
        hoverRef.current = setHover(node, hoverRef.current)
      }

      const onMove = (moveEvent: PointerEvent) => {
        const origin = originRef.current
        if (!origin) return
        if (!draggingRef.current) {
          const dx = moveEvent.clientX - origin.x
          const dy = moveEvent.clientY - origin.y
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
          draggingRef.current = true
          movedRef.current = true
          fillAlcoveGhost(origin.id)
          showGhost(moveEvent.clientX, moveEvent.clientY)
          markDragging(true)
          document
            .querySelector(
              `[data-alcove-strip] [data-alcove-id="${CSS.escape(origin.id)}"]`,
            )
            ?.setAttribute(SOURCE_ATTR, "")
        }
        moveGhost(moveEvent.clientX, moveEvent.clientY)
        paintHover(moveEvent.clientX, moveEvent.clientY, origin.id)
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

      const onUp = (upEvent: PointerEvent) => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        window.removeEventListener("pointercancel", onUp)
        markDragging(false)
        hideGhost()
        hoverRef.current = setHover(null, hoverRef.current)
        document
          .querySelectorAll(`[data-alcove-strip] [${SOURCE_ATTR}]`)
          .forEach((node) => node.removeAttribute(SOURCE_ATTR))
        const origin = originRef.current
        const wasDragging = draggingRef.current
        originRef.current = null
        draggingRef.current = false
        channelRef.current?.postMessage({ type: "hover", deskId: null })
        if (!origin || !wasDragging) return
        const hit = railAlcoveAt(upEvent.clientX, upEvent.clientY)
        if (hit && hit.id !== origin.id) {
          onReorderRef.current(origin.id, hit.id)
          return
        }
        if (!isTauri()) return
        invoke<DeskHit | null>("desk_hit")
          .then((deskHit) => {
            if (deskHit && deskHit.id !== deskRef.current) {
              onMoveRef.current(origin.id, deskHit.id)
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
