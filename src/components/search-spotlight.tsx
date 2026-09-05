import { useEffect, useMemo, useState } from "react"
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react"
import { defaultFilter } from "cmdk"
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
  couldMatch,
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

// Shared by launcher mounts in this webview; native cancellation is scoped by window.
let searchGeneration = 0
let searchSession: Promise<number> | undefined

function getSearchSession() {
  searchSession ??= invoke<number>("start_search_session").catch((error) => {
    searchSession = undefined
    throw error
  })
  return searchSession
}

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

/**
 * Rows past this stop being a shortcut and start being a scroll. It is also the
 * whole performance story: cmdk mounts every row it is given and re-scores it on
 * every keystroke, so handing it a thousand icons made typing crawl.
 */
const MATCH_CAP = 50

/**
 * A row with its match text already built. Both fields used to be recomputed for
 * every icon on every keystroke; doing it once per list is the difference
 * between two string allocations per icon per key and none.
 *
 * `lower` is for the cheap reject and `text` keeps its capitals, because
 * command-score reads a camelCase hump as a word boundary and lowercasing first
 * would quietly cost "GitHubDesktop" its match on "ghd".
 */
type Entry<T> = { item: T; text: string; lower: string; score: number }

function entries<T>(
  items: readonly T[],
  text: (item: T) => string,
  score: (item: T) => number,
): Entry<T>[] {
  return items.map((item) => {
    const value = text(item)
    return { item, text: value, lower: value.toLowerCase(), score: score(item) }
  })
}

function rank<T>(list: readonly Entry<T>[], search: string, cap: number): T[] {
  if (!search) return list.slice(0, cap).map((entry) => entry.item)
  const hits: { item: T; rank: number }[] = []
  for (const entry of list) {
    if (!couldMatch(entry.lower, search)) continue
    const rank = rankLaunch(defaultFilter(entry.text, search), entry.score)
    if (rank > 0) hits.push({ item: entry.item, rank })
  }
  hits.sort((a, b) => b.rank - a.rank)
  return hits.slice(0, cap).map((hit) => hit.item)
}

