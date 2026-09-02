import { useCallback, useEffect, useMemo, useState } from "react"
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react"
import { defaultFilter, useCommandState } from "cmdk"
import { IconGlyph } from "@/components/icon-glyph"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { rankLaunch, scoreAt, type Frecency } from "@/lib/frecency"
import { fileTypeLabel, formatByteSize } from "@/lib/folder-view"
import { toDesktopIcon, type HarvestedIcon } from "@/lib/harvest-merge"
import { homeOrder, launcherHome } from "@/lib/launcher"
import {
  commandTerm,
  DEEP_LIMIT,
  DEEP_MIN_QUERY,
  deepRoots,
  fallbacks,
  newDeepHits,
  paletteFor,
  parentFolder,
  shortWhen,
  type Fallback,
  type PaletteEntry,
} from "@/lib/search-hits"
import type { DeskCommand } from "@/lib/desk-strip"
import { invoke, isTauri } from "@/lib/tauri"
import { cn } from "@/lib/utils"
import type { Alcove, DesktopIcon, RunningApp } from "@/types"
import { AppWindow, ChevronRight, Search } from "lucide-react"

/**
 * What the user chose. One callback instead of eight, because every caller has
 * to handle every case anyway and a union says so out loud.
 *
 * `how` carries the modifier: plain Enter opens, Ctrl+Enter shows the file in
 * Explorer, Shift+Enter opens the folder around it.
 */
export type LauncherPick =
  | { kind: "icon"; icon: DesktopIcon; how: "open" | "reveal" | "folder" }
  | { kind: "window"; app: RunningApp }
  | { kind: "alcove"; alcove: Alcove }
  | { kind: "command"; command: DeskCommand }
  | { kind: "target"; target: string }

type LauncherProps = {
  icons: DesktopIcon[]
  alcoves: Alcove[]
  frecency?: Frecency
  hide?: string[]
  /**
   * What Enter does to a file here. The standalone launcher opens it; Ctrl+F
   * inside Alcove finds it on the desktop instead, and the footer has to say so.
   */
  openLabel?: string
  /**
   * False while the launcher is out of sight. The standalone window is torn
   * down between showings, but the in-app dialog is not — without this it would
   * come back holding last time's query and a stale list of windows.
   */
  open?: boolean
  onPick: (pick: LauncherPick) => void
}

const NO_FRECENCY: Frecency = {}
const NO_HIDE: string[] = []

/** Enough to switch between windows; past this the list stops being a shortcut. */
const RUNNING_CAP = 24

function alcoveName(alcoves: Alcove[], id: string | null) {
  return alcoves.find((alcove) => alcove.id === id)?.name ?? "Unplaced"
}

/**
 * cmdk identifies a row by its `value` and lowercases it, so these carry an id
 * rather than a label. Two rows with the same name used to collide, which meant
 * they shared a frecency boost and could not be told apart by the Enter
 * modifiers; a path or a window handle is unique.
 */
function iconKey(icon: DesktopIcon) {
  return `i:${icon.id}`.toLowerCase()
}

type Searchable = { text: string; score: number }

/**
 * Everything the launcher can offer, in the two shapes it needs: a lookup from
 * cmdk's row id back to the thing itself, and the text plus frecency each row
 * is ranked by.
 *
 * Built above `<Command>` because the filter is a prop on it — cmdk asks the
 * question before any of these rows exist.
 */
