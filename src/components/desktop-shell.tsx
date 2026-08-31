import { memo, useCallback, useEffect, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { toast } from "sonner"
import { AlcoveCanvas } from "@/components/alcove-canvas"
import { AlcovePanel } from "@/components/alcove-panel"
import { PreviewCard } from "@/components/preview-card"
import {
  CreateAlcoveDialog,
  prefetchKnownFolders,
} from "@/components/create-alcove-dialog"
import { DesktopCorner } from "@/components/desktop-corner"
import { FrequentStrip } from "@/components/frequent-strip"
import { OnboardingDialog } from "@/components/onboarding-dialog"
import { ShelfRail } from "@/components/shelf-rail"
import { RenameDialog } from "@/components/rename-dialog"
import { SearchSpotlight } from "@/components/search-spotlight"
import { SettingsDialog } from "@/components/settings-dialog"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { INBOX_ID } from "@/data/sample"
import type { AlcoveDesktopApi } from "@/hooks/use-alcove-desktop"
import { useDesk } from "@/hooks/use-desk"
import {
  resolveTarget,
  useAlcoveStripDrag,
  useIconPointerDrag,
  type IconDropTarget,
} from "@/hooks/use-icon-pointer-drag"
import { viewFor } from "@/lib/alcove-view"
import { useLicenceNudge, useUpdateCheck } from "@/lib/update"
import { parentWithin } from "@/lib/crumbs"
import { folderLeaf, toDesktopIcon, type HarvestedIcon } from "@/lib/harvest-merge"
import { alcovesOnDesk, deskChannel, type DeskChannelMessage } from "@/lib/desk-strip"
import {
  dragIconIds,
  iconPack,
  rangeIconIds,
  toggleIconId,
  visibleIconIds,
} from "@/lib/icon-select"
import { DEFAULT_STRIP_TOOL_IDS, toolsForIds, type StripTool } from "@/lib/strip-tools"
import { invoke, isTauri } from "@/lib/tauri"
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

  return (
    <div className="relative flex h-svh min-h-0 flex-col overflow-hidden text-white">
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
        stripToolIds={state.stripToolIds ?? DEFAULT_STRIP_TOOL_IDS}
        desktopAttached={desktopAttached}
        onLayout={desktop.setLayout}
        onDensity={desktop.setDensity}
        onFocusMode={desktop.setFocusMode}
        onStripEdge={desktop.setStripEdge}
        onStripToolIds={desktop.setStripToolIds}
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
  useUpdateCheck(desk.primary)
  useLicenceNudge(
    desk.primary,
    state.firstRunAt,
    state.licenceNudgedAt,
    desktop.dismissLicenceNudge,
  )
  const deskAlcoves = alcovesOnDesk(sortedAlcoves, desk, desks)
  const [searchOpen, setSearchOpen] = useState(false)
  const [rename, setRename] = useState<
    | { kind: "icon"; id: string; value: string }
    | { kind: "group"; id: string; alcoveId: string; value: string }
    | null
  >(null)
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
  // One selected item means "what is this?"; a multi-selection means "move these".
  const previewIcon =
    selectedIds.length === 1
      ? openIcons.find((item) => item.id === selectedIds[0]) ?? null
      : null
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
  const drillInto = useCallback(
    (alcoveId: string, path: string) => {
      if (!isTauri()) return
      setSelectedIds([])
      invoke<HarvestedIcon[]>("list_folder_icons", { path })
        .then((harvested) => {
          setDrill({
            alcoveId,
            path,
            icons: harvested.map((item) => toDesktopIcon(item, alcoveId, null)),
          })
        })
        .catch(() => toast(`Could not open ${folderLeaf(path)}`))
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
      invoke("open_desktop_item", { path: icon.path }).catch(() => {
        toast(`Could not open ${icon.name}`)
      })
      return
    }
    toast(`Opened ${icon.name}`)
  }

  function openTool(tool: StripTool) {
    if (isTauri()) {
      invoke("open_desktop_item", { path: tool.launch, args: tool.args }).catch(() => {
        toast(`Could not open ${tool.label}`)
      })
      return
    }
    toast(`Opened ${tool.label}`)
  }

  function typingInField() {
    const el = document.activeElement
    if (!(el instanceof HTMLElement)) return false
    const tag = el.tagName
    return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable
  }

  function pasteHere() {
    const dest = openAlcove?.folderPath ?? null
    const assign = openAlcove && !openAlcove.isInbox ? openAlcove.id : null
    desktop.pasteFiles(dest, assign).catch((err) => {
      toast(err instanceof Error ? err.message : String(err))
    })
  }

  // Closing a drawer resets it to its own folder — the cursor is never saved.
  useEffect(() => {
    setDrill(null)
  }, [openAlcoveId])

  function removeIcons(icons: DesktopIcon[]) {
    desktop.deleteIcons(icons).catch((err) => {
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
      if (typingInField()) return
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
          setDrill(null)
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
  }, [desktop, drill, drillIcons, drillInto, openAlcove, selectedIds, state.icons])

  const applyDrop = useCallback(
    (icons: DesktopIcon[], target: IconDropTarget) => {
      const ids = icons.map((icon) => icon.id)
      if (target.kind === "group") {
        desktop.moveIconsToGroup(ids, target.alcoveId, target.groupId)
        setSelectedIds([])
        return
      }
      if (target.kind === "alcove") {
        const moving = icons.filter((icon) => icon.alcoveId !== target.id)
        if (moving.length > 0) {
          desktop.moveIcons(
            moving.map((icon) => icon.id),
            target.id,
          )
        }
        setSelectedIds([])
        return
      }
      if (target.kind === "pin") {
        desktop.pinIcons(ids)
        return
      }
      desktop.moveIcons(ids, INBOX_ID)
      setSelectedIds([])
    },
    [desktop],
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

  useEffect(() => {
    const channel = deskChannel()
    if (!channel) return
    function onMessage(event: MessageEvent<DeskChannelMessage>) {
      const data = event.data
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
  }, [desk.id, dropIconsAt, state.icons])

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
      <Wallpaper />
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
                          if (pin) desktop.pinIcons(ids)
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
                            setDrill(null)
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
                          if (pin) desktop.pinIcons(ids)
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
                            setDrill(null)
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
                    <PreviewCard icon={previewIcon} />
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
        onOpenIcon={openIcon}
      />
      <OnboardingDialog
        open={state.phase === "onboarding"}
        groups={desktop.suggestions}
        clutterCount={state.icons.length}
        onOrganize={desktop.organize}
        onStartEmpty={desktop.startEmpty}
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
        onSelect={(icon) => {
          desktop.revealIcon(icon.id)
          if (icon.alcoveId) setOpenAlcoveId(icon.alcoveId)
          setSelectedIds([icon.id])
          setSelectAnchorId(icon.id)
        }}
      />
    </div>
  )
})

function Wallpaper() {
  const [background, setBackground] = useState<{
    color: string
    imageUrl: string | null
  }>({ color: "#191919", imageUrl: null })

  useEffect(() => {
    if (!isTauri()) return
    invoke<{ color: string; imageUrl: string | null }>("desktop_background")
      .then((next) => {
        setBackground({
          color: next.color || "#191919",
          imageUrl: next.imageUrl,
        })
      })
      .catch(() => undefined)
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
      <div
        className="absolute inset-0 bg-center bg-no-repeat"
        style={{
          backgroundColor: background.color,
          backgroundImage: background.imageUrl
            ? `url("${background.imageUrl}")`
            : undefined,
          backgroundSize: background.imageUrl ? "cover" : undefined,
        }}
      />
    </div>
  )
}

function EmptyDesktopHint({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center p-6">
      <div className="pointer-events-auto max-w-sm rounded-2xl border border-white/15 bg-black/30 p-5 text-center backdrop-blur-xl">
        <p className="text-lg font-medium">A clear desktop</p>
        <p className="mt-1 text-sm text-white/70">
          Double-click the wallpaper to make an Alcove, or drop a sample file
          into Inbox.
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="mt-3 text-sm text-sky-200 underline-offset-4 hover:underline"
        >
          Create your first Alcove
        </button>
      </div>
    </div>
  )
}

function ScatteredPreview({ icons }: { icons: DesktopIcon[] }) {
  return (
    <div className="grid w-full grid-cols-3 gap-4 opacity-40 sm:grid-cols-6 md:grid-cols-8">
      {icons.slice(0, 24).map((icon) => (
        <div key={icon.id} className="flex flex-col items-center gap-1">
          <div className="size-12 rounded-xl bg-white/15" />
          <span className="line-clamp-1 w-full text-center text-[10px]">
            {icon.name}
          </span>
        </div>
      ))}
    </div>
  )
}
