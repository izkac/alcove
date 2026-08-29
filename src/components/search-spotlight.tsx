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
import type { Alcove, DesktopIcon } from "@/types"

type SearchIconListProps = {
  icons: DesktopIcon[]
  alcoves: Alcove[]
  onSelect: (icon: DesktopIcon) => void
}

function alcoveName(alcoves: Alcove[], id: string | null) {
  return alcoves.find((alcove) => alcove.id === id)?.name ?? "Unplaced"
}

export function SearchIconList({ icons, alcoves, onSelect }: SearchIconListProps) {
  return (
    <>
      <CommandInput placeholder="Search icons…" autoFocus />
      <CommandList>
        <CommandEmpty>No icons match that name.</CommandEmpty>
        <CommandGroup heading="Icons">
          {icons.map((icon) => (
            <CommandItem
              key={icon.id}
              value={`${icon.name} ${alcoveName(alcoves, icon.alcoveId)}`}
              onSelect={() => onSelect(icon)}
            >
              <IconGlyph icon={icon} size={22} className="rounded-md" />
              <span className="flex-1 truncate">{icon.name}</span>
              <span className="text-xs text-muted-foreground">
                {alcoveName(alcoves, icon.alcoveId)}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </>
  )
}

type SearchSpotlightProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  icons: DesktopIcon[]
  alcoves: Alcove[]
  onSelect: (icon: DesktopIcon) => void
}

export function SearchSpotlight({
  open,
  onOpenChange,
  icons,
  alcoves,
  onSelect,
}: SearchSpotlightProps) {
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Find on this desktop"
      description="Search icons across every Alcove"
    >
      <SearchIconList
        icons={icons}
        alcoves={alcoves}
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
  onSelect,
}: SearchIconListProps) {
  return (
    <Command className="h-full max-h-none rounded-none!">
      <SearchIconList icons={icons} alcoves={alcoves} onSelect={onSelect} />
    </Command>
  )
}
