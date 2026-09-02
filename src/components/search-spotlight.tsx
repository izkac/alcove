import { useCallback, useEffect, useMemo, useState } from "react"
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
import { homeOrder, launcherHome } from "@/lib/launcher"
import type { Alcove, DesktopIcon } from "@/types"

type SearchIconListProps = {
  icons: DesktopIcon[]
  alcoves: Alcove[]
  frecency?: Frecency
  hide?: string[]
  onSelect: (icon: DesktopIcon) => void
}

function alcoveName(alcoves: Alcove[], id: string | null) {
  return alcoves.find((alcove) => alcove.id === id)?.name ?? "Unplaced"
}

/** cmdk lowercases and trims values before handing them to the filter. */
function itemValue(icon: DesktopIcon, alcoves: Alcove[]) {
  return `${icon.name} ${alcoveName(alcoves, icon.alcoveId)}`
}

const NO_FRECENCY: Frecency = {}
const NO_HIDE: string[] = []

/**
 * Ranks matches by how often you actually open them. Alcove's only durable
 * advantage over the Start menu is knowing that, and until now the launcher —
 * the place it matters most — ignored it.
 */
export function useLaunchFilter(
  icons: DesktopIcon[],
  alcoves: Alcove[],
  frecency: Frecency,
) {
  const scores = useMemo(() => {
    const now = Date.now()
    const map = new Map<string, number>()
    for (const icon of icons) {
      const key = itemValue(icon, alcoves).trim().toLowerCase()
      // Two files with the same name in the same drawer share a key; they then
      // share a boost, which is the harmless outcome.
      map.set(key, Math.max(map.get(key) ?? 0, scoreAt(frecency[icon.id], now)))
    }
    return map
  }, [icons, alcoves, frecency])

  return useCallback(
    (value: string, search: string, keywords?: string[]) =>
      rankLaunch(
        defaultFilter(value, search, keywords),
        scores.get(value.trim().toLowerCase()) ?? 0,
      ),
    [scores],
  )
}

function IconRow({
  icon,
  alcoves,
  badge,
  onSelect,
}: {
  icon: DesktopIcon
  alcoves: Alcove[]
  badge?: number
  onSelect: (icon: DesktopIcon) => void
}) {
  return (
    <CommandItem value={itemValue(icon, alcoves)} onSelect={() => onSelect(icon)}>
      <IconGlyph icon={icon} size={22} className="rounded-md" />
      <span className="flex-1 truncate">{icon.name}</span>
      {badge ? (
        <kbd className="rounded border border-hairline bg-surface-3 px-1 font-sans text-micro leading-4 text-ink-muted">
          {badge}
        </kbd>
      ) : null}
      <span className="text-xs text-muted-foreground">
        {alcoveName(alcoves, icon.alcoveId)}
      </span>
    </CommandItem>
  )
}

export function SearchIconList({
  icons,
  alcoves,
  frecency = NO_FRECENCY,
  hide = NO_HIDE,
  onSelect,
}: SearchIconListProps) {
  const [query, setQuery] = useState("")

  // An empty box is wasted space, and it is the one moment the launcher can
  // answer "the thing I was just working on" — which the strip cannot hold.
  const home = useMemo(
    () => launcherHome(icons, frecency, hide, Date.now()),
    [icons, frecency, hide],
  )
  const numbered = useMemo(() => homeOrder(home), [home])
  const idle = query.trim() === ""

  useEffect(() => {
    if (!idle) return
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.altKey || event.metaKey) return
      const slot = Number(event.key)
      // Only while the box is empty, so typing "1" into a search stays typing.
      if (!Number.isInteger(slot) || slot < 1 || slot > numbered.length) return
      event.preventDefault()
      onSelect(numbered[slot - 1]!)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [idle, numbered, onSelect])

  return (
    <>
      <CommandInput
        placeholder="Search icons…"
        autoFocus
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {idle ? (
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
                    alcoves={alcoves}
                    badge={index + 1}
                    onSelect={onSelect}
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
                    alcoves={alcoves}
                    badge={home.today.length + index + 1}
                    onSelect={onSelect}
                  />
                ))}
              </CommandGroup>
            ) : null}
          </>
        ) : (
          <>
            <CommandEmpty>No icons match that name.</CommandEmpty>
            <CommandGroup heading="Icons">
              {icons.map((icon) => (
                <IconRow
                  key={icon.id}
                  icon={icon}
                  alcoves={alcoves}
                  onSelect={onSelect}
                />
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </>
  )
}

type SearchSpotlightProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  icons: DesktopIcon[]
  alcoves: Alcove[]
  frecency?: Frecency
  hide?: string[]
  onSelect: (icon: DesktopIcon) => void
}

export function SearchSpotlight({
  open,
  onOpenChange,
  icons,
  alcoves,
  frecency = NO_FRECENCY,
  hide = NO_HIDE,
  onSelect,
}: SearchSpotlightProps) {
  const filter = useLaunchFilter(icons, alcoves, frecency)
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      filter={filter}
      title="Find on this desktop"
      description="Search icons across every Alcove"
    >
      <SearchIconList
        icons={icons}
        alcoves={alcoves}
        frecency={frecency}
        hide={hide}
        onSelect={(icon) => {
          onSelect(icon)
          onOpenChange(false)
        }}
      />
    </CommandDialog>
  )
}

export function SearchOverlayCard({
  icons,
  alcoves,
  frecency = NO_FRECENCY,
  hide = NO_HIDE,
  onSelect,
}: SearchIconListProps) {
  const filter = useLaunchFilter(icons, alcoves, frecency)
  return (
    <Command filter={filter} className="h-full max-h-none rounded-none!">
      <SearchIconList
        icons={icons}
        alcoves={alcoves}
        frecency={frecency}
        hide={hide}
        onSelect={onSelect}
      />
    </Command>
  )
}
