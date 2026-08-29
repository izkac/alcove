import { useCallback, useEffect, useMemo, useState } from "react"
import {
  DEFAULT_PIN_IDS,
  INBOX_ID,
  INCOMING_FILES,
  SAMPLE_ICONS,
} from "@/data/sample"
import { defaultAlcoveGlyph } from "@/lib/alcove-glyphs"
import { pageSize } from "@/lib/density"
import { TOP_SLOTS, pruneFrecency, recordOpen, refreshSlots } from "@/lib/frecency"
import { mergeHarvest, mergeLiveFolder, toDesktopIcon } from "@/lib/harvest-merge"
import type { HarvestedIcon } from "@/lib/harvest-merge"
import {
  applySnapshot,
  buildInbox,
  snapshotFromAlcoves,
  snapshotsForAlcoves,
  suggestionsFromIcons,
} from "@/lib/organize"
import { loadDesktopState, saveDesktopState } from "@/lib/storage"
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

const emptySlots = (): (string | null)[] =>
  Array.from({ length: TOP_SLOTS }, () => null)

const topDefaults = () => ({
  frecency: {},
  topSlots: emptySlots(),
  topKeep: [] as string[],
  topHide: [] as string[],
})

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
  const sampleOnly = current.icons.every((icon) => !icon.path)
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

  useEffect(() => {
    saveDesktopState(state)
  }, [state])

  useEffect(() => {
    if (!isTauri()) return
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
  }, [])

  const liveKey = state.alcoves
    .filter((alcove) => alcove.folderPath)
    .map((alcove) => `${alcove.id}:${alcove.folderPath}`)
    .sort()
    .join("|")

  useEffect(() => {
    if (!isTauri() || !liveKey) return
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
  }, [liveKey])

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
    (name: string, color: AlcoveColor, iconIds: string[] = [], glyph?: string, folderPath?: string | null) => {
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

  const moveIcon = useCallback((iconId: string, alcoveId: string) => {
    setState((current) => {
      const target = current.alcoves.find((alcove) => alcove.id === alcoveId)
      const icon = current.icons.find((item) => item.id === iconId)
      const from = current.alcoves.find((alcove) => alcove.id === icon?.alcoveId)
      if (target?.folderPath || from?.folderPath) return current
      return {
        ...current,
        icons: current.icons.map((item) =>
          item.id === iconId ? { ...item, alcoveId, groupId: null } : item,
        ),
        focusedAlcoveId: alcoveId,
        alcoves: current.alcoves.map((alcove) =>
          alcove.id === alcoveId ? { ...alcove, collapsed: false } : alcove,
        ),
      }
    })
  }, [])

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

  const togglePin = useCallback((iconId: string) => {
    setState((current) => {
      const pinned = current.pinIds.includes(iconId)
      if (pinned) {
        return { ...current, pinIds: current.pinIds.filter((id) => id !== iconId) }
      }
      if (current.pinIds.length >= 8) return current
      return { ...current, pinIds: [...current.pinIds, iconId] }
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
    setState((current) => ({ ...current, ...topDefaults() }))
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

  const moveIconToGroup = useCallback(
    (iconId: string, alcoveId: string, groupId: string | null) => {
      setState((current) => ({
        ...current,
        icons: current.icons.map((icon) =>
          icon.id === iconId ? { ...icon, alcoveId, groupId } : icon,
        ),
        focusedAlcoveId: alcoveId,
      }))
    },
    [],
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

  const reorderAlcove = useCallback((dragId: string, beforeId: string) => {
    if (dragId === beforeId) return
    setState((current) => {
      const sorted = [...current.alcoves].sort((a, b) => a.order - b.order)
      const from = sorted.findIndex((alcove) => alcove.id === dragId)
      const to = sorted.findIndex((alcove) => alcove.id === beforeId)
      if (from < 0 || to < 0) return current
      const [moved] = sorted.splice(from, 1)
      sorted.splice(to, 0, moved)
      return {
        ...current,
        alcoves: sorted.map((alcove, index) => ({ ...alcove, order: index })),
      }
    })
  }, [])

  const suggestions = useMemo(
    () => suggestionsFromIcons(state.icons),
    [state.icons],
  )

  const pinnedIcons = useMemo(
    () =>
      state.pinIds
        .map((id) => state.icons.find((icon) => icon.id === id))
        .filter((icon): icon is DesktopIcon => Boolean(icon)),
    [state.icons, state.pinIds],
  )

  /** Slot order is the render order — nulls are trailing empty slots. */
  const topIcons = useMemo(
    () =>
      state.topSlots
        .map((id) => (id ? state.icons.find((icon) => icon.id === id) : undefined))
        .filter((icon): icon is DesktopIcon => Boolean(icon)),
    [state.icons, state.topSlots],
  )

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
    noteOpen,
    toggleTopKeep,
    hideFromTop,
    clearTopStrip,
    setAlcoveView,
    setFolderView,
    createGroup,
    renameGroup,
    deleteGroup,
    moveGroup,
    moveIconToGroup,
    dropIncomingFile,
    revealIcon,
    setFocusMode,
    setStripEdge,
    setStripToolIds,
    setFocusedAlcove,
    reorderAlcove,
  }
}

export type AlcoveDesktopApi = ReturnType<typeof useAlcoveDesktop>
