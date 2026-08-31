import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  DEFAULT_PIN_IDS,
  INBOX_ID,
  INCOMING_FILES,
  SAMPLE_ICONS,
} from "@/data/sample"
import { defaultAlcoveGlyph } from "@/lib/alcove-glyphs"
import { reorderAlcoves } from "@/lib/alcove-order"
import { pageSize } from "@/lib/density"
import {
  TOP_SLOTS,
  clampSlotCount,
  pruneFrecency,
  recordOpen,
  refreshSlots,
  resizeSlots,
} from "@/lib/frecency"
import { cellAt, clampCell, fieldRect, freeCell } from "@/lib/pin-grid"
import { isSampleMock, mergeHarvest, mergeLiveFolder, toDesktopIcon } from "@/lib/harvest-merge"
import type { HarvestedIcon } from "@/lib/harvest-merge"
import {
  applySnapshot,
  buildInbox,
  snapshotFromAlcoves,
  snapshotsForAlcoves,
  suggestionsFromIcons,
} from "@/lib/organize"
import {
  hydrateDesktopState,
  loadDesktopState,
  persistDesktopState,
  subscribeDesktopState,
} from "@/lib/storage"
import { DEFAULT_STRIP_TOOL_IDS, uniqueKnown } from "@/lib/strip-tools"
import { invoke, isTauri } from "@/lib/tauri"
import type {
  Alcove,
  AlcoveColor,
  AlcoveView,
  Density,
  DesktopIcon,
  DesktopState,
  FolderView,
  LayoutId,
  StripEdge,
  SuggestedGroup,
} from "@/types"

const emptySlots = (count?: number): (string | null)[] =>
  Array.from({ length: clampSlotCount(count) }, () => null)

/** Contents only — the strip's *size* is a preference and survives a clear. */
const topDefaults = (count?: number) => ({
  frecency: {},
  topSlots: emptySlots(count),
  topKeep: [] as string[],
  topHide: [] as string[],
})

/** How many pins the bottom-right stack holds before it stops being a shelf. */
const CORNER_PINS = 8

/** Takes icons off the desktop entirely — the corner stack and the wallpaper. */
function dropPins(current: DesktopState, iconIds: string[]): DesktopState {
  const ids = new Set(iconIds)
  const pinIds = current.pinIds.filter((id) => !ids.has(id))
  const pinAt = { ...(current.pinAt ?? {}) }
  let cleared = false
  for (const id of ids) {
    if (pinAt[id]) {
      delete pinAt[id]
      cleared = true
    }
  }
  if (!cleared && pinIds.length === current.pinIds.length) return current
  return { ...current, pinIds, pinAt }
}

function sampleIcons(): DesktopIcon[] {
  return SAMPLE_ICONS.map((icon) => ({ ...icon, alcoveId: null }))
}

function onboardingState(): DesktopState {
  return {
    phase: "onboarding",
    alcoves: [buildInbox()],
    icons: sampleIcons(),
    pinIds: [...DEFAULT_PIN_IDS],
    density: "comfortable",
    layoutId: "work",
    layoutSnapshots: snapshotsForAlcoves([buildInbox()]),
    focusMode: false,
    stripEdge: "top" as const,
    focusedAlcoveId: INBOX_ID,
    highlightedIconId: null,
    stripToolIds: [...DEFAULT_STRIP_TOOL_IDS],
    topSlotCount: TOP_SLOTS,
    ...topDefaults(),
  }
}

function emptyDesktopState(): DesktopState {
  const inbox = buildInbox()
  return {
    phase: "ready",
    alcoves: [inbox],
    icons: [],
    pinIds: [],
    density: "comfortable",
    layoutId: "work",
    layoutSnapshots: snapshotsForAlcoves([inbox]),
    focusMode: false,
    stripEdge: "top" as const,
    focusedAlcoveId: INBOX_ID,
    highlightedIconId: null,
    stripToolIds: [...DEFAULT_STRIP_TOOL_IDS],
    ...topDefaults(),
  }
}

