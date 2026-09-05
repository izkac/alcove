import { memo, useCallback, useEffect, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { toast } from "sonner"
import { AlcoveCanvas } from "@/components/alcove-canvas"
import { AlcovePanel } from "@/components/alcove-panel"
import { BackgroundDialog } from "@/components/background-dialog"
import { WallpaperDialog } from "@/components/wallpaper-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import {
  CreateAlcoveDialog,
  prefetchKnownFolders,
} from "@/components/create-alcove-dialog"
import { DesktopCorner } from "@/components/desktop-corner"
import { FrequentStrip } from "@/components/frequent-strip"
import { OnboardingDialog } from "@/components/onboarding-dialog"
import { PinField } from "@/components/pin-field"
import { ShelfRail } from "@/components/shelf-rail"
import { RenameDialog } from "@/components/rename-dialog"
import { SearchSpotlight, type LauncherPick } from "@/components/search-spotlight"
import { parentPath } from "@/lib/search-hits"
import { SettingsDialog } from "@/components/settings-dialog"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { AlcoveDesktopApi } from "@/hooks/use-alcove-desktop"
import { useDesk } from "@/hooks/use-desk"
import {
  resolveTarget,
  useAlcoveStripDrag,
  useIconPointerDrag,
  type IconDropTarget,
} from "@/hooks/use-icon-pointer-drag"
import { viewFor } from "@/lib/alcove-view"
import { TOP_SLOTS } from "@/lib/frecency"
import { useUpdateCheck } from "@/lib/update"
import { pulseLaunch } from "@/lib/launch-pulse"
import { parentWithin } from "@/lib/crumbs"
import {
  fileableIds,
  folderLeaf,
  toDesktopIcon,
  type HarvestedIcon,
} from "@/lib/harvest-merge"
import {
  alcovesOnDesk,
  deskChannel,
  type DeskChannelMessage,
  type DeskCommand,
} from "@/lib/desk-strip"
import {
  dragIconIds,
  iconPack,
  rangeIconIds,
  toggleIconId,
  visibleIconIds,
} from "@/lib/icon-select"
import { DEFAULT_STRIP_TOOL_IDS, toolsForIds, type StripTool } from "@/lib/strip-tools"
import { invoke, isTauri } from "@/lib/tauri"
import {
  announceWallpaperChange,
  applyTheme,
  applyText,
  applyTone,
  onWallpaperChange,
  rememberBackground,
  savedBackground,
  themeFromBackground,
} from "@/lib/wallpaper"
import { disproportionateId, totalByteSize } from "@/lib/weight"
import type { Alcove, AlcoveColor, DesktopIcon } from "@/types"

type DesktopShellProps = {
  desktop: AlcoveDesktopApi
}

export function DesktopShell({ desktop }: DesktopShellProps) {
  const { state } = desktop
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [createWithIcons, setCreateWithIcons] = useState<DesktopIcon[]>([])
  const [editAlcove, setEditAlcove] = useState<Alcove | null>(null)
  const [desktopAttached, setDesktopAttached] = useState<boolean | null>(null)
  const closeDrawerRef = useRef<() => void>(() => undefined)

  const onOpenSettings = useCallback(() => setSettingsOpen(true), [])

  // Surface and text settings are CSS-only once they are on <html>.
  useEffect(() => {
    applyTone(state.surfaceTone ?? "tinted")
  }, [state.surfaceTone])

  useEffect(() => {
    applyText(state.textSize ?? "default", state.strongText === true)
  }, [state.textSize, state.strongText])
  const onOpenCreate = useCallback((icons: DesktopIcon[] = []) => {
    setEditAlcove(null)
    setCreateWithIcons(icons)
    setDialogOpen(true)
  }, [])
  const onOpenEdit = useCallback((alcove: Alcove) => {
    setCreateWithIcons([])
    setEditAlcove(alcove)
    setDialogOpen(true)
  }, [])

  useEffect(() => {
    prefetchKnownFolders()
  }, [])

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    async function pinToDesktop() {
      try {
        const already = await invoke<boolean>("desktop_attached")
        if (cancelled) return
        if (already) {
          setDesktopAttached(true)
          return
        }
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
        const now = await invoke<boolean>("attach_to_desktop")
        if (!cancelled) setDesktopAttached(now)
      } catch {
        if (!cancelled) setDesktopAttached(null)
      }
    }
    void pinToDesktop()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isTauri() || !desktopAttached || !desktop.hydrated) return
    let cancelled = false
    // Allow the restored layout to paint before building the helper WebViews.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!cancelled) void invoke("prewarm_auxiliary").catch(() => undefined)
    }))
    return () => { cancelled = true }
  }, [desktopAttached, desktop.hydrated])

  return (
    <div className="relative flex h-svh min-h-0 flex-col overflow-hidden text-ink">
      <DesktopWorkspace
        desktop={desktop}
        closeDrawerRef={closeDrawerRef}
        onOpenSettings={onOpenSettings}
        onOpenCreate={onOpenCreate}
        onOpenEdit={onOpenEdit}
      />
      <CreateAlcoveDialog
        open={dialogOpen}
        alcove={editAlcove}
        seedName={
          createWithIcons.length === 1
            ? createWithIcons[0].name.replace(/\.[^.]+$/, "")
            : ""
        }
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setCreateWithIcons([])
        }}
        onCreate={(name, color: AlcoveColor, glyph, folderPath) => {
          const make = (stripId?: string | null) =>
            desktop.createAlcove(
              name,
              color,
              folderPath ? [] : createWithIcons.map((icon) => icon.id),
              glyph,
              folderPath,
              stripId,
            )
          if (!isTauri()) {
            make()
            return
          }
          invoke<{ id: string }>("this_desk")
            .then((desk) => make(desk.id))
            .catch(() => make())
        }}
        onSave={(name, color, glyph, folderPath) => {
          if (!editAlcove) return
          desktop.renameAlcove(editAlcove.id, name)
          desktop.recolorAlcove(editAlcove.id, color)
          if (!editAlcove.isInbox) {
            desktop.setAlcoveGlyph(editAlcove.id, glyph)
            const current = editAlcove.folderPath ?? null
            const next = folderPath ?? null
            if (current !== next) desktop.setAlcoveFolder(editAlcove.id, next)
          }
        }}
        onDelete={
          editAlcove && !editAlcove.isInbox
            ? () => {
                desktop.deleteAlcove(editAlcove.id)
                closeDrawerRef.current()
              }
            : undefined
        }
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        layoutId={state.layoutId}
        density={state.density}
        focusMode={state.focusMode}
        stripEdge={state.stripEdge}
        surfaceTone={state.surfaceTone ?? "tinted"}
        textSize={state.textSize ?? "default"}
        strongText={state.strongText === true}
        stripToolIds={state.stripToolIds ?? DEFAULT_STRIP_TOOL_IDS}
        desktopAttached={desktopAttached}
        onLayout={desktop.setLayout}
        onDensity={desktop.setDensity}
        onFocusMode={desktop.setFocusMode}
        onStripEdge={desktop.setStripEdge}
        onSurfaceTone={desktop.setSurfaceTone}
        onTextSize={desktop.setTextSize}
        onStrongText={desktop.setStrongText}
        onStripToolIds={desktop.setStripToolIds}
        autoDriveDrawers={state.autoDriveDrawers !== false}
        onAutoDriveDrawers={desktop.setAutoDriveDrawers}
        topSlotCount={state.topSlotCount ?? TOP_SLOTS}
        onTopSlotCount={desktop.setTopSlotCount}
        onCollapseAll={() => {
          desktop.collapseAll()
          closeDrawerRef.current()
        }}
        onDropIncoming={desktop.dropIncomingFile}
        onLoadSample={desktop.loadSample}
        onStartEmpty={desktop.startEmpty}
        onToggleDesktopLayer={
          isTauri()
            ? async () => {
                try {
                  const next = desktopAttached
                    ? await invoke<boolean>("detach_from_desktop")
                    : await invoke<boolean>("attach_to_desktop")
                  setDesktopAttached(next)
                } catch (err) {
                  toast(err instanceof Error ? err.message : String(err))
                }
              }
            : undefined
        }
      />
    </div>
  )
}