function useLauncher({
  icons,
  alcoves,
  frecency = NO_FRECENCY,
  hide = NO_HIDE,
  openLabel = "open",
  open = true,
  onPick,
}: LauncherProps) {
  const [query, setQuery] = useState("")
  const [running, setRunning] = useState<RunningApp[]>([])
  const [deep, setDeep] = useState<DesktopIcon[]>([])

  const term = query.trim()
  const palette = commandTerm(query)

  // Every showing starts clean, and with a window list from this second — an
  // older one offers to switch you to windows that have since closed.
  useEffect(() => {
    if (!open) return
    setQuery("")
    if (!isTauri()) return
    let alive = true
    invoke<RunningApp[]>("list_running_windows")
      .then((list) => {
        if (alive) setRunning(list.slice(0, RUNNING_CAP))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [open])

  const roots = useMemo(() => deepRoots(alcoves), [alcoves])
  const rootKey = roots.join("|")

  /**
   * A drawer lists the 400 newest files in its folder and nothing below it, so
   * everything older or one folder down is invisible to a plain match. This
   * walks for it. Debounced, because it touches the disk on every keystroke.
   */
  useEffect(() => {
    if (palette !== null || term.length < DEEP_MIN_QUERY || !rootKey || !isTauri()) {
      setDeep([])
      return
    }
    let alive = true
    const timer = window.setTimeout(() => {
      invoke<HarvestedIcon[]>("search_folders", {
        roots: rootKey.split("|"),
        query: term,
        limit: DEEP_LIMIT,
      })
        .then((list) => {
          if (alive) setDeep(list.map((item) => toDesktopIcon(item, null)))
        })
        .catch(() => undefined)
    }, 180)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [term, palette, rootKey])

  const deepIcons = useMemo(
    () => (palette === null ? newDeepHits(icons, deep) : []),
    [icons, deep, palette],
  )

  const { rows, searchable } = useMemo(() => {
    const now = Date.now()
    const rows = new Map<string, LauncherPick>()
    const searchable = new Map<string, Searchable>()
    for (const icon of icons) {
      const key = iconKey(icon)
      rows.set(key, { kind: "icon", icon, how: "open" })
      searchable.set(key, {
        text: `${icon.name} ${alcoveName(alcoves, icon.alcoveId)}`,
        score: scoreAt(frecency[icon.id], now),
      })
    }
    for (const icon of deepIcons) {
      const key = iconKey(icon)
      rows.set(key, { kind: "icon", icon, how: "open" })
      searchable.set(key, {
        text: `${icon.name} ${parentFolder(icon.path)}`,
        score: scoreAt(frecency[icon.id], now),
      })
    }
    for (const app of running) {
      const key = `w:${app.hwnd}`
      rows.set(key, { kind: "window", app })
      // The exe name is what people type — "code", not "index.ts — alcove".
      searchable.set(key, { text: `${app.title} ${exeName(app.exePath)}`, score: 0 })
    }
    for (const alcove of alcoves) {
      const key = `a:${alcove.id}`.toLowerCase()
      rows.set(key, { kind: "alcove", alcove })
      searchable.set(key, { text: `${alcove.name} drawer`, score: 0 })
    }
    return { rows, searchable }
  }, [icons, deepIcons, running, alcoves, frecency])

  const filter = useCallback(
    (value: string, search: string, keywords?: string[]) => {
      const entry = searchable.get(value)
      // Palette and fallback rows are force-mounted, so cmdk never asks about
      // them. Anything else it does not recognise is a stale row.
      if (!entry) return 0
      return rankLaunch(defaultFilter(entry.text, search, keywords), entry.score)
    },
    [searchable],
  )

  const home = useMemo(
    () => launcherHome(icons, frecency, hide, Date.now()),
    [icons, frecency, hide],
  )

  return {
    query,
    setQuery,
    term,
    palette,
    filter,
    rows,
    icons,
    deepIcons,
    running,
    alcoves,
    home,
    openLabel,
    onPick,
  }
}

type Launcher = ReturnType<typeof useLauncher>

function exeName(path: string) {
  return path.split(/[\\/]/).pop()?.replace(/\.exe$/i, "") ?? ""
}

/** Type, size and time — what tells five files called `pexels-…` apart. */
function IconMeta({ icon, now }: { icon: DesktopIcon; now: number }) {
  const parts = [fileTypeLabel(icon)]
  if (icon.kind !== "folder" && typeof icon.byteSize === "number")
    parts.push(formatByteSize(icon.byteSize))
  const when = shortWhen(icon.modifiedAt, now)
  if (when) parts.push(when)
  return <span className="truncate text-micro text-ink-muted">{parts.join(" · ")}</span>
}

function Row({
  value,
  onSelect,
  art,
  title,
  meta,
  trailing,
  badge,
}: {
  value: string
  onSelect: () => void
  art: ReactNode
  title: string
  meta?: React.ReactNode
  trailing?: string
  badge?: number
}) {
  return (
    <CommandItem value={value} onSelect={onSelect}>
      {art}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{title}</span>
        {meta}
      </span>
      {badge ? (
        <kbd className="rounded border border-hairline bg-surface-3 px-1 font-sans text-micro leading-4 text-ink-muted">
          {badge}
        </kbd>
      ) : null}
      {trailing ? (
        <span className="shrink-0 text-xs text-muted-foreground">{trailing}</span>
      ) : null}
    </CommandItem>
  )
}

function IconRow({
  icon,
  trailing,
  badge,
  now,
  onPick,
}: {
  icon: DesktopIcon
  trailing: string
  badge?: number
  now: number
  onPick: (pick: LauncherPick) => void
}) {
  return (
    <Row
      value={iconKey(icon)}
      onSelect={() => onPick({ kind: "icon", icon, how: "open" })}
      art={<IconGlyph icon={icon} size={22} className="rounded-md" />}
      title={icon.name}
      meta={<IconMeta icon={icon} now={now} />}
      trailing={trailing}
      badge={badge}
    />
  )
}

/**
 * The rows themselves. Split from the hook above only because `useCommandState`
 * has to run inside `<Command>`, and the filter has to be handed to it.
 */
function LauncherList(launcher: Launcher) {
  const {
    query,
    setQuery,
    term,
    palette,
    rows,
    icons,
    deepIcons,
    running,
    alcoves,
    home,
    openLabel,
    onPick,
  } = launcher
  const now = Date.now()
  const numbered = useMemo(() => homeOrder(home), [home])
  const idle = palette === null && term === ""
  const selected = useCommandState((state) => state.value)
  const matches = useCommandState((state) => state.filtered.count)

  useEffect(() => {
    if (!idle) return
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.altKey || event.metaKey) return
      const slot = Number(event.key)
      // Only while the box is empty, so typing "1" into a search stays typing.
      if (!Number.isInteger(slot) || slot < 1 || slot > numbered.length) return
      event.preventDefault()
      onPick({ kind: "icon", icon: numbered[slot - 1]!, how: "open" })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [idle, numbered, onPick])

  /**
   * Enter with a modifier never reaches cmdk. Caught on the input rather than
   * the list because that is where the caret is, and stopping it there is what
   * keeps cmdk from opening the file underneath.
   */
  function onInputKey(event: ReactKeyboardEvent<HTMLInputElement>) {
    // Escape backs out of the palette before it closes the launcher, so getting
    // into command mode by accident costs one key rather than the whole search.
    if (event.key === "Escape" && palette !== null) {
      event.preventDefault()
      event.stopPropagation()
      setQuery("")
      return
    }
    if (event.key !== "Enter") return
    const how = event.ctrlKey || event.metaKey ? "reveal" : event.shiftKey ? "folder" : null
    if (!how || !selected) return
    const pick = rows.get(selected)
    if (pick?.kind !== "icon" || !pick.icon.path) return
    event.preventDefault()
    event.stopPropagation()
    onPick({ ...pick, how })
  }

  // Only after everything real has been ruled out, and never in command mode —
  // there the empty list means "no such command", not "try the web".
  const spare: Fallback[] = palette === null && term && matches === 0 ? fallbacks(term) : []

  return (
    <>
      <CommandInput
        placeholder="Search icons, windows and drawers…  or type > for commands"
        autoFocus
        value={query}
        onValueChange={setQuery}
        onKeyDown={onInputKey}
      />
      <CommandList className="max-h-none min-h-0 flex-1">
        {palette !== null ? (
          <PaletteRows term={palette} onPick={onPick} />
        ) : idle ? (
          <>
            {home.today.length === 0 && home.frequent.length === 0 ? (
              <CommandEmpty>Start typing to find anything on your desktop.</CommandEmpty>
            ) : null}
            {home.today.length > 0 ? (
              <CommandGroup heading="Today">
                {home.today.map((icon, index) => (
                  <IconRow
                    key={icon.id}
                    icon={icon}
                    trailing={alcoveName(alcoves, icon.alcoveId)}
                    badge={index + 1}
                    now={now}
                    onPick={onPick}
                  />
                ))}
              </CommandGroup>
            ) : null}
            {home.frequent.length > 0 ? (
              <CommandGroup heading="Frequent">
                {home.frequent.map((icon, index) => (
                  <IconRow
                    key={icon.id}
                    icon={icon}
                    trailing={alcoveName(alcoves, icon.alcoveId)}
                    badge={home.today.length + index + 1}
                    now={now}
                    onPick={onPick}
                  />
                ))}
              </CommandGroup>
            ) : null}
          </>
        ) : (
          <>
            {spare.length === 0 ? <CommandEmpty>Nothing matches that.</CommandEmpty> : null}
            {running.length > 0 ? (
              <CommandGroup heading="Running">
                {running.map((app) => (
                  <Row
                    key={app.hwnd}
                    value={`w:${app.hwnd}`}
                    onSelect={() => onPick({ kind: "window", app })}
                    art={
                      app.iconUrl ? (
                        <img src={app.iconUrl} alt="" className="size-[22px] rounded-md" />
                      ) : (
                        <AppWindow className="size-[22px] text-ink-muted" />
                      )
                    }
                    title={app.title}
                    meta={
                      <span className="truncate text-micro text-ink-muted">
                        {exeName(app.exePath)}
                        {app.foreground ? " · in front" : ""}
                      </span>
                    }
                    trailing="Switch"
                  />
                ))}
              </CommandGroup>
            ) : null}
            <CommandGroup heading="Icons">
              {icons.map((icon) => (
                <IconRow
                  key={icon.id}
                  icon={icon}
                  trailing={alcoveName(alcoves, icon.alcoveId)}
                  now={now}
                  onPick={onPick}
                />
              ))}
            </CommandGroup>
            {deepIcons.length > 0 ? (
              <CommandGroup heading="Deeper in your folders">
                {deepIcons.map((icon) => (
                  <IconRow
                    key={icon.id}
                    icon={icon}
                    trailing={parentFolder(icon.path)}
                    now={now}
                    onPick={onPick}
                  />
                ))}
              </CommandGroup>
            ) : null}
            <CommandGroup heading="Drawers">
              {alcoves.map((alcove) => (
                <Row
                  key={alcove.id}
                  value={`a:${alcove.id}`}
                  onSelect={() => onPick({ kind: "alcove", alcove })}
                  art={<ChevronRight className="size-[22px] text-ink-muted" />}
                  title={alcove.name}
                  trailing="Open drawer"
                />
              ))}
            </CommandGroup>
            {spare.length > 0 ? (
              <CommandGroup heading="No match — but this would work" forceMount>
                {spare.map((item) => (
                  <Row
                    key={item.id}
                    value={`f:${item.id}`}
                    onSelect={() => onPick({ kind: "target", target: item.target })}
                    art={<Search className="size-[22px] text-ink-muted" />}
                    title={item.label}
                    trailing={item.hint}
                  />
                ))}
              </CommandGroup>
            ) : null}
          </>
        )}
      </CommandList>
      <Footer openLabel={palette === null ? openLabel : "run"} commands={palette !== null} />
    </>
  )
}

function PaletteRows({
  term,
  onPick,
}: {
  term: string
  onPick: (pick: LauncherPick) => void
}) {
  const entries: PaletteEntry[] = paletteFor(term)
  if (entries.length === 0)
    return <CommandEmpty>No command by that name.</CommandEmpty>
  return (
    <CommandGroup heading="Commands" forceMount>
      {entries.map((entry) => (
        <Row
          key={entry.command}
          value={`c:${entry.command}`}
          onSelect={() => onPick({ kind: "command", command: entry.command })}
          art={
            <ChevronRight
              className={cn("size-[22px] text-ink-muted", entry.danger && "text-destructive")}
            />
          }
          title={entry.label}
          trailing={entry.hint}
        />
      ))}
    </CommandGroup>
  )
}

/** The two things nobody discovers on their own: the modifiers and the `>`. */
function Footer({ openLabel, commands }: { openLabel: string; commands: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-hairline px-3 py-1.5 text-micro text-ink-muted">
      <span>
        <kbd className="font-sans">↵</kbd> {openLabel}
      </span>
      {/* Nothing in the palette is a file, so the file modifiers are not offered. */}
      {commands ? null : (
        <>
          <span>
            <kbd className="font-sans">Ctrl+↵</kbd> show in Explorer
          </span>
          <span>
            <kbd className="font-sans">Shift+↵</kbd> its folder
          </span>
        </>
      )}
      <span className="ml-auto">
        {commands ? (
          <>
            <kbd className="font-sans">Esc</kbd> back to search
          </>
        ) : (
          <>
            <kbd className="font-sans">&gt;</kbd> commands
          </>
        )}
      </span>
    </div>
  )
}

export function SearchSpotlight({
  open,
  onOpenChange,
  ...props
}: LauncherProps & {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const launcher = useLauncher({
    ...props,
    open,
    onPick: (pick) => {
      props.onPick(pick)
      onOpenChange(false)
    },
  })
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      filter={launcher.filter}
      title="Find on this desktop"
      description="Search icons, windows and drawers across every Alcove"
    >
      <LauncherList {...launcher} />
    </CommandDialog>
  )
}

export function SearchOverlayCard(props: LauncherProps) {
  const launcher = useLauncher(props)
  return (
    <Command filter={launcher.filter} className="h-full max-h-none rounded-none!">
      <LauncherList {...launcher} />
    </Command>
  )
}
