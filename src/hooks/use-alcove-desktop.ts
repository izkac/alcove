import { useCallback, useEffect, useMemo, useState } from "react"
import {
  DEFAULT_PIN_IDS,
  INBOX_ID,
  INCOMING_FILES,
  SAMPLE_ICONS,
} from "@/data/sample"
import { pageSize } from "@/lib/density"
import {
  applySnapshot,
  buildInbox,
  snapshotFromAlcoves,
  snapshotsForAlcoves,
  suggestionsFromIcons,
} from "@/lib/organize"
import { loadDesktopState, saveDesktopState } from "@/lib/storage"
import type {
  Alcove,
  AlcoveColor,
  Density,
  DesktopIcon,
  DesktopState,
  LayoutId,
  SuggestedGroup,
} from "@/types"

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
    focusedAlcoveId: INBOX_ID,
    highlightedIconId: null,
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
    focusedAlcoveId: INBOX_ID,
    highlightedIconId: null,
  }
}

export function useAlcoveDesktop() {
  const [state, setState] = useState<DesktopState>(
    () => loadDesktopState() ?? onboardingState(),
  )

  useEffect(() => {
    saveDesktopState(state)
  }, [state])

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

  const deleteAlcove = useCallback((alcoveId: string) => {
    setState((current) => {
      const target = current.alcoves.find((alcove) => alcove.id === alcoveId)
      if (!target || target.isInbox) return current
      const alcoves = current.alcoves.filter((alcove) => alcove.id !== alcoveId)
      const icons = current.icons.map((icon) =>
        icon.alcoveId === alcoveId ? { ...icon, alcoveId: INBOX_ID } : icon,
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
    (name: string, color: AlcoveColor, iconIds: string[] = []) => {
      const id = crypto.randomUUID()
      setState((current) => {
        const order = current.alcoves.reduce((max, alcove) => Math.max(max, alcove.order), 0) + 1
        const alcove: Alcove = {
          id,
          name: name.trim() || "New Alcove",
          color,
          collapsed: false,
          isInbox: false,
          order,
          page: 0,
        }
        const alcoves = [...current.alcoves, alcove]
        const iconSet = new Set(iconIds)
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

  const moveIcon = useCallback((iconId: string, alcoveId: string) => {
    setState((current) => ({
      ...current,
      icons: current.icons.map((icon) =>
        icon.id === iconId ? { ...icon, alcoveId } : icon,
      ),
      focusedAlcoveId: alcoveId,
      alcoves: current.alcoves.map((alcove) =>
        alcove.id === alcoveId ? { ...alcove, collapsed: false } : alcove,
      ),
    }))
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

  return {
    state,
    sortedAlcoves,
    iconsIn,
    inboxCount,
    suggestions,
    pinnedIcons,
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
    deleteAlcove,
    createAlcove,
    moveIcon,
    renameIcon,
    togglePin,
    dropIncomingFile,
    revealIcon,
    setFocusMode,
    setFocusedAlcove,
    reorderAlcove,
  }
}

export type AlcoveDesktopApi = ReturnType<typeof useAlcoveDesktop>
