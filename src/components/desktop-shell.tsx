import { useEffect, useState } from "react"
import { toast } from "sonner"
import { AlcovePanel } from "@/components/alcove-panel"
import { CreateAlcoveDialog } from "@/components/create-alcove-dialog"
import { IconGlyph } from "@/components/icon-glyph"
import { OnboardingDialog } from "@/components/onboarding-dialog"
import { PinRail } from "@/components/pin-rail"
import { RenameDialog } from "@/components/rename-dialog"
import { SearchSpotlight } from "@/components/search-spotlight"
import { Taskbar } from "@/components/taskbar"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { INBOX_ID } from "@/data/sample"
import { DENSITY_CONFIG } from "@/lib/density"
import { cn } from "@/lib/utils"
import type { AlcoveDesktopApi } from "@/hooks/use-alcove-desktop"
import { useIconPointerDrag } from "@/hooks/use-icon-pointer-drag"
import type { AlcoveColor, DesktopIcon } from "@/types"

type DesktopShellProps = {
  desktop: AlcoveDesktopApi
}

export function DesktopShell({ desktop }: DesktopShellProps) {
  const { state, sortedAlcoves, iconsIn } = desktop
  const [searchOpen, setSearchOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createWithIcon, setCreateWithIcon] = useState<DesktopIcon | null>(null)
  const [rename, setRename] = useState<
    { kind: "alcove" | "icon"; id: string; value: string } | null
  >(null)

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
      }
      if (meta && event.key.toLowerCase() === "n") {
        event.preventDefault()
        setCreateOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [desktop])

  const onlyInbox = sortedAlcoves.length === 1 && sortedAlcoves[0]?.isInbox
  const noIcons = state.icons.length === 0
  const emptyDesktop = state.phase === "ready" && onlyInbox && noIcons
  const width = DENSITY_CONFIG[state.density].panel

  function openIcon(icon: DesktopIcon) {
    toast(`Opened ${icon.name}`)
  }

  const { drag, onPointerDown } = useIconPointerDrag((icon, target) => {
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
            <div
              className={cn(
                "relative z-10 flex min-h-0 flex-1 flex-wrap content-start gap-4 overflow-auto p-4 pb-2 md:p-6",
                state.layoutId === "clean" ? "justify-end" : "justify-start",
              )}
              onDoubleClick={(event) => {
                if (event.target === event.currentTarget) setCreateOpen(true)
              }}
              style={{ ["--alcove-width" as string]: `${width}px` }}
            >
              {state.phase === "onboarding" ? (
                <ScatteredPreview icons={state.icons} />
              ) : (
                sortedAlcoves.map((alcove) => (
                  <AlcovePanel
                    key={alcove.id}
                    alcove={alcove}
                    icons={iconsIn(alcove.id)}
                    allAlcoves={sortedAlcoves}
                    pinIds={state.pinIds}
                    density={state.density}
                    highlightedIconId={state.highlightedIconId}
                    dimmed={
                      state.focusMode &&
                      state.focusedAlcoveId !== null &&
                      state.focusedAlcoveId !== alcove.id
                    }
                    onToggle={() => desktop.toggleCollapsed(alcove.id)}
                    onPage={(page) => desktop.setAlcovePage(alcove.id, page)}
                    onRename={() =>
                      setRename({ kind: "alcove", id: alcove.id, value: alcove.name })
                    }
                    onRecolor={(color) => desktop.recolorAlcove(alcove.id, color)}
                    onDelete={() => desktop.deleteAlcove(alcove.id)}
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
                    onFocus={() => desktop.setFocusedAlcove(alcove.id)}
                    onDropIncoming={
                      alcove.isInbox ? desktop.dropIncomingFile : undefined
                    }
                    onIconPointerDown={onPointerDown}
                    draggingIconId={drag?.icon.id ?? null}
                  />
                ))
              )}
            </div>
            <div className="relative z-10 px-4 pb-2 md:px-6">
              <PinRail
                icons={desktop.pinnedIcons}
                onOpen={openIcon}
              />
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
      <Taskbar
        layoutId={state.layoutId}
        density={state.density}
        focusMode={state.focusMode}
        inboxCount={desktop.inboxCount}
        onLayout={desktop.setLayout}
        onDensity={desktop.setDensity}
        onFocusMode={desktop.setFocusMode}
        onCollapseAll={desktop.collapseAll}
        onSearch={() => setSearchOpen(true)}
        onNewAlcove={() => setCreateOpen(true)}
        onDropIncoming={desktop.dropIncomingFile}
        onLoadSample={desktop.loadSample}
        onStartEmpty={desktop.startEmpty}
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
        onCreate={(name, color: AlcoveColor) => {
          desktop.createAlcove(
            name,
            color,
            createWithIcon ? [createWithIcon.id] : [],
          )
        }}
      />
      <RenameDialog
        open={rename !== null}
        title={rename?.kind === "icon" ? "Rename icon" : "Rename Alcove"}
        value={rename?.value ?? ""}
        onOpenChange={(open) => {
          if (!open) setRename(null)
        }}
        onSave={(value) => {
          if (!rename) return
          if (rename.kind === "alcove") desktop.renameAlcove(rename.id, value)
          else desktop.renameIcon(rename.id, value)
        }}
      />
      <SearchSpotlight
        open={searchOpen}
        onOpenChange={setSearchOpen}
        icons={state.icons}
        alcoves={sortedAlcoves}
        onSelect={(icon) => desktop.revealIcon(icon.id)}
      />
      {drag ? (
        <div
          data-drag-ghost=""
          className="pointer-events-none fixed z-[200] -translate-x-1/2 -translate-y-1/2 drop-shadow-2xl"
          style={{ left: drag.x, top: drag.y }}
        >
          <IconGlyph icon={drag.icon} size={48} />
        </div>
      ) : null}
    </div>
  )
}

function Wallpaper() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
      <div className="absolute inset-0 bg-[#0b1220]" />
      <div className="absolute -top-24 left-[-10%] h-[55%] w-[55%] rounded-full bg-sky-500/35 blur-3xl" />
      <div className="absolute top-[-10%] right-[-8%] h-[50%] w-[50%] rounded-full bg-violet-500/30 blur-3xl" />
      <div className="absolute bottom-[-20%] left-[20%] h-[55%] w-[60%] rounded-full bg-cyan-600/25 blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.35)_100%)]" />
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