function applyHarvest(current: DesktopState, harvested: HarvestedIcon[]): DesktopState {
  const sampleOnly = isSampleMock(current)
  if (sampleOnly) {
    return {
      ...onboardingState(),
      icons: harvested.map((item) => toDesktopIcon(item, null)),
      pinIds: [],
      stripEdge: current.stripEdge,
      stripToolIds: current.stripToolIds,
    }
  }
  const merged = mergeHarvest(current, harvested, INBOX_ID)
  const ids = new Set(merged.icons.map((icon) => icon.id))
  const exists = (id: string) => ids.has(id)
  const frecency = pruneFrecency(merged.frecency, exists)
  return {
    ...merged,
    frecency,
    topSlots: refreshSlots(merged.topSlots, frecency, {
      now: Date.now(),
      exists,
      keep: merged.topKeep,
      hide: merged.topHide,
    }),
  }
}

export function useAlcoveDesktop() {
  const [state, setState] = useState<DesktopState>(
    () => loadDesktopState() ?? onboardingState(),
  )
  const [hydrated, setHydrated] = useState(!isTauri())
  const applyingRemote = useRef(false)

  useEffect(() => {
    let cancelled = false
    hydrateDesktopState().then((saved) => {
      if (cancelled) return
      if (saved) {
        applyingRemote.current = true
        setState(saved)
      }
      setHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Stamped the first time a real desk is saved, so the licence nudge can wait
  // for Alcove to have earned it. Missing on every layout saved before this
  // existed, which is correct — those users start their clock now.
  useEffect(() => {
    if (!hydrated || isSampleMock(state) || state.firstRunAt) return
    setState((current) =>
      current.firstRunAt ? current : { ...current, firstRunAt: Date.now() },
    )
  }, [hydrated, state])

  useEffect(() => {
    if (!hydrated) return
    if (applyingRemote.current) {
      applyingRemote.current = false
      return
    }
    if (isSampleMock(state)) return
    void persistDesktopState(state)
  }, [state, hydrated])

  useEffect(
    () =>
      subscribeDesktopState((next) => {
        applyingRemote.current = true
        setState((current) => {
          const images = new Map(
            current.icons.map((icon) => [icon.id, icon.imageUrl]),
          )
          return {
            ...next,
            icons: next.icons.map((icon) => ({
              ...icon,
              imageUrl: icon.imageUrl ?? images.get(icon.id),
            })),
          }
        })
      }),
    [],
  )

  useEffect(() => {
    if (!isTauri() || !hydrated) return
    let cancelled = false
    invoke<HarvestedIcon[]>("list_desktop_icons")
      .then((harvested) => {
        if (!cancelled && harvested.length > 0) {
          setState((current) => applyHarvest(current, harvested))
        }
      })
      .catch((error) => {
        console.error("Could not read Desktop folder", error)
      })
    return () => {
      cancelled = true
    }
  }, [hydrated])

  const liveKey = state.alcoves
    .filter((alcove) => alcove.folderPath)
    .map((alcove) => `${alcove.id}:${alcove.folderPath}`)
    .sort()
    .join("|")

  useEffect(() => {
    if (!isTauri() || !hydrated || !liveKey) return
    let cancelled = false
    const lives = state.alcoves.filter(
      (alcove): alcove is Alcove & { folderPath: string } => Boolean(alcove.folderPath),
    )
    Promise.all(
      lives.map((alcove) =>
        invoke<HarvestedIcon[]>("list_folder_icons", { path: alcove.folderPath }).then(
          (harvested) => ({ id: alcove.id, harvested }),
        ),
      ),
    )
      .then((results) => {
        if (cancelled) return
        setState((current) =>
          results.reduce(
            (next, item) => mergeLiveFolder(next, item.id, item.harvested),
            current,
          ),
        )
      })
      .catch((error) => {
        console.error("Could not read live folder", error)
      })
    return () => {
      cancelled = true
    }
    // liveKey is the list of id:path pairs; alcoves is read only to fetch those paths.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, hydrated])

  const sortedAlcoves = useMemo(
    () => [...state.alcoves].sort((a, b) => a.order - b.order),
    [state.alcoves],
  )

  const iconsIn = useCallback(
    (alcoveId: string) => state.icons.filter((icon) => icon.alcoveId === alcoveId),
    [state.icons],
  )

  const inboxCount = iconsIn(INBOX_ID).length

  const organize = useCallback((groups: SuggestedGroup[]) => {
    setState((current) => {
      const enabled = groups.filter((group) => group.enabled && group.iconIds.length > 0)
      const alcoves: Alcove[] = [
        buildInbox(),
        ...enabled.map((group, index) => ({
          id: group.id,
          name: group.name.trim() || group.id,
          color: group.color,
          glyph: defaultAlcoveGlyph(group.id, group.name),
          collapsed: false,
          isInbox: false,
          order: index + 1,
          page: 0,
        })),
      ]
      const assigned = new Map<string, string>()
      for (const group of enabled) {
        for (const iconId of group.iconIds) assigned.set(iconId, group.id)
      }
      const icons = current.icons.map((icon) => ({
        ...icon,
        alcoveId: assigned.get(icon.id) ?? INBOX_ID,
      }))
      const layoutSnapshots = snapshotsForAlcoves(alcoves)
      const layoutId: LayoutId = "work"
      return {
        ...current,
        phase: "ready",
        alcoves: applySnapshot(alcoves, layoutSnapshots[layoutId]),
        icons,
        layoutId,
        layoutSnapshots,
        focusedAlcoveId: alcoves.some((alcove) => alcove.id === "client-a")
          ? "client-a"
          : INBOX_ID,
      }
    })
  }, [])

  const startEmpty = useCallback(() => {
    setState(emptyDesktopState())
  }, [])

  const loadSample = useCallback(() => {
    if (isTauri()) {
      invoke<HarvestedIcon[]>("list_desktop_icons")
        .then((harvested) => {
          setState({
            ...onboardingState(),
            icons: harvested.map((item) => toDesktopIcon(item, null)),
            pinIds: [],
          })
        })
        .catch((error) => {
          console.error("Could not read Desktop folder", error)
        })
      return
    }
    setState(onboardingState())
  }, [])

  const toggleCollapsed = useCallback((alcoveId: string) => {
    setState((current) => {
      const alcoves = current.alcoves.map((alcove) =>
        alcove.id === alcoveId
          ? { ...alcove, collapsed: !alcove.collapsed, page: 0 }
          : alcove,
      )
      return {
        ...current,
        alcoves,
        focusedAlcoveId: alcoveId,
        layoutSnapshots: {
          ...current.layoutSnapshots,
          [current.layoutId]: snapshotFromAlcoves(alcoves),
        },
      }
    })
  }, [])

  const collapseAll = useCallback(() => {
    setState((current) => {
      const alcoves = current.alcoves.map((alcove) => ({
        ...alcove,
        collapsed: !alcove.isInbox,
        page: 0,
      }))
      return {
        ...current,
        alcoves,
        layoutId: "clean",
        layoutSnapshots: {
          ...current.layoutSnapshots,
          clean: snapshotFromAlcoves(alcoves),
        },
      }
    })
  }, [])

  const setLayout = useCallback((layoutId: LayoutId) => {
    setState((current) => ({
      ...current,
      layoutId,
      alcoves: applySnapshot(current.alcoves, current.layoutSnapshots[layoutId]),
      focusedAlcoveId:
        layoutId === "work"
          ? current.alcoves.find((a) => a.id === "client-a")?.id ?? INBOX_ID
          : layoutId === "home"
            ? current.alcoves.find((a) => a.id === "photos")?.id ?? INBOX_ID
            : INBOX_ID,
    }))
  }, [])

  const setDensity = useCallback((density: Density) => {
    setState((current) => ({
      ...current,
      density,
      alcoves: current.alcoves.map((alcove) => ({ ...alcove, page: 0 })),
    }))
  }, [])

  const setAlcovePage = useCallback((alcoveId: string, page: number) => {
    setState((current) => ({
      ...current,
      alcoves: current.alcoves.map((alcove) =>
        alcove.id === alcoveId ? { ...alcove, page } : alcove,
      ),
    }))
  }, [])

  const renameAlcove = useCallback((alcoveId: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setState((current) => ({
      ...current,
      alcoves: current.alcoves.map((alcove) =>
        alcove.id === alcoveId ? { ...alcove, name: trimmed } : alcove,
      ),
    }))
  }, [])

  const recolorAlcove = useCallback((alcoveId: string, color: AlcoveColor) => {
    setState((current) => ({
      ...current,
      alcoves: current.alcoves.map((alcove) =>
        alcove.id === alcoveId ? { ...alcove, color } : alcove,
      ),
    }))
  }, [])

  const setAlcoveGlyph = useCallback((alcoveId: string, glyph: string) => {
    setState((current) => ({
      ...current,
      alcoves: current.alcoves.map((alcove) =>
        alcove.id === alcoveId ? { ...alcove, glyph } : alcove,
      ),
    }))
  }, [])

  const deleteAlcove = useCallback((alcoveId: string) => {
    setState((current) => {
      const target = current.alcoves.find((alcove) => alcove.id === alcoveId)
      if (!target || target.isInbox) return current
      const alcoves = current.alcoves.filter((alcove) => alcove.id !== alcoveId)
      const icons = target.folderPath
        ? current.icons.filter((icon) => icon.alcoveId !== alcoveId)
        : current.icons.map((icon) =>
            icon.alcoveId === alcoveId
              ? { ...icon, alcoveId: INBOX_ID, groupId: null }
              : icon,
          )
      const strip = (snap: Record<string, boolean>) => {
        const next = { ...snap }
        delete next[alcoveId]
        return next
      }
      return {
        ...current,
        alcoves,
        icons,
        focusedAlcoveId: INBOX_ID,
        layoutSnapshots: {
          work: strip(current.layoutSnapshots.work),
          home: strip(current.layoutSnapshots.home),
          clean: strip(current.layoutSnapshots.clean),
        },
      }
    })
  }, [])

  const createAlcove = useCallback(
    (name: string, color: AlcoveColor, iconIds: string[] = [], glyph?: string, folderPath?: string | null, stripId?: string | null) => {
      const id = crypto.randomUUID()
      const trimmed = name.trim() || "New Alcove"
      setState((current) => {
        const order = current.alcoves.reduce((max, alcove) => Math.max(max, alcove.order), 0) + 1
        const alcove: Alcove = {
          id,
          name: trimmed,
          color,
          glyph: glyph ?? defaultAlcoveGlyph(id, trimmed),
          collapsed: false,
          isInbox: false,
          order,
          page: 0,
          folderPath: folderPath || null,
          stripId: stripId || null,
        }
        const alcoves = [...current.alcoves, alcove]
        const iconSet = new Set(folderPath ? [] : iconIds)
        const icons = current.icons.map((icon) =>
          iconSet.has(icon.id) ? { ...icon, alcoveId: id } : icon,
        )
        const addExpanded = (snap: Record<string, boolean>, collapsed: boolean) => ({
          ...snap,
          [id]: collapsed,
        })
        return {
          ...current,
          phase: "ready",
          alcoves,
          icons,
          focusedAlcoveId: id,
          layoutSnapshots: {
            work: addExpanded(current.layoutSnapshots.work, current.layoutId !== "work"),
            home: addExpanded(current.layoutSnapshots.home, current.layoutId !== "home"),
            clean: addExpanded(current.layoutSnapshots.clean, true),
          },
        }
      })
      return id
    },
    [],
  )

  const setAlcoveFolder = useCallback((alcoveId: string, folderPath: string | null) => {
    setState((current) => {
      const target = current.alcoves.find((alcove) => alcove.id === alcoveId)
      if (!target || target.isInbox) return current
      const alcoves = current.alcoves.map((alcove) =>
        alcove.id === alcoveId ? { ...alcove, folderPath } : alcove,
      )
      const icons = folderPath
        ? current.icons.map((icon) =>
            icon.alcoveId === alcoveId
              ? { ...icon, alcoveId: INBOX_ID, groupId: null }
              : icon,
          )
        : current.icons.filter((icon) => icon.alcoveId !== alcoveId)
      return { ...current, alcoves, icons, focusedAlcoveId: alcoveId }
    })
  }, [])

  const refreshLiveFolder = useCallback((alcoveId: string) => {
    if (!isTauri()) return
    const alcove = state.alcoves.find((item) => item.id === alcoveId)
    if (!alcove?.folderPath) return
    invoke<HarvestedIcon[]>("list_folder_icons", { path: alcove.folderPath })
      .then((harvested) => {
        setState((current) => mergeLiveFolder(current, alcoveId, harvested))
      })
      .catch((error) => {
        console.error("Could not read live folder", error)
      })
  }, [state.alcoves])

  const moveIcons = useCallback((iconIds: string[], alcoveId: string) => {
    if (iconIds.length === 0) return
    const ids = new Set(iconIds)
    setState((current) => {
      const target = current.alcoves.find((alcove) => alcove.id === alcoveId)
      if (target?.folderPath) return current
      let changed = false
      const icons = current.icons.map((item) => {
        if (!ids.has(item.id)) return item
        const from = current.alcoves.find((alcove) => alcove.id === item.alcoveId)
        if (from?.folderPath) return item
        changed = true
        return { ...item, alcoveId, groupId: null }
      })
      if (!changed) return current
      return {
        ...current,
        icons,
        focusedAlcoveId: alcoveId,
        alcoves: current.alcoves.map((alcove) =>
          alcove.id === alcoveId ? { ...alcove, collapsed: false } : alcove,
        ),
      }
    })
  }, [])

  const moveIcon = useCallback((iconId: string, alcoveId: string) => {
    moveIcons([iconId], alcoveId)
  }, [moveIcons])

  const renameIcon = useCallback((iconId: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setState((current) => ({
      ...current,
      icons: current.icons.map((icon) =>
        icon.id === iconId ? { ...icon, name: trimmed } : icon,
      ),
    }))
  }, [])

  /** The corner stack is a shelf, not a desktop — eight is all it holds. */
  const cornerFull = (current: DesktopState) =>
    current.pinIds.filter((id) => !current.pinAt?.[id]).length >= CORNER_PINS

  const togglePin = useCallback((iconId: string) => {
    setState((current) => {
      const pinned = current.pinIds.includes(iconId)
      if (pinned) return dropPins(current, [iconId])
      if (cornerFull(current)) return current
      return { ...current, pinIds: [...current.pinIds, iconId] }
    })
  }, [])

  const pinIcons = useCallback((iconIds: string[]) => {
    setState((current) => {
      const pins = [...current.pinIds]
      let changed = false
      for (const id of iconIds) {
        if (pins.includes(id)) continue
        if (pins.filter((pin) => !current.pinAt?.[pin]).length >= CORNER_PINS) break
        pins.push(id)
        changed = true
      }
      return changed ? { ...current, pinIds: pins } : current
    })
  }, [])

  const unpinIcons = useCallback((iconIds: string[]) => {
    setState((current) => dropPins(current, iconIds))
  }, [])

  /**
   * Parks icons on the wallpaper where they were dropped, snapped to the grid.
   * A dragged pack lays itself out down the column instead of stacking.
   */
  const parkIcons = useCallback(
    (iconIds: string[], x: number, y: number, deskId: string) => {
      if (iconIds.length === 0) return
      setState((current) => {
        const field = fieldRect()
        const width = field.width
        const height = field.height
        const pinAt = { ...(current.pinAt ?? {}) }
        const moving = new Set(iconIds)
        const taken = Object.entries(pinAt)
          .filter(
            ([id, spot]) =>
              !moving.has(id) && (spot.deskId == null || spot.deskId === deskId),
          )
          .map(([, spot]) => clampCell(spot, width, height))
        let wanted = cellAt(x - field.left, y - field.top, width, height)
        for (const id of iconIds) {
          const cell = freeCell(taken, wanted, width, height)
          pinAt[id] = { ...cell, deskId }
          taken.push(cell)
          wanted = cell
        }
        const pinIds = [...current.pinIds]
        for (const id of iconIds) if (!pinIds.includes(id)) pinIds.push(id)
        return { ...current, pinIds, pinAt }
      })
    },
    [],
  )

  /** Filing an icon into a drawer takes it off the wallpaper. Corner pins stay. */
  const unparkIcons = useCallback((iconIds: string[]) => {
    setState((current) => {
      const parked = iconIds.filter((id) => current.pinAt?.[id])
      return parked.length === 0 ? current : dropPins(current, parked)
    })
  }, [])

  /** Records an open and re-seats the frequent strip. */
  const noteOpen = useCallback((iconId: string) => {
    setState((current) => {
      const now = Date.now()
      const frecency = recordOpen(current.frecency, iconId, now)
      const ids = new Set(current.icons.map((icon) => icon.id))
      return {
        ...current,
        frecency,
        topSlots: refreshSlots(current.topSlots, frecency, {
          now,
          exists: (id) => ids.has(id),
          keep: current.topKeep,
          hide: current.topHide,
        }),
      }
    })
  }, [])

  const toggleTopKeep = useCallback((iconId: string) => {
    setState((current) => ({
      ...current,
      topKeep: current.topKeep.includes(iconId)
        ? current.topKeep.filter((id) => id !== iconId)
        : [...current.topKeep, iconId],
    }))
  }, [])

  const hideFromTop = useCallback((iconId: string) => {
    setState((current) => {
      const topHide = current.topHide.includes(iconId)
        ? current.topHide
        : [...current.topHide, iconId]
      const ids = new Set(current.icons.map((icon) => icon.id))
      return {
        ...current,
        topHide,
        topKeep: current.topKeep.filter((id) => id !== iconId),
        topSlots: refreshSlots(current.topSlots, current.frecency, {
          now: Date.now(),
          exists: (id) => ids.has(id),
          keep: current.topKeep,
          hide: topHide,
        }),
      }
    })
  }, [])

  const clearTopStrip = useCallback(() => {
    setState((current) => ({ ...current, ...topDefaults(current.topSlotCount) }))
  }, [])

  /**
   * Resize the strip. New slots fill from the history we already have rather
   * than staying blank until the next open, and shrinking drops from the end so
   * nothing that stays moves under the cursor.
   */
  const setTopSlotCount = useCallback((count: number) => {
    setState((current) => {
      const next = clampSlotCount(count)
      if (next === clampSlotCount(current.topSlotCount)) return current
      const ids = new Set(current.icons.map((icon) => icon.id))
      return {
        ...current,
        topSlotCount: next,
        topSlots: refreshSlots(resizeSlots(current.topSlots, next), current.frecency, {
          now: Date.now(),
          exists: (id) => ids.has(id),
          keep: current.topKeep,
          hide: current.topHide,
        }),
      }
    })
  }, [])

  const setAlcoveView = useCallback((alcoveId: string, view: AlcoveView) => {
    setState((current) => ({
      ...current,
      alcoves: current.alcoves.map((alcove) =>
        alcove.id === alcoveId ? { ...alcove, view } : alcove,
      ),
    }))
  }, [])

  const setFolderView = useCallback((alcoveId: string, folderView: FolderView) => {
    setState((current) => ({
      ...current,
      alcoves: current.alcoves.map((alcove) =>
        alcove.id === alcoveId ? { ...alcove, folderView } : alcove,
      ),
    }))
  }, [])

  const createGroup = useCallback((alcoveId: string, name: string, iconIds: string[] = []) => {
    const id = crypto.randomUUID()
    setState((current) => {
      const iconSet = new Set(iconIds)
      return {
        ...current,
        alcoves: current.alcoves.map((alcove) =>
          alcove.id === alcoveId
            ? {
                ...alcove,
                groups: [...(alcove.groups ?? []), { id, name: name.trim() || "New group" }],
              }
            : alcove,
        ),
        icons: current.icons.map((icon) =>
          iconSet.has(icon.id) ? { ...icon, alcoveId, groupId: id } : icon,
        ),
      }
    })
    return id
  }, [])

  const renameGroup = useCallback((alcoveId: string, groupId: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setState((current) => ({
      ...current,
      alcoves: current.alcoves.map((alcove) =>
        alcove.id === alcoveId
          ? {
              ...alcove,
              groups: (alcove.groups ?? []).map((group) =>
                group.id === groupId ? { ...group, name: trimmed } : group,
              ),
            }
          : alcove,
      ),
    }))
  }, [])

  /** Deleting a row keeps its icons — they fall back to "Everything else". */
  const deleteGroup = useCallback((alcoveId: string, groupId: string) => {
    setState((current) => ({
      ...current,
      alcoves: current.alcoves.map((alcove) =>
        alcove.id === alcoveId
          ? { ...alcove, groups: (alcove.groups ?? []).filter((group) => group.id !== groupId) }
          : alcove,
      ),
      icons: current.icons.map((icon) =>
        icon.alcoveId === alcoveId && icon.groupId === groupId
          ? { ...icon, groupId: null }
          : icon,
      ),
    }))
  }, [])

  const moveGroup = useCallback((alcoveId: string, groupId: string, delta: number) => {
    setState((current) => ({
      ...current,
      alcoves: current.alcoves.map((alcove) => {
        if (alcove.id !== alcoveId) return alcove
        const groups = [...(alcove.groups ?? [])]
        const from = groups.findIndex((group) => group.id === groupId)
        const to = from + delta
        if (from < 0 || to < 0 || to >= groups.length) return alcove
        const [moved] = groups.splice(from, 1)
        groups.splice(to, 0, moved)
        return { ...alcove, groups }
      }),
    }))
  }, [])

  const moveIconsToGroup = useCallback(
    (iconIds: string[], alcoveId: string, groupId: string | null) => {
      if (iconIds.length === 0) return
      const ids = new Set(iconIds)
      setState((current) => ({
        ...current,
        icons: current.icons.map((icon) =>
          ids.has(icon.id) ? { ...icon, alcoveId, groupId } : icon,
        ),
        focusedAlcoveId: alcoveId,
      }))
    },
    [],
  )

  const moveIconToGroup = useCallback(
    (iconId: string, alcoveId: string, groupId: string | null) => {
      moveIconsToGroup([iconId], alcoveId, groupId)
    },
    [moveIconsToGroup],
  )

  const dropIncomingFile = useCallback(() => {
    setState((current) => {
      const template = INCOMING_FILES[current.icons.length % INCOMING_FILES.length]
      const icon: DesktopIcon = {
        ...template,
        id: crypto.randomUUID(),
        alcoveId: INBOX_ID,
      }
      return {
        ...current,
        phase: "ready",
        icons: [...current.icons, icon],
        alcoves: current.alcoves.map((alcove) =>
          alcove.isInbox ? { ...alcove, collapsed: false } : alcove,
        ),
        focusedAlcoveId: INBOX_ID,
      }
    })
  }, [])

  const reloadHarvest = useCallback((assignAlcoveId?: string | null) => {
    if (!isTauri()) return Promise.resolve()
    return invoke<HarvestedIcon[]>("list_desktop_icons")
      .then((harvested) => {
        setState((current) => {
          const before = new Set(
            current.icons
              .map((icon) => icon.path)
              .filter((path): path is string => Boolean(path)),
          )
          let next = applyHarvest(current, harvested)
          if (!assignAlcoveId) return next
          const target = next.alcoves.find((alcove) => alcove.id === assignAlcoveId)
          if (!target || target.folderPath) return next
          return {
            ...next,
            icons: next.icons.map((icon) =>
              icon.path && !before.has(icon.path)
                ? { ...icon, alcoveId: assignAlcoveId, groupId: null }
                : icon,
            ),
          }
        })
      })
      .catch((error) => {
        console.error("Could not refresh Desktop folder", error)
      })
  }, [])

  const pasteFiles = useCallback(
    async (dest: string | null, assignAlcoveId: string | null) => {
      if (!isTauri()) {
        dropIncomingFile()
        return
      }
      await invoke("paste_into_folder", { dest })
      if (dest && assignAlcoveId) {
        refreshLiveFolder(assignAlcoveId)
        return
      }
      await reloadHarvest(assignAlcoveId)
    },
    [dropIncomingFile, refreshLiveFolder, reloadHarvest],
  )

  const deleteIcons = useCallback(
    async (icons: DesktopIcon[]) => {
      if (icons.length === 0) return
      const paths = icons
        .map((icon) => icon.path)
        .filter((path): path is string => Boolean(path))
      if (paths.length > 0 && isTauri()) {
        await invoke("recycle_desktop_items", { paths })
        const live = new Set<string>()
        for (const icon of icons) {
          const alcove = state.alcoves.find((item) => item.id === icon.alcoveId)
          if (alcove?.folderPath) live.add(alcove.id)
        }
        for (const alcoveId of live) refreshLiveFolder(alcoveId)
        await reloadHarvest()
        return
      }
      const ids = new Set(icons.map((icon) => icon.id))
      setState((current) => ({
        ...current,
        ...dropPins(current, [...ids]),
        icons: current.icons.filter((item) => !ids.has(item.id)),
      }))
    },
    [refreshLiveFolder, reloadHarvest, state.alcoves],
  )

  const deleteIcon = useCallback(
    async (icon: DesktopIcon) => {
      await deleteIcons([icon])
    },
    [deleteIcons],
  )

  const revealIcon = useCallback((iconId: string) => {
    setState((current) => {
      const icon = current.icons.find((item) => item.id === iconId)
      if (!icon?.alcoveId) return current
      const siblings = current.icons.filter((item) => item.alcoveId === icon.alcoveId)
      const index = siblings.findIndex((item) => item.id === iconId)
      const size = pageSize(current.density)
      const page = Math.max(0, Math.floor(index / size))
      return {
        ...current,
        highlightedIconId: iconId,
        focusedAlcoveId: icon.alcoveId,
        alcoves: current.alcoves.map((alcove) =>
          alcove.id === icon.alcoveId
            ? { ...alcove, collapsed: false, page }
            : alcove,
        ),
      }
    })
    window.setTimeout(() => {
      setState((current) =>
        current.highlightedIconId === iconId
          ? { ...current, highlightedIconId: null }
          : current,
      )
    }, 2400)
  }, [])

  const setFocusMode = useCallback((focusMode: boolean) => {
    setState((current) => ({ ...current, focusMode }))
  }, [])

  const setStripEdge = useCallback((stripEdge: StripEdge) => {
    setState((current) => ({ ...current, stripEdge }))
  }, [])

  const setStripToolIds = useCallback((ids: string[]) => {
    setState((current) => ({ ...current, stripToolIds: uniqueKnown(ids) }))
  }, [])

  const setFocusedAlcove = useCallback((alcoveId: string | null) => {
    setState((current) => ({ ...current, focusedAlcoveId: alcoveId }))
  }, [])

  const setAlcoveStrip = useCallback((alcoveId: string, stripId: string) => {
    setState((current) => ({
      ...current,
      alcoves: current.alcoves.map((alcove) =>
        alcove.id === alcoveId && !alcove.isInbox ? { ...alcove, stripId } : alcove,
      ),
    }))
  }, [])

  const reorderAlcove = useCallback((dragId: string, targetId: string) => {
    setState((current) => {
      const alcoves = reorderAlcoves(current.alcoves, dragId, targetId)
      return alcoves === current.alcoves ? current : { ...current, alcoves }
    })
  }, [])

  const suggestions = useMemo(
    () => suggestionsFromIcons(state.icons),
    [state.icons],
  )

  /** The bottom-right stack: pinned, but never parked anywhere in particular. */
  const pinnedIcons = useMemo(
    () =>
      state.pinIds
        .filter((id) => !state.pinAt?.[id])
        .map((id) => state.icons.find((icon) => icon.id === id))
        .filter((icon): icon is DesktopIcon => Boolean(icon)),
    [state.icons, state.pinIds, state.pinAt],
  )

  /** Slot order is the render order — nulls are trailing empty slots. */
  const topIcons = useMemo(
    () =>
      state.topSlots
        .map((id) => (id ? state.icons.find((icon) => icon.id === id) : undefined))
        .filter((icon): icon is DesktopIcon => Boolean(icon)),
    [state.icons, state.topSlots],
  )

  const dismissLicenceNudge = useCallback(() => {
    setState((current) => ({ ...current, licenceNudgedAt: Date.now() }))
  }, [])

  return {
    state,
    sortedAlcoves,
    iconsIn,
    inboxCount,
    suggestions,
    pinnedIcons,
    topIcons,
    organize,
    startEmpty,
    loadSample,
    toggleCollapsed,
    collapseAll,
    setLayout,
    setDensity,
    setAlcovePage,
    renameAlcove,
    recolorAlcove,
    setAlcoveGlyph,
    deleteAlcove,
    createAlcove,
    setAlcoveFolder,
    refreshLiveFolder,
    moveIcon,
    renameIcon,
    togglePin,
    pinIcons,
    unpinIcons,
    parkIcons,
    unparkIcons,
    noteOpen,
    dismissLicenceNudge,
    toggleTopKeep,
    hideFromTop,
    clearTopStrip,
    setTopSlotCount,
    setAlcoveView,
    setFolderView,
    createGroup,
    renameGroup,
    deleteGroup,
    moveGroup,
    moveIconToGroup,
    moveIcons,
    moveIconsToGroup,
    dropIncomingFile,
    pasteFiles,
    deleteIcon,
    deleteIcons,
    revealIcon,
    setFocusMode,
    setStripEdge,
    setStripToolIds,
    setFocusedAlcove,
    setAlcoveStrip,
    reorderAlcove,
  }
}

export type AlcoveDesktopApi = ReturnType<typeof useAlcoveDesktop>
