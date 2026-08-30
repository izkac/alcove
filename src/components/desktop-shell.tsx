import { memo, useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { AlcoveCanvas } from "@/components/alcove-canvas"
import { AlcovePanel } from "@/components/alcove-panel"
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
import { useIconPointerDrag } from "@/hooks/use-icon-pointer-drag"
import { viewFor } from "@/lib/alcove-view"
import { DEFAULT_STRIP_TOOL_IDS, toolsForIds, type StripTool } from "@/lib/strip-tools"
import { invoke, isTauri } from "@/lib/tauri"
import type { Alcove, AlcoveColor, DesktopIcon } from "@/types"

type DesktopShellProps = {
  desktop: AlcoveDesktopApi
}

export function DesktopShell({ desktop }: DesktopShellProps) {
  const { state } = desktop
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [createWithIcon, setCreateWithIcon] = useState<DesktopIcon | null>(null)
  const [editAlcove, setEditAlcove] = useState<Alcove | null>(null)
  const [desktopAttached, setDesktopAttached] = useState<boolean | null>(null)
  const closeDrawerRef = useRef<() => void>(() => undefined)

  const onOpenSettings = useCallback(() => setSettingsOpen(true), [])
  const onOpenCreate = useCallback((icon?: DesktopIcon | null) => {
    setEditAlcove(null)
    setCreateWithIcon(icon ?? null)
    setDialogOpen(true)
  }, [])
  const onOpenEdit = useCallback((alcove: Alcove) => {
    setCreateWithIcon(null)
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
        seedName={createWithIcon ? createWithIcon.name.replace(/\.[^.]+$/, "") : ""}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setCreateWithIcon(null)
        }}
        onCreate={(name, color: AlcoveColor, glyph, folderPath) => {
          desktop.createAlcove(
            name,
            color,
            folderPath ? [] : createWithIcon ? [createWithIcon.id] : [],
            glyph,
            folderPath,
          )
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
  onOpenCreate: (icon?: DesktopIcon | null) => void
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [rename, setRename] = useState<
    | { kind: "icon"; id: string; value: string }
    | { kind: "group"; id: string; alcoveId: string; value: string }
    | null
  >(null)
  const [openAlcoveId, setOpenAlcoveId] = useState<string | null>(null)

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
    closeDrawerRef.current = () => setOpenAlcoveId(null)
  })

  const onlyInbox = sortedAlcoves.length === 1 && sortedAlcoves[0]?.isInbox
  const noIcons = state.icons.length === 0
  const emptyDesktop = state.phase === "ready" && onlyInbox && noIcons
  const openAlcove = openAlcoveId
    ? sortedAlcoves.find((alcove) => alcove.id === openAlcoveId) ?? null
    : null
  const openIcons = openAlcove ? iconsIn(openAlcove.id) : []
  const openView = openAlcove ? viewFor(openAlcove, openIcons.length) : "panel"

  function openIcon(icon: DesktopIcon) {
    desktop.noteOpen(icon.id)
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

  const { onPointerDown } = useIconPointerDrag((icon, target) => {
    if (target.kind === "group") {
      desktop.moveIconToGroup(icon.id, target.alcoveId, target.groupId)
      return
    }
    if (target.kind === "alcove") {
      if (icon.alcoveId !== target.id) desktop.moveIcon(icon.id, target.id)
      return
    }
    if (target.kind === "pin") {
      if (!state.pinIds.includes(icon.id)) desktop.togglePin(icon.id)
      return
    }
    desktop.moveIcon(icon.id, INBOX_ID)
  })

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
                    alcoves={sortedAlcoves}
                    countFor={(alcoveId) => iconsIn(alcoveId).length}
                    openAlcoveId={openAlcoveId}
                    onSelect={(alcoveId) => {
                      setOpenAlcoveId((current) =>
                        current === alcoveId ? null : alcoveId,
                      )
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
                      if (event.target === event.currentTarget) setOpenAlcoveId(null)
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
                        onClose={() => setOpenAlcoveId(null)}
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
                        onTogglePin={desktop.togglePin}
                        onMoveIcon={desktop.moveIcon}
                        onNewAlcoveWith={(icon) => onOpenCreate(icon)}
                        onIconPointerDown={onPointerDown}
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
                        onMoveIconToGroup={(iconId, groupId) =>
                          desktop.moveIconToGroup(iconId, openAlcove.id, groupId)
                        }
                        onFolderView={(view) =>
                          desktop.setFolderView(openAlcove.id, view)
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
                        onToggle={() => setOpenAlcoveId(null)}
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
                        onTogglePin={desktop.togglePin}
                        onMoveIcon={desktop.moveIcon}
                        onNewAlcoveWith={(icon) => onOpenCreate(icon)}
                        onFocus={() => desktop.setFocusedAlcove(openAlcove.id)}
                        onDropIncoming={
                          openAlcove.isInbox ? desktop.dropIncomingFile : undefined
                        }
                        onIconPointerDown={onPointerDown}
                        onFolderView={(view) =>
                          desktop.setFolderView(openAlcove.id, view)
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
          <ContextMenuItem onSelect={() => onOpenCreate()}>
            New Alcove
          </ContextMenuItem>
          <ContextMenuItem onSelect={desktop.collapseAll}>Collapse all</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={desktop.dropIncomingFile}>
            Drop a new file
          </ContextMenuItem>
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