/**
 * Everything the launcher can offer: a lookup from cmdk's row id back to the
 * thing itself, plus the ranked rows to mount.
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
    if (!open || palette !== null || term.length < DEEP_MIN_QUERY || !rootKey || !isTauri()) {
      setDeep([])
      return
    }
    let alive = true
    const generation = ++searchGeneration
    let started = false
    let session: number | undefined
    const timer = window.setTimeout(() => {
      void getSearchSession().then((id) => {
        if (!alive) return []
        session = id
        started = true
        return invoke<HarvestedIcon[]>("search_folders", {
          roots: rootKey.split("|"),
          query: term,
          limit: DEEP_LIMIT,
          session,
          generation,
        })
      })
        .then((list) => {
          if (alive) setDeep(list.map((item) => toDesktopIcon(item, null)))
        })
        .catch(() => undefined)
      // Long enough that a typed word costs one walk rather than five.
    }, 300)
    const cancel = () => {
      alive = false
      window.clearTimeout(timer)
      if (started) void invoke("cancel_search", { session, generation }).catch(() => undefined)
    }
    window.addEventListener("blur", cancel)
    return () => {
      cancel()
      window.removeEventListener("blur", cancel)
    }
  }, [term, palette, rootKey, open])

  const deepIcons = useMemo(
    () => (palette === null ? newDeepHits(icons, deep) : []),
    [icons, deep, palette],
  )

  /**
   * The match text, built once per list rather than once per keystroke. The
   * frecency scores are folded in here too: they decay over a fortnight, so
   * pinning them to the moment the list was built costs nothing.
   */
  const index = useMemo(() => {
    const now = Date.now()
    const iconScore = (icon: DesktopIcon) => scoreAt(frecency[icon.id], now)
    // A drawer name per icon, without a linear scan of the drawers per icon.
    const drawer = new Map(alcoves.map((alcove) => [alcove.id, alcove.name]))
    return {
      icons: entries(
        icons,
        (icon) => `${icon.name} ${drawer.get(icon.alcoveId ?? "") ?? "Unplaced"}`,
        iconScore,
      ),
      alcoves: entries(alcoves, (alcove) => `${alcove.name} drawer`, () => 0),
    }
  }, [icons, alcoves, frecency])

  const deepIndex = useMemo(
    () => entries(deepIcons, (icon) => `${icon.name} ${parentFolder(icon.path)}`, () => 0),
    [deepIcons],
  )

  // The exe name is what people type — "code", not "index.ts — alcove".
  const runningIndex = useMemo(
    () => entries(running, (app) => `${app.title} ${exeName(app.exePath)}`, () => 0),
    [running],
  )

  /**
   * The matching rows, ranked and capped here rather than by cmdk. Only these
   * are mounted, so a keystroke costs one pass over the names instead of a
   * re-render of the entire desktop.
   */
  const results = useMemo(() => {
    const search = term.toLowerCase()
    const matchedIcons = rank(index.icons, search, MATCH_CAP)
    const matchedDeep = rank(deepIndex, search, MATCH_CAP)
    const matchedRunning = rank(runningIndex, search, RUNNING_CAP)
    const matchedAlcoves = rank(index.alcoves, search, MATCH_CAP)

    const rows = new Map<string, LauncherPick>()
    for (const icon of matchedIcons) rows.set(iconKey(icon), { kind: "icon", icon, how: "open" })
    for (const icon of matchedDeep) rows.set(iconKey(icon), { kind: "icon", icon, how: "open" })
    for (const app of matchedRunning) rows.set(`w:${app.hwnd}`, { kind: "window", app })
    for (const alcove of matchedAlcoves)
      rows.set(`a:${alcove.id}`.toLowerCase(), { kind: "alcove", alcove })

    return {
      icons: matchedIcons,
      deep: matchedDeep,
      running: matchedRunning,
      alcoves: matchedAlcoves,
      rows,
      count:
        matchedIcons.length + matchedDeep.length + matchedRunning.length + matchedAlcoves.length,
    }
  }, [index, deepIndex, runningIndex, term])

  const home = useMemo(
    () => launcherHome(icons, frecency, hide, Date.now()),
    [icons, frecency, hide],
  )

  return {
    query,
    setQuery,
    term,
    palette,
    results,
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
 * The rows themselves. Split from the hook above only so the ranked lists are
 * built once, above `<Command>`, rather than inside it.
 */
function LauncherList(launcher: Launcher) {
  const {
    query,
    setQuery,
    term,
    palette,
    results,
    alcoves,
    home,
    openLabel,
    onPick,
  } = launcher
  const now = Date.now()
  const numbered = useMemo(() => homeOrder(home), [home])
  const idle = palette === null && term === ""

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
   *
   * The highlighted row is read off the DOM instead of subscribed to: it is
   * wanted twice a session, and subscribing re-rendered every mounted row on
   * every arrow key.
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
    if (!how) return
    const selected = document
      .querySelector('[cmdk-item=""][aria-selected="true"]')
      ?.getAttribute("data-value")
    if (!selected) return
    const pick = results.rows.get(selected)
    if (pick?.kind !== "icon" || !pick.icon.path) return
    event.preventDefault()
    event.stopPropagation()
    onPick({ ...pick, how })
  }

  // Only after everything real has been ruled out, and never in command mode —
  // there the empty list means "no such command", not "try the web".
  const spare: Fallback[] = palette === null && term && results.count === 0 ? fallbacks(term) : []

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
            {results.running.length > 0 ? (
              <CommandGroup heading="Running">
                {results.running.map((app) => (
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
              {results.icons.map((icon) => (
                <IconRow
                  key={icon.id}
                  icon={icon}
                  trailing={alcoveName(alcoves, icon.alcoveId)}
                  now={now}
                  onPick={onPick}
                />
              ))}
            </CommandGroup>
            {results.deep.length > 0 ? (
              <CommandGroup heading="Deeper in your folders">
                {results.deep.map((icon) => (
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
              {results.alcoves.map((alcove) => (
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
      shouldFilter={false}
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
    <Command shouldFilter={false} className="h-full max-h-none rounded-none!">
      <LauncherList {...launcher} />
    </Command>
  )
}
