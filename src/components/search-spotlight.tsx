import { IconGlyph } from "@/components/icon-glyph"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import type { Alcove, DesktopIcon } from "@/types"

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
  const alcoveName = (id: string | null) =>
    alcoves.find((alcove) => alcove.id === id)?.name ?? "Unplaced"

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Find on this desktop"
      description="Search icons across every Alcove"
    >
      <CommandInput placeholder="Search icons…" />
      <CommandList>
        <CommandEmpty>No icons match that name.</CommandEmpty>
        <CommandGroup heading="Icons">
          {icons.map((icon) => (
            <CommandItem
              key={icon.id}
              value={`${icon.name} ${alcoveName(icon.alcoveId)}`}
              onSelect={() => {
                onSelect(icon)
                onOpenChange(false)
              }}
            >
              <IconGlyph icon={icon} size={22} className="rounded-md" />
              <span className="flex-1 truncate">{icon.name}</span>
              <span className="text-xs text-muted-foreground">
                {alcoveName(icon.alcoveId)}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
