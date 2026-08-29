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
import { invoke, isTauri } from "@/lib/tauri"
import { cn } from "@/lib/utils"
import type { AlcoveColor } from "@/types"

type KnownFolder = { id: string; name: string; path: string }

type CreateAlcoveDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string, color: AlcoveColor, glyph: string, folderPath?: string | null) => void
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
  const [folderPath, setFolderPath] = useState<string | null>(null)
  const [known, setKnown] = useState<KnownFolder[]>([])

  useEffect(() => {
    if (open) {
      setName(seedName)
      setColor("violet")
      setGlyph(defaultAlcoveGlyph("new", seedName))
      setGlyphTouched(false)
      setFolderPath(null)
    }
  }, [open, seedName])

  useEffect(() => {
    if (!open || !isTauri()) return
    invoke<KnownFolder[]>("list_known_folders")
      .then(setKnown)
      .catch(() => setKnown([]))
  }, [open])

  function chooseFolder(path: string, folderName: string) {
    setFolderPath(path)
    if (!name.trim() || !glyphTouched) {
      setName(folderName)
      if (!glyphTouched) setGlyph(defaultAlcoveGlyph("new", folderName))
    }
  }

  async function browse() {
    if (!isTauri()) return
    const picked = await invoke<string | null>("pick_folder").catch(() => null)
    if (!picked) return
    const leaf = picked.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? picked
    chooseFolder(picked, leaf)
  }

  function submit() {
    if (!name.trim()) return
    onCreate(name, color, glyph, folderPath)
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName(seedName)
          setColor("violet")
          setGlyph(defaultAlcoveGlyph("new", seedName))
          setGlyphTouched(false)
          setFolderPath(null)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Alcove</DialogTitle>
          <DialogDescription>
            A named space on the desktop — or a live view of any folder.
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
                if (event.key === "Enter") submit()
              }}
            />
          </div>
          {isTauri() ? (
            <div className="flex flex-col gap-1.5">
              <Label>Mirror a folder</Label>
              <div className="flex flex-wrap gap-1.5">
                {known.map((folder) => (
                  <Button
                    key={folder.id}
                    type="button"
                    size="sm"
                    variant={folderPath === folder.path ? "secondary" : "outline"}
                    onClick={() =>
                      folderPath === folder.path
                        ? setFolderPath(null)
                        : chooseFolder(folder.path, folder.name)
                    }
                  >
                    {folder.name}
                  </Button>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={() => void browse()}>
                  Browse…
                </Button>
              </div>
              {folderPath ? (
                <p className="truncate text-xs text-muted-foreground" title={folderPath}>
                  {folderPath}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Optional. Downloads is the usual dumping ground.
                </p>
              )}
            </div>
          ) : null}
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
          <Button disabled={!name.trim()} onClick={submit}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
