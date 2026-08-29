import { useEffect, useState } from "react"
import { toast } from "sonner"
import { AlcoveCanvas } from "@/components/alcove-canvas"
import { AlcovePanel } from "@/components/alcove-panel"
import { CreateAlcoveDialog } from "@/components/create-alcove-dialog"
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
import { invoke, isTauri } from "@/lib/tauri"
import type { AlcoveColor, DesktopIcon } from "@/types"

type DesktopShellProps = {
  desktop: AlcoveDesktopApi
}

export function DesktopShell({ desktop }: DesktopShellProps) {
  const { state, sortedAlcoves, iconsIn } = desktop
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createWithIcon, setCreateWithIcon] = useState<DesktopIcon | null>(null)
  const [rename, setRename] = useState<
    | { kind: "alcove" | "icon"; id: string; value: string }
    | { kind: "group"; id: string; alcoveId: string; value: string }
    | null
  >(null)
  const [desktopAttached, setDesktopAttached] = useState<boolean | null>(null)
  const [openAlcoveId, setOpenAlcoveId] = useState<string | null>(null)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const meta = event.ctrlKey || event.metaKey
      if (meta && event.key.toLowerCase() === "f") {
        event.preventDefault()
        setSearchOpen(true)
      }
      if (meta && event.shiftKey && event.key.toLowerCase() === "h") {
        event.preventDefault()
        desktop.collapseAll()
        setOpenAlcoveId(null)
      }
      if (meta && event.key.toLowerCase() === "n") {
        event.preventDefault()
        setCreateOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [desktop])

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

  return (
    <div className="relative flex h-svh min-h-0 flex-col overflow-hidden text-white">
      <Wallpaper />
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <main
            className="relative flex min-h-0 flex-1 flex-col"
            onDoubleClick={(event) => {
              if (event.target === event.currentTarget) setCreateOpen(true)
            }}
          >
            {emptyDesktop ? (
              <EmptyDesktopHint onCreate={() => setCreateOpen(true)} />
            ) : null}
            {state.phase === "ready" ? (
              <FrequentStrip
                icons={desktop.topIcons}
                keepIds={state.topKeep}
                onOpen={openIcon}
                onToggleKeep={desktop.toggleTopKeep}
                onHide={desktop.hideFromTop}
                onReveal={(iconId) => {
                  desktop.revealIcon(iconId)
                  const icon = state.icons.find((item) => item.id === iconId)
                  if (icon?.alcoveId) setOpenAlcoveId(icon.alcoveId)
                }}
              />
            ) : null}
            <div
              className="relative z-10 flex min-h-0 flex-1 gap-4 p-4 pb-2 md:p-6"
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) setOpenAlcoveId(null)
              }}
              onDoubleClick={(event) => {
                if (event.target === event.currentTarget) setCreateOpen(true)
              }}
            >
              {state.phase === "onboarding" ? (
                <ScatteredPreview icons={state.icons} />
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
                    }}
                    onSearch={() => setSearchOpen(true)}
                    onNewAlcove={() => setCreateOpen(true)}
                    onSettings={() => setSettingsOpen(true)}
                    onRename={(alcove) =>
                      setRename({
                        kind: "alcove",
                        id: alcove.id,
                        value: alcove.name,
                      })
                    }
                    onRecolor={desktop.recolorAlcove}
                    onSetGlyph={desktop.setAlcoveGlyph}
                    onDelete={(alcoveId) => {
                      desktop.deleteAlcove(alcoveId)
                      if (openAlcoveId === alcoveId) setOpenAlcoveId(null)
                    }}
                  />
                  <div
                    className={
                      openView === "canvas"
                        ? "flex min-h-0 flex-1"
                        : "flex min-h-0 flex-1 items-start overflow-auto"
                    }
                    onPointerDown={(event) => {
                      if (event.target === event.currentTarget) setOpenAlcoveId(null)
                    }}
                    onDoubleClick={(event) => {
                      if (event.target === event.currentTarget) setCreateOpen(true)
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
                        onRename={() =>
                          setRename({
                            kind: "alcove",
                            id: openAlcove.id,
                            value: openAlcove.name,
                          })
                        }
                        onRecolor={(color) => desktop.recolorAlcove(openAlcove.id, color)}
                        onSetGlyph={(glyph) => desktop.setAlcoveGlyph(openAlcove.id, glyph)}
                        onOpenIcon={openIcon}
                        onRenameIcon={(icon) =>
                          setRename({ kind: "icon", id: icon.id, value: icon.name })
                        }
                        onTogglePin={desktop.togglePin}
                        onMoveIcon={desktop.moveIcon}
                        onNewAlcoveWith={(icon) => {
                          setCreateWithIcon(icon)
                          setCreateOpen(true)
                        }}
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
                        onRename={() =>
                          setRename({
                            kind: "alcove",
                            id: openAlcove.id,
                            value: openAlcove.name,
                          })
                        }
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
                        onNewAlcoveWith={(icon) => {
                          setCreateWithIcon(icon)
                          setCreateOpen(true)
                        }}
                        onFocus={() => desktop.setFocusedAlcove(openAlcove.id)}
                        onDropIncoming={
                          openAlcove.isInbox ? desktop.dropIncomingFile : undefined
                        }
                        onIconPointerDown={onPointerDown}
                      />
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </main>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => setCreateOpen(true)}>
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
      <CreateAlcoveDialog
        open={createOpen}
        seedName={createWithIcon ? createWithIcon.name.replace(/\.[^.]+$/, "") : ""}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) setCreateWithIcon(null)
        }}
        onCreate={(name, color: AlcoveColor, glyph) => {
          desktop.createAlcove(
            name,
            color,
            createWithIcon ? [createWithIcon.id] : [],
            glyph,
          )
        }}
      />
      <RenameDialog
        open={rename !== null}
        title={
          rename?.kind === "icon"
            ? "Rename icon"
            : rename?.kind === "group"
              ? "Name this group"
              : "Rename Alcove"
        }
        value={rename?.value ?? ""}
        onOpenChange={(open) => {
          if (!open) setRename(null)
        }}
        onSave={(value) => {
          if (!rename) return
          if (rename.kind === "alcove") desktop.renameAlcove(rename.id, value)
          else if (rename.kind === "group")
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
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        layoutId={state.layoutId}
        density={state.density}
        focusMode={state.focusMode}
        desktopAttached={desktopAttached}
        onLayout={desktop.setLayout}
        onDensity={desktop.setDensity}
        onFocusMode={desktop.setFocusMode}
        onCollapseAll={() => {
          desktop.collapseAll()
          setOpenAlcoveId(null)
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
