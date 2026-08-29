import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ALCOVE_COLOR_IDS } from "@/types"
import { ALCOVE_COLOR_STYLES } from "@/lib/colors"
import {
  AlcoveGlyphGrid,
  defaultAlcoveGlyph,
  type AlcoveGlyphId,
} from "@/lib/alcove-glyphs"
import { cn } from "@/lib/utils"
import type { AlcoveColor } from "@/types"

type CreateAlcoveDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string, color: AlcoveColor, glyph: string) => void
  seedName?: string
}

export function CreateAlcoveDialog({
  open,
  onOpenChange,
  onCreate,
  seedName = "",
}: CreateAlcoveDialogProps) {
  const [name, setName] = useState(seedName)
  const [color, setColor] = useState<AlcoveColor>("violet")
  const [glyph, setGlyph] = useState<AlcoveGlyphId>(() =>
    defaultAlcoveGlyph("new", seedName),
  )
  const [glyphTouched, setGlyphTouched] = useState(false)

  useEffect(() => {
    if (open) {
      setName(seedName)
      setColor("violet")
      setGlyph(defaultAlcoveGlyph("new", seedName))
      setGlyphTouched(false)
    }
  }, [open, seedName])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName(seedName)
          setColor("violet")
          setGlyph(defaultAlcoveGlyph("new", seedName))
          setGlyphTouched(false)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Alcove</DialogTitle>
          <DialogDescription>
            A named space on the desktop. Collapse it to a chip when you need
            the room back.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="alcove-name">Name</Label>
            <Input
              id="alcove-name"
              value={name}
              autoFocus
              placeholder="Client A, Downloads, Games…"
              onChange={(event) => {
                const next = event.target.value
                setName(next)
                if (!glyphTouched) setGlyph(defaultAlcoveGlyph("new", next))
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && name.trim()) {
                  onCreate(name, color, glyph)
                  onOpenChange(false)
                }
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Icon</Label>
            <AlcoveGlyphGrid
              value={glyph}
              onChange={(next) => {
                setGlyphTouched(true)
                setGlyph(next)
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {ALCOVE_COLOR_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setColor(id)}
                  className={cn(
                    "size-7 rounded-full ring-2 ring-offset-2 ring-offset-background",
                    ALCOVE_COLOR_STYLES[id].bar,
                    color === id ? "ring-foreground" : "ring-transparent",
                  )}
                  aria-label={ALCOVE_COLOR_STYLES[id].label}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim()}
            onClick={() => {
              onCreate(name, color, glyph)
              onOpenChange(false)
            }}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
