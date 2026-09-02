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
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/**
 * A spread of desktop backgrounds that read well behind Alcove: four darks for
 * the usual case, two mid tones, two papers. The native picker below covers
 * everything else, so these are a shortcut, not a palette.
 */
const PRESETS: { hex: string; label: string }[] = [
  { hex: "#101114", label: "Near black" },
  { hex: "#1B2027", label: "Slate" },
  { hex: "#16202E", label: "Deep blue" },
  { hex: "#14251F", label: "Deep green" },
  { hex: "#2A2320", label: "Warm brown" },
  { hex: "#5A6470", label: "Steel" },
  { hex: "#8C9AA6", label: "Fog" },
  { hex: "#E8E6E1", label: "Paper" },
]

type BackgroundDialogProps = {
  open: boolean
  /** The desktop's colour right now, so the picker opens where the user is. */
  current: string
  onOpenChange: (open: boolean) => void
  onApply: (hex: string) => void
}

/**
 * Replaces the wallpaper with a plain colour. Alcove re-reads the desktop after
 * this and re-tints itself, so the choice shows up on every surface, not just
 * behind them.
 */
export function BackgroundDialog({
  open,
  current,
  onOpenChange,
  onApply,
}: BackgroundDialogProps) {
  const [hex, setHex] = useState(current)

  useEffect(() => {
    if (open) setHex(/^#[0-9a-f]{6}$/i.test(current) ? current : "#1B2027")
  }, [open, current])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Desktop background</DialogTitle>
          <DialogDescription>
            This clears the wallpaper and leaves a plain colour. Alcove takes its
            own tint from it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-8 gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.hex}
                type="button"
                title={preset.label}
                aria-label={preset.label}
                aria-pressed={hex.toLowerCase() === preset.hex.toLowerCase()}
                onClick={() => setHex(preset.hex)}
                style={{ backgroundColor: preset.hex }}
                className={cn(
                  "size-7 rounded-full ring-2 ring-offset-2 ring-offset-popover outline-none transition-[box-shadow] duration-150 focus-visible:ring-sel",
                  hex.toLowerCase() === preset.hex.toLowerCase()
                    ? "ring-foreground"
                    : "ring-transparent hover:ring-hairline",
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <Label htmlFor="background-color" className="shrink-0">
              Colour
            </Label>
            <input
              id="background-color"
              type="color"
              value={hex}
              onChange={(event) => setHex(event.target.value)}
              className="h-8 w-14 cursor-pointer rounded-md border border-input bg-transparent p-0.5 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <span className="font-mono text-meta text-muted-foreground uppercase">
              {hex}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onApply(hex)
              onOpenChange(false)
            }}
          >
            Set background
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