type DesktopWorkspaceProps = {
  desktop: AlcoveDesktopApi
  closeDrawerRef: { current: () => void }
  onOpenSettings: () => void
  onOpenCreate: (icons?: DesktopIcon[]) => void
  onOpenEdit: (alcove: Alcove) => void
}

const DesktopWorkspace = memo(function DesktopWorkspace({
  desktop,
  closeDrawerRef,
  onOpenSettings,
  onOpenCreate,
  onOpenEdit,
}: DesktopWorkspaceProps) {
  const { state, sortedAlcoves, iconsIn } = desktop
  const { desk, desks, stripHover } = useDesk()
  const [backgroundOpen, setBackgroundOpen] = useState(false)
  const [wallpaperOpen, setWallpaperOpen] = useState(false)
  // The desktop's current colour, so the picker opens where the user already is.
  const [deskColor, setDeskColor] = useState("#1B2027")
  useUpdateCheck(desk.primary)
  const deskAlcoves = alcovesOnDesk(sortedAlcoves, desk, desks)
  const [searchOpen, setSearchOpen] = useState(false)
  const [rename, setRename] = useState<
    | { kind: "icon"; id: string; value: string }
    | { kind: "group"; id: string; alcoveId: string; value: string }
    | null
  >(null)
  const [pendingDelete, setPendingDelete] = useState<DesktopIcon[] | null>(null)
  const [openAlcoveId, setOpenAlcoveId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [drill, setDrill] = useState<
    { alcoveId: string; path: string; icons: DesktopIcon[] } | null
  >(null)
  const [selectAnchorId, setSelectAnchorId] = useState<string | null>(null)
  const selectedRef = useRef(selectedIds)
  const pendingCollapseRef = useRef<string | null>(null)
  useEffect(() => {
    selectedRef.current = selectedIds
  })

  const openSearch = useCallback(() => {
    if (isTauri()) {
      invoke("show_search_window").catch(() => setSearchOpen(true))
      return
    }
    setSearchOpen(true)
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (inOverlay(event)) return
      const meta = event.ctrlKey || event.metaKey
      if (meta && event.key.toLowerCase() === "f") {
        event.preventDefault()
        openSearch()
      }
      if (meta && event.shiftKey && event.key.toLowerCase() === "h") {
        event.preventDefault()
        desktop.collapseAll()
        setOpenAlcoveId(null)
        setSelectedIds([])
      }
      if (meta && event.key.toLowerCase() === "n") {
        event.preventDefault()
        onOpenCreate()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [desktop, onOpenCreate, openSearch])

  useEffect(() => {
    closeDrawerRef.current = () => {
      setOpenAlcoveId(null)
      setSelectedIds([])
    }
  })

  const onlyInbox = sortedAlcoves.length === 1 && sortedAlcoves[0]?.isInbox
  const noIcons = state.icons.length === 0
  const emptyDesktop = state.phase === "ready" && onlyInbox && noIcons
  const openAlcove = openAlcoveId
    ? deskAlcoves.find((alcove) => alcove.id === openAlcoveId) ?? null
    : null
  // Transient: a drilled folder is a view, never state. Merging it into the
  // drawer would overwrite the drawer's own contents and the groups on them.
  const drillIcons = drill && drill.alcoveId === openAlcove?.id ? drill.icons : null
  const openIcons = drillIcons ?? (openAlcove ? iconsIn(openAlcove.id) : [])
  const openView = openAlcove ? viewFor(openAlcove, openIcons.length) : "panel"
  const heavyAlcoveId = disproportionateId(
    deskAlcoves.map((alcove) => ({
      id: alcove.id,
      bytes: totalByteSize(iconsIn(alcove.id)),
    })),
  )

  /**
   * Show another folder inside the open drawer. Look-and-leave: no window, no
   * taskbar button, and the drawer forgets where it was as soon as it closes.
   */
  const drillRequest = useRef(0)
  const resetDrill = useCallback(() => {
    drillRequest.current += 1
    setDrill(null)
  }, [])
  const drillInto = useCallback(
    (alcoveId: string, path: string) => {
      if (!isTauri()) return
      const request = ++drillRequest.current
      setSelectedIds([])
      invoke<HarvestedIcon[]>("list_folder_icons", { path, refresh: true })
        .then((harvested) => {
          if (drillRequest.current !== request) return
          setDrill({
            alcoveId,
            path,
            icons: harvested.map((item) => toDesktopIcon(item, alcoveId, null)),
          })
        })
        .catch(() => {
          if (drillRequest.current === request) toast(`Could not open ${folderLeaf(path)}`)
        })
    },
    [],
  )

  function openInExplorer(path: string) {
    if (!isTauri()) return
    invoke("open_desktop_item", { path }).catch(() => {
      toast(`Could not open ${folderLeaf(path)}`)
    })
  }

  function openIcon(icon: DesktopIcon) {
    desktop.noteOpen(icon.id)
    // A subfolder shown inside a drawer opens in place. Ejecting to Explorer
    // for it is the one thing that made live folders a dead end at depth one.
    if (
      icon.kind === "folder" &&
      icon.path &&
      openAlcove &&
      isTauri() &&
      openIcons.some((item) => item.id === icon.id)
    ) {
      drillInto(openAlcove.id, icon.path)
      return
    }
    if (icon.path && isTauri()) {
      pulseLaunch(icon.id)
      invoke("open_desktop_item", { path: icon.path }).catch(() => {
        toast(`Could not open ${icon.name}`)
      })
      return
    }
    toast(`Opened ${icon.name}`)
  }

  function openTool(tool: StripTool) {
    if (isTauri()) {
      pulseLaunch(tool.id)
      invoke("open_desktop_item", { path: tool.launch, args: tool.args }).catch(() => {
        toast(`Could not open ${tool.label}`)
      })
      return
    }
    toast(`Opened ${tool.label}`)
  }

  /** Swap the Windows wallpaper for a picture the user picks. */
  function chooseWallpaper() {
    setWallpaperOpen(true)
  }

  function applyWallpaper(path: string) {
    if (!isTauri()) {
      toast("Changing the wallpaper is only on Windows")
      return
    }
    return invoke("set_wallpaper", { path }).then(() => {
      announceWallpaperChange()
      toast("Wallpaper changed")
    })
  }

  /** Clear the wallpaper and leave a plain colour. */
  function applyBackgroundColor(color: string) {
    if (!isTauri()) {
      toast("Changing the background is only on Windows")
      return
    }
    invoke("set_wallpaper_color", { color })
      .then(() => {
        announceWallpaperChange()
        toast("Background set")
      })
      .catch((err) => toast(err instanceof Error ? err.message : String(err)))
  }

  function typingInField() {
    const el = document.activeElement
    if (!(el instanceof HTMLElement)) return false
    const tag = el.tagName
    return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable
  }

  /**
   * A dialog or menu owns the keyboard while it is open. Without this, Enter on
   * the delete confirmation cancels it *and* opens the files, and Ctrl+V behind
   * Settings pastes onto the desktop.
   */
  function inOverlay(event: KeyboardEvent) {
    if (event.defaultPrevented) return true
    const el = document.activeElement
    return (
      el instanceof Element &&
      el.closest('[role="dialog"],[role="menu"],[role="alertdialog"]') !== null
    )
  }

  function pasteHere() {
    const dest = drill?.path ?? openAlcove?.folderPath ?? null
    const assign = openAlcove && !openAlcove.isInbox ? openAlcove.id : null
    desktop
      .pasteFiles(dest, assign)
      .then(() => {
        if (drill) drillInto(drill.alcoveId, drill.path)
      })
      .catch((err) => {
        toast(err instanceof Error ? err.message : String(err))
      })
  }

  // Closing a drawer resets it to its own folder — the cursor is never saved.
  useEffect(() => {
    resetDrill()
  }, [openAlcoveId, openAlcove?.folderPath, resetDrill])

  // Every delete route -- menu, Delete key, parked icons -- lands here, so the
  // question gets asked once and cannot be skipped by taking another road.
  function removeIcons(icons: DesktopIcon[]) {
    if (icons.length > 0) setPendingDelete(icons)
  }

  function confirmedRemove(icons: DesktopIcon[]) {
    desktop
      .deleteIcons(icons)
      .then(() => {
        // The drilled listing is a view, not state, so nothing else refreshes it.
        if (drill) drillInto(drill.alcoveId, drill.path)
      })
      .catch((err) => {
        toast(err instanceof Error ? err.message : String(err))
      })
    setSelectedIds([])
  }

  function removeIcon(icon: DesktopIcon) {
    removeIcons([icon])
  }

  function idsFor(id: string) {
    return selectedIds.includes(id) && selectedIds.length > 1 ? selectedIds : [id]
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (typingInField() || inOverlay(event)) return
      const meta = event.ctrlKey || event.metaKey
      if (meta && event.key.toLowerCase() === "v") {
        event.preventDefault()
        pasteHere()
      }
      if (meta && event.key.toLowerCase() === "a") {
        event.preventDefault()
        const ids = visibleIconIds()
        setSelectedIds(ids)
        setSelectAnchorId(ids[0] ?? null)
        return
      }
      if (event.key === "Escape") {
        if (selectedIds.length > 0) {
          event.preventDefault()
          setSelectedIds([])
        }
        return
      }
      // Drilled icons are a view, not state, so they are not in state.icons.
      const pool = drillIcons ? [...state.icons, ...drillIcons] : state.icons
      if (event.key === "Backspace" && drill && openAlcove?.folderPath) {
        event.preventDefault()
        const up = parentWithin(openAlcove.folderPath, drill.path)
        if (up && up.toLowerCase() !== openAlcove.folderPath.toLowerCase()) {
          drillInto(openAlcove.id, up)
        } else {
          resetDrill()
        }
        return
      }
      const selected = selectedIds
        .map((id) => pool.find((item) => item.id === id))
        .filter((icon): icon is DesktopIcon => Boolean(icon))
      if (event.key === "Enter") {
        const host = document.activeElement instanceof Element
          ? document.activeElement.closest("[data-desktop-icon]")
          : null
        const id = host instanceof HTMLElement ? host.dataset.desktopIcon : undefined
        const focused = id ? pool.find((item) => item.id === id) : null
        const pack = focused ? iconPack(focused, selectedIds, pool) : selected
        if (pack.length === 0) {
          // Nothing picked out: hand the whole folder to Explorer and get out.
          if (drill) {
            event.preventDefault()
            openInExplorer(drill.path)
          }
          return
        }
        event.preventDefault()
        for (const icon of pack) openIcon(icon)
        return
      }
      if (event.key === "Delete") {
        if (selected.length > 0) {
          event.preventDefault()
          removeIcons(selected)
          return
        }
        const host = document.activeElement instanceof Element
          ? document.activeElement.closest("[data-desktop-icon]")
          : null
        const id =
          host instanceof HTMLElement ? host.dataset.desktopIcon : undefined
        const icon = id ? pool.find((item) => item.id === id) : null
        if (icon) {
          event.preventDefault()
          removeIcon(icon)
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [desktop, drill, drillIcons, drillInto, openAlcove, resetDrill, selectedIds, state.icons])

  const applyDrop = useCallback(
    (icons: DesktopIcon[], target: IconDropTarget) => {
      const known = new Set(state.icons.map((icon) => icon.id))
      // Drilled rows are a view, not state, and a drawer that mirrors a folder
      // refuses filing in both directions. See fileableIds for why.
      const mirrors = (alcoveId: string) =>
        Boolean(state.alcoves.find((item) => item.id === alcoveId)?.folderPath)
      if (target.kind === "group" || target.kind === "alcove") {
        const into = target.kind === "group" ? target.alcoveId : target.id
        const canFile = fileableIds(state.alcoves, into, icons, known)
        if (canFile.length === 0) {
          if (mirrors(into)) toast("That drawer mirrors a folder on disk")
          return
        }
        if (target.kind === "group") {
          desktop.moveIconsToGroup(canFile, into, target.groupId)
        } else {
          desktop.moveIcons(canFile, into)
        }
        desktop.unparkIcons(canFile)
        setSelectedIds([])
        return
      }
      if (target.kind === "pin") {
        const pinnable = icons.filter((icon) => known.has(icon.id))
        if (pinnable.length === 0) return
        desktop.pinIcons(pinnable.map((icon) => icon.id))
        return
      }
      if (target.kind === "wallpaper") {
        // Parking shows an icon on the desktop; it does not move it. Whatever
        // drawer it was sorted into keeps it, so the desktop is a second view
        // of the same file rather than a place things fall out of.
        const parkable = icons.filter((icon) => known.has(icon.id))
        if (parkable.length === 0) return
        desktop.parkIcons(
          parkable.map((icon) => icon.id),
          target.x,
          target.y,
          desk.id,
        )
        setOpenAlcoveId(null)
        setSelectedIds([])
        return
      }
      if (target.kind === "launch") {
        const files = icons.filter((icon) => icon.path)
        if (files.length === 0 || !isTauri()) return
        for (const icon of files) {
          desktop.noteOpen(icon.id)
          // ponytail: one quoted path per launch, so a multi-select opens N
          // windows. Batch into a single argv if anyone actually asks.
          invoke("open_desktop_item", {
            path: target.app,
            args: `"${icon.path}"`,
          }).catch(() => toast(`Could not open ${icon.name} with ${target.label}`))
        }
        setSelectedIds([])
        return
      }
    },
    [desktop, desk.id, state.icons, state.alcoves],
  )

  const dropIconsAt = useCallback(
    (icons: DesktopIcon[], x: number, y: number) => {
      applyDrop(icons, resolveTarget(x, y).target)
    },
    [applyDrop],
  )

  const companionsFor = useCallback(
    (grabbed: DesktopIcon) => {
      const ids = dragIconIds(selectedRef.current, grabbed.id)
      return ids
        .map((id) => state.icons.find((item) => item.id === id))
        .filter((icon): icon is DesktopIcon => Boolean(icon))
    },
    [state.icons],
  )

  const { onPointerDown } = useIconPointerDrag(
    desk.id,
    applyDrop,
    (icons, hit) => {
      if (hit.id === desk.id || icons.length === 0) return false
      const channel = deskChannel()
      channel?.postMessage({
        type: "icon-drop",
        iconId: icons[0].id,
        iconIds: icons.map((icon) => icon.id),
        deskId: hit.id,
        x: hit.x,
        y: hit.y,
      } satisfies DeskChannelMessage)
      channel?.close()
      return true
    },
    (iconIds, x, y) => {
      const icons = iconIds
        .map((id) => state.icons.find((item) => item.id === id))
        .filter((icon): icon is DesktopIcon => Boolean(icon))
      if (icons.length > 0) dropIconsAt(icons, x, y)
    },
    companionsFor,
    (icon) => {
      if (pendingCollapseRef.current !== icon.id) return
      pendingCollapseRef.current = null
      setSelectedIds([icon.id])
      setSelectAnchorId(icon.id)
    },
  )

  function onIconPointerDown(icon: DesktopIcon, event: ReactPointerEvent) {
    if (event.button !== 0) {
      onPointerDown(icon, event)
      return
    }
    if (event.ctrlKey || event.metaKey || event.shiftKey) event.preventDefault()
    const meta = event.ctrlKey || event.metaKey
    const shift = event.shiftKey
    pendingCollapseRef.current = null
    if (shift) {
      const next = rangeIconIds(
        visibleIconIds(),
        selectAnchorId ?? icon.id,
        icon.id,
      )
      selectedRef.current = next
      setSelectedIds(next)
    } else if (meta) {
      const next = toggleIconId(selectedRef.current, icon.id)
      selectedRef.current = next
      setSelectedIds(next)
      setSelectAnchorId(icon.id)
    } else if (!selectedRef.current.includes(icon.id)) {
      selectedRef.current = [icon.id]
      setSelectedIds([icon.id])
      setSelectAnchorId(icon.id)
    } else {
      pendingCollapseRef.current = icon.id
    }
    onPointerDown(icon, event)
  }

  const { onPointerDown: onAlcovePointerDown, skipClick: skipAlcoveClick } =
    useAlcoveStripDrag(
      desk.id,
      (alcoveId, stripId) => {
        desktop.setAlcoveStrip(alcoveId, stripId)
        if (openAlcoveId === alcoveId) setOpenAlcoveId(null)
      },
      desktop.reorderAlcove,
    )

  /**
   * The verbs the launcher offers. They live here because they need the drawers,
   * the dialogs and the desktop state — none of which the search window has.
   */
  const runDeskCommand = useCallback(
    (command: DeskCommand, alcoveId?: string) => {
      const surface = () => {
        if (isTauri()) invoke("focus_desktop").catch(() => undefined)
      }
      if (command === "open-alcove") {
        if (!alcoveId) return
        setOpenAlcoveId(alcoveId)
        setSelectedIds([])
        surface()
        return
      }
      if (command === "new-alcove") {
        onOpenCreate()
        surface()
        return
      }
      if (command === "settings") {
        onOpenSettings()
        surface()
        return
      }
      if (command === "wallpaper") {
        setWallpaperOpen(true)
        surface()
        return
      }
      if (command === "collapse-all") {
        desktop.collapseAll()
        setOpenAlcoveId(null)
        setSelectedIds([])
        return
      }
      if (!isTauri()) {
        toast("That one is only on Windows")
        return
      }
      if (command === "toggle-taskbar") {
        invoke<boolean>("windows_taskbar_hidden")
          .then((hidden) => invoke<boolean>("set_windows_taskbar_hidden", { hidden: !hidden }))
          .then((hidden) => toast(hidden ? "Windows taskbar hidden" : "Windows taskbar shown"))
          .catch((err) => toast(err instanceof Error ? err.message : String(err)))
        return
      }
      if (command === "empty-bin") {
        // Windows puts up its own confirmation, so this never silently deletes.
        invoke("empty_recycle_bin").catch((err) =>
          toast(err instanceof Error ? err.message : String(err)),
        )
      }
    },
    [desktop, onOpenCreate, onOpenSettings],
  )

  /**
   * Ctrl+F is "find it on my desktop", not "launch it" — so Enter on a file
   * brings its drawer forward and selects it, the way the dialog title has
   * always promised. The Enter modifiers still go straight to Explorer, and
   * everything that is not a file behaves as it does in the standalone window.
   */
  function onPickFromSearch(chosen: LauncherPick) {
      if (chosen.kind === "icon") {
        const { icon, how } = chosen
        if (how === "reveal" && icon.path && isTauri()) {
          invoke("reveal_desktop_item", { path: icon.path }).catch(() => undefined)
          return
        }
        if (how === "folder" && icon.path && isTauri()) {
          const parent = parentPath(icon.path)
          if (parent) invoke("open_desktop_item", { path: parent }).catch(() => undefined)
          return
        }
        // A hit from the deep walk has no drawer to bring forward, so it opens.
        if (!icon.alcoveId) {
          openIcon(icon)
          return
        }
        desktop.revealIcon(icon.id)
        setOpenAlcoveId(icon.alcoveId)
        setSelectedIds([icon.id])
        setSelectAnchorId(icon.id)
        return
      }
      if (chosen.kind === "window" && isTauri()) {
        invoke("activate_window", { hwnd: chosen.app.hwnd }).catch(() => undefined)
        return
      }
      if (chosen.kind === "alcove") {
        runDeskCommand("open-alcove", chosen.alcove.id)
        return
      }
      if (chosen.kind === "command") {
        runDeskCommand(chosen.command)
        return
      }
      if (chosen.kind === "target" && isTauri()) {
        invoke("open_desktop_item", { path: chosen.target }).catch(() => undefined)
      }
  }

  // Which drawers this desk is responsible for, without making the channel
  // resubscribe every time the list is rebuilt.
  const ownedRef = useRef<string[]>([])
  useEffect(() => {
    ownedRef.current = deskAlcoves.map((alcove) => alcove.id)
  })

  useEffect(() => {
    const channel = deskChannel()
    if (!channel) return
    function onMessage(event: MessageEvent<DeskChannelMessage>) {
      const data = event.data
      if (data.type === "icon-launched") {
        // One desk records it, or every monitor counts the same launch again.
        if (desk.primary) desktop.noteOpen(data.iconId)
        return
      }
      if (data.type === "desk-command") {
        // A drawer opens on the screen it lives on; everything else is a job for
        // one desk only, or every monitor would put up its own dialog.
        if (data.command === "open-alcove") {
          if (data.alcoveId && ownedRef.current.includes(data.alcoveId)) {
            runDeskCommand(data.command, data.alcoveId)
          }
          return
        }
        if (desk.primary) runDeskCommand(data.command)
        return
      }
      if (data.type !== "icon-drop" || data.deskId !== desk.id) return
      const ids = data.iconIds?.length ? data.iconIds : [data.iconId]
      const icons = ids
        .map((id) => state.icons.find((item) => item.id === id))
        .filter((icon): icon is DesktopIcon => Boolean(icon))
      if (icons.length === 0) return
      dropIconsAt(icons, data.x, data.y)
    }
    channel.addEventListener("message", onMessage)
    return () => {
      channel.removeEventListener("message", onMessage)
      channel.close()
    }
  }, [desk.id, desk.primary, desktop, dropIconsAt, runDeskCommand, state.icons])

  function newGroup() {
    if (!openAlcove) return
    const id = desktop.createGroup(openAlcove.id, "New group")
    setRename({ kind: "group", id, alcoveId: openAlcove.id, value: "New group" })
  }

  const frequentStrip =
    state.phase === "ready" ? (
      <FrequentStrip
        edge={state.stripEdge}
        tools={toolsForIds(state.stripToolIds)}
        icons={desktop.topIcons}
        keepIds={state.topKeep}
        onOpenTool={openTool}
        onOpen={openIcon}
        onToggleKeep={desktop.toggleTopKeep}
        onHide={desktop.hideFromTop}
        onReveal={(iconId) => {
          desktop.revealIcon(iconId)
          const icon = state.icons.find((item) => item.id === iconId)
          if (icon?.alcoveId) setOpenAlcoveId(icon.alcoveId)
          setSelectedIds([iconId])
          setSelectAnchorId(iconId)
        }}
      />
    ) : null

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <Wallpaper onColor={setDeskColor} />
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <main
            className="relative flex h-full min-h-0 flex-1"
            onDoubleClick={(event) => {
              if (event.target === event.currentTarget) onOpenCreate()
            }}
          >
            {emptyDesktop ? (
              <EmptyDesktopHint onCreate={() => onOpenCreate()} />
            ) : null}
            {state.phase === "onboarding" ? (
              <div className="relative z-10 flex min-h-0 flex-1 p-4 md:p-6">
                <ScatteredPreview icons={state.icons} />
              </div>
            ) : (
              <>
                <ShelfRail
                    alcoves={deskAlcoves}
                    countFor={(alcoveId) => iconsIn(alcoveId).length}
                    onEject={desktop.ejectDrive}
                    sizeFor={(alcoveId) => totalByteSize(iconsIn(alcoveId))}
                    heavyAlcoveId={heavyAlcoveId}
                    openAlcoveId={openAlcoveId}
                    desks={desks}
                    deskId={desk.id}
                    stripHover={stripHover}
                    onMoveToDesk={(alcoveId, stripId) => {
                      desktop.setAlcoveStrip(alcoveId, stripId)
                      if (openAlcoveId === alcoveId) setOpenAlcoveId(null)
                    }}
                    onAlcovePointerDown={onAlcovePointerDown}
                    skipAlcoveClick={skipAlcoveClick}
                    onReorder={desktop.reorderAlcove}
                    onSelect={(alcoveId) => {
                      setOpenAlcoveId((current) =>
                        current === alcoveId ? null : alcoveId,
                      )
                      setSelectedIds([])
                      desktop.setFocusedAlcove(alcoveId)
                      desktop.refreshLiveFolder(alcoveId)
                    }}
                    onSearch={openSearch}
                    onNewAlcove={() => onOpenCreate()}
                    onSettings={onOpenSettings}
                    onEdit={onOpenEdit}
                    onRecolor={desktop.recolorAlcove}
                    onSetGlyph={desktop.setAlcoveGlyph}
                    onLinkFolder={(alcove) => {
                      if (!isTauri()) return
                      invoke<string | null>("pick_folder")
                        .then((path) => {
                          if (path) desktop.setAlcoveFolder(alcove.id, path)
                        })
                        .catch(() => undefined)
                    }}
                    onUnlinkFolder={(alcoveId) =>
                      desktop.setAlcoveFolder(alcoveId, null)
                    }
                    onDelete={(alcoveId) => {
                      desktop.deleteAlcove(alcoveId)
                      if (openAlcoveId === alcoveId) setOpenAlcoveId(null)
                    }}
                  />
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {state.stripEdge !== "bottom" ? frequentStrip : null}
                    <div
                      data-pin-origin=""
                      className={
                        openView === "canvas"
                          ? "relative z-10 flex min-h-0 flex-1 p-4 md:p-6"
                          : "relative z-10 flex min-h-0 flex-1 items-start overflow-auto p-4 md:p-6"
                      }
                    onPointerDown={(event) => {
                      if (event.target === event.currentTarget) {
                        setOpenAlcoveId(null)
                        setSelectedIds([])
                      }
                    }}
                    onDoubleClick={(event) => {
                      if (event.target === event.currentTarget) onOpenCreate()
                    }}
                  >
                    <PinField
                      icons={state.icons}
                      pinAt={state.pinAt}
                      deskId={desk.id}
                      selectedIds={selectedIds}
                      highlightedIconId={state.highlightedIconId}
                      onOpen={openIcon}
                      onRename={(icon) =>
                        setRename({ kind: "icon", id: icon.id, value: icon.name })
                      }
                      onUnpark={(icon) => desktop.unpinIcons(idsFor(icon.id))}
                      onDelete={(icon) => {
                        const pack = idsFor(icon.id)
                          .map((id) => state.icons.find((item) => item.id === id))
                          .filter((item): item is DesktopIcon => Boolean(item))
                        removeIcons(pack)
                      }}
                      onIconPointerDown={onIconPointerDown}
                    />
                    {openAlcove && openView === "canvas" ? (
                      <AlcoveCanvas
                        key={openAlcove.id}
                        alcove={openAlcove}
                        icons={openIcons}
                        allAlcoves={sortedAlcoves}
                        pinIds={state.pinIds}
                        density={state.density}
                        highlightedIconId={state.highlightedIconId}
                        selectedIds={selectedIds}
                        onClose={() => {
                          setOpenAlcoveId(null)
                          setSelectedIds([])
                        }}
                        onCompact={() => desktop.setAlcoveView(openAlcove.id, "panel")}
                        onEject={
                          openAlcove.removable
                            ? () => desktop.ejectDrive(openAlcove.id)
                            : undefined
                        }
                        onEdit={() => onOpenEdit(openAlcove)}
                        onDelete={
                          openAlcove.isInbox
                            ? undefined
                            : () => {
                                desktop.deleteAlcove(openAlcove.id)
                                setOpenAlcoveId(null)
                              }
                        }
                        onRecolor={(color) => desktop.recolorAlcove(openAlcove.id, color)}
                        onSetGlyph={(glyph) => desktop.setAlcoveGlyph(openAlcove.id, glyph)}
                        onOpenIcon={openIcon}
                        onRenameIcon={(icon) =>
                          setRename({ kind: "icon", id: icon.id, value: icon.name })
                        }
                        onSetPinned={(ids, pin) => {
                          // From inside a drawer there is nowhere to drag to,
                          // so the menu parks it: 0,0 means the first free cell.
                          if (pin) desktop.parkIcons(ids, 0, 0, desk.id)
                          else desktop.unpinIcons(ids)
                        }}
                        onMoveIcon={(iconId, alcoveId) => {
                          desktop.moveIcons(idsFor(iconId), alcoveId)
                          setSelectedIds([])
                        }}
                        onNewAlcoveWith={(icons) => {
                          onOpenCreate(icons)
                          setSelectedIds([])
                        }}
                        onPaste={pasteHere}
                        onDeleteIcon={(icon) => {
                          const pack = idsFor(icon.id)
                            .map((id) => state.icons.find((item) => item.id === id))
                            .filter((item): item is DesktopIcon => Boolean(item))
                          removeIcons(pack)
                        }}
                        onIconPointerDown={onIconPointerDown}
                        onNewGroup={newGroup}
                        onRenameGroup={(group) =>
                          setRename({
                            kind: "group",
                            id: group.id,
                            alcoveId: openAlcove.id,
                            value: group.name,
                          })
                        }
                        onDeleteGroup={(groupId) =>
                          desktop.deleteGroup(openAlcove.id, groupId)
                        }
                        onMoveGroup={(groupId, delta) =>
                          desktop.moveGroup(openAlcove.id, groupId, delta)
                        }
                        onMoveIconToGroup={(iconId, groupId) => {
                          desktop.moveIconsToGroup(
                            idsFor(iconId),
                            openAlcove.id,
                            groupId,
                          )
                          setSelectedIds([])
                        }}
                        onFolderView={(view) =>
                          desktop.setFolderView(openAlcove.id, view)
                        }
                        folderPath={drill?.path ?? openAlcove.folderPath}
                        onCrumb={(path) => {
                          if (
                            openAlcove.folderPath &&
                            path.toLowerCase() === openAlcove.folderPath.toLowerCase()
                          ) {
                            resetDrill()
                            setSelectedIds([])
                          } else {
                            drillInto(openAlcove.id, path)
                          }
                        }}
                        onOpenFolderHere={() =>
                          openInExplorer(drill?.path ?? openAlcove.folderPath ?? "")
                        }
                      />
                    ) : openAlcove ? (
                      <AlcovePanel
                        key={openAlcove.id}
                        alcove={{ ...openAlcove, collapsed: false }}
                        icons={openIcons}
                        onExpandCanvas={() => desktop.setAlcoveView(openAlcove.id, "canvas")}
                        onEject={
                          openAlcove.removable
                            ? () => desktop.ejectDrive(openAlcove.id)
                            : undefined
                        }
                        allAlcoves={sortedAlcoves}
                        pinIds={state.pinIds}
                        density={state.density}
                        highlightedIconId={state.highlightedIconId}
                        selectedIds={selectedIds}
                        onToggle={() => {
                          setOpenAlcoveId(null)
                          setSelectedIds([])
                        }}
                        onEdit={() => onOpenEdit(openAlcove)}
                        onRecolor={(color) =>
                          desktop.recolorAlcove(openAlcove.id, color)
                        }
                        onSetGlyph={(glyph) =>
                          desktop.setAlcoveGlyph(openAlcove.id, glyph)
                        }
                        onDelete={() => {
                          desktop.deleteAlcove(openAlcove.id)
                          setOpenAlcoveId(null)
                        }}
                        onOpenIcon={openIcon}
                        onRenameIcon={(icon) =>
                          setRename({ kind: "icon", id: icon.id, value: icon.name })
                        }
                        onSetPinned={(ids, pin) => {
                          // From inside a drawer there is nowhere to drag to,
                          // so the menu parks it: 0,0 means the first free cell.
                          if (pin) desktop.parkIcons(ids, 0, 0, desk.id)
                          else desktop.unpinIcons(ids)
                        }}
                        onMoveIcon={(iconId, alcoveId) => {
                          desktop.moveIcons(idsFor(iconId), alcoveId)
                          setSelectedIds([])
                        }}
                        onNewAlcoveWith={(icons) => {
                          onOpenCreate(icons)
                          setSelectedIds([])
                        }}
                        onPaste={pasteHere}
                        onDeleteIcon={(icon) => {
                          const pack = idsFor(icon.id)
                            .map((id) => state.icons.find((item) => item.id === id))
                            .filter((item): item is DesktopIcon => Boolean(item))
                          removeIcons(pack)
                        }}
                        onFocus={() => desktop.setFocusedAlcove(openAlcove.id)}
                        onDropIncoming={
                          openAlcove.isInbox ? desktop.dropIncomingFile : undefined
                        }
                        onIconPointerDown={onIconPointerDown}
                        onFolderView={(view) =>
                          desktop.setFolderView(openAlcove.id, view)
                        }
                        folderPath={drill?.path ?? openAlcove.folderPath}
                        onCrumb={(path) => {
                          if (
                            openAlcove.folderPath &&
                            path.toLowerCase() === openAlcove.folderPath.toLowerCase()
                          ) {
                            resetDrill()
                            setSelectedIds([])
                          } else {
                            drillInto(openAlcove.id, path)
                          }
                        }}
                        onOpenFolderHere={() =>
                          openInExplorer(drill?.path ?? openAlcove.folderPath ?? "")
                        }
                      />
                    ) : null}
                    </div>
                    {state.stripEdge === "bottom" ? frequentStrip : null}
                  </div>
                </>
              )}
          </main>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={pasteHere}>Paste</ContextMenuItem>
          <ContextMenuItem onSelect={() => onOpenCreate()}>
            New Alcove
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              desktop.collapseAll()
              setSelectedIds([])
            }}
          >
            Collapse all
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger>Background</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem onSelect={chooseWallpaper}>
                Choose a picture…
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => setBackgroundOpen(true)}>
                Solid colour…
              </ContextMenuItem>
              {isTauri() ? (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={() =>
                      openInExplorer("ms-settings:personalization-background")
                    }
                  >
                    Windows personalisation…
                  </ContextMenuItem>
                </>
              ) : null}
            </ContextMenuSubContent>
          </ContextMenuSub>
          {isTauri() ? null : (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={desktop.dropIncomingFile}>
                Drop a new file
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
      <DesktopCorner
        pinnedIcons={desktop.pinnedIcons}
        selectedIds={selectedIds}
        onOpenIcon={openIcon}
        onIconPointerDown={onIconPointerDown}
      />
      <BackgroundDialog
        open={backgroundOpen}
        current={deskColor}
        onOpenChange={setBackgroundOpen}
        onApply={applyBackgroundColor}
      />
      <WallpaperDialog
        open={wallpaperOpen}
        onOpenChange={setWallpaperOpen}
        onApply={applyWallpaper}
      />
      <OnboardingDialog
        open={state.phase === "onboarding"}
        groups={desktop.suggestions}
        clutterCount={state.icons.length}
        onOrganize={desktop.organize}
        onStartEmpty={desktop.startEmpty}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title={
          pendingDelete && pendingDelete.length > 1
            ? `Delete ${pendingDelete.length} items?`
            : `Delete ${pendingDelete?.[0]?.name ?? ""}?`
        }
        body="This moves the real file to the Recycle Bin, where Windows can put it back. Everything else Alcove does — drawers, groups, the desktop — leaves your files alone."
        confirmLabel={
          pendingDelete && pendingDelete.length > 1
            ? `Delete ${pendingDelete.length} items`
            : "Delete"
        }
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        onConfirm={() => {
          if (pendingDelete) confirmedRemove(pendingDelete)
        }}
      />
      <RenameDialog
        open={rename !== null}
        title={
          rename?.kind === "icon"
            ? "Rename icon"
            : "Name this group"
        }
        value={rename?.value ?? ""}
        onOpenChange={(open) => {
          if (!open) setRename(null)
        }}
        onSave={(value) => {
          if (!rename) return
          if (rename.kind === "group")
            desktop.renameGroup(rename.alcoveId, rename.id, value)
          else desktop.renameIcon(rename.id, value)
        }}
      />
      <SearchSpotlight
        open={searchOpen}
        onOpenChange={setSearchOpen}
        icons={state.icons}
        alcoves={sortedAlcoves}
        frecency={state.frecency}
        hide={state.topHide}
        openLabel="show on the desktop"
        onPick={onPickFromSearch}
      />
    </div>
  )
})

/**
 * The browser mock has no Windows wallpaper, so it paints one of two stand-ins.
 * `?dark` picks the dark one, which is how the slate theme gets exercised in
 * development without a second machine.
 */
const MOCK_WALLPAPER = {
  light: "linear-gradient(115deg, oklch(45% 0.19 255) 0%, oklch(62% 0.17 240) 48%, oklch(78% 0.13 225) 100%)",
  dark: "radial-gradient(120% 90% at 22% 28%, oklch(30% 0.03 300) 0%, oklch(20% 0.02 290) 45%, oklch(12% 0.012 280) 100%)",
}

function Wallpaper({ onColor }: { onColor?: (hex: string) => void }) {
  const [background, setBackground] = useState(
    () => savedBackground() ?? { color: "#191919", imageUrl: null },
  )
  const colorRef = useRef(onColor)
  const painted = useRef("")
  useEffect(() => {
    colorRef.current = onColor
  }, [onColor])

  const load = useCallback(() => {
    if (!isTauri()) {
      // ponytail: dev-only hook. A picture parked here (a data URL, say, dropped
      // in by the site's screenshot script) poses the mock on a real wallpaper
      // and tints it the way the desktop app would.
      const posed = localStorage.getItem("alcove.mock.wallpaper")
      if (posed) {
        setBackground({ color: "#191919", imageUrl: posed })
        themeFromBackground("#191919", posed).then(applyTheme)
        return
      }
      const dark = new URLSearchParams(window.location.search).has("dark")
      // The light stand-in mimics the Windows 10 wallpaper's numbers.
      applyTheme(
        dark
          ? { mode: "dark", hue: 290, chroma: 0.03, lightness: 0.2 }
          : { mode: "light", hue: 250, chroma: 0.16, lightness: 0.57 },
      )
      return
    }
    invoke<{ color: string; imageUrl: string | null }>("desktop_background", {
      width: Math.max(1, Math.round(window.innerWidth * (window.devicePixelRatio || 1))),
      height: Math.max(1, Math.round(window.innerHeight * (window.devicePixelRatio || 1))),
    })
      .then((next) => {
        const color = next.color || "#191919"
        const imageUrl = next.imageUrl
        const key = `${color}\0${imageUrl ?? ""}`
        if (painted.current === key) return
        painted.current = key
        setBackground({ color, imageUrl })
        rememberBackground({ color, imageUrl })
        colorRef.current?.(color)
        // Read the wallpaper before deciding whether we are paper or slate.
        return themeFromBackground(color, imageUrl).then(applyTheme)
      })
      .catch(() => undefined)
  }, [])

  // Re-read when the wallpaper is replaced, from this desk or another.
  useEffect(() => {
    load()
    return onWallpaperChange(load)
  }, [load])

  const mockDark =
    !isTauri() && new URLSearchParams(window.location.search).has("dark")

  return (
    <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
      <div
        className="absolute inset-0 bg-center bg-no-repeat"
        style={{
          backgroundColor: background.color,
          backgroundImage: background.imageUrl
            ? `url("${background.imageUrl}")`
            : isTauri()
              ? undefined
              : MOCK_WALLPAPER[mockDark ? "dark" : "light"],
          backgroundSize: background.imageUrl ? "cover" : undefined,
        }}
      />
    </div>
  )
}

function EmptyDesktopHint({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center p-6">
      <div className="alcove-rise pointer-events-auto max-w-xs rounded-2xl border border-hairline bg-surface px-6 py-5 text-center text-ink shadow-pop">
        <p className="text-title font-medium">A clear desktop</p>
        <p className="mt-1 text-ui text-ink-muted">
          Double-click the wallpaper to make an Alcove. New files on the Desktop
          will land in the Inbox on their own.
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="mt-3 rounded text-ui font-medium text-sel underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sel"
        >
          Create your first Alcove
        </button>
      </div>
    </div>
  )
}

function ScatteredPreview({ icons }: { icons: DesktopIcon[] }) {
  return (
    <div className="grid w-full grid-cols-3 gap-4 opacity-50 sm:grid-cols-6 md:grid-cols-8">
      {icons.slice(0, 24).map((icon) => (
        <div key={icon.id} className="on-wallpaper flex flex-col items-center gap-1">
          <div className="size-12 rounded-xl bg-[oklch(100%_0_0/0.18)]" />
          <span className="line-clamp-1 w-full text-center text-label">
            {icon.name}
          </span>
        </div>
      ))}
    </div>
  )
}
