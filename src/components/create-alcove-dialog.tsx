import { useCallback, useEffect, useRef, useState } from "react"
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
  resolveAlcoveGlyph,
  type AlcoveGlyphId,
} from "@/lib/alcove-glyphs"
import { invoke, isTauri } from "@/lib/tauri"
import { cn } from "@/lib/utils"
import type { Alcove, AlcoveColor } from "@/types"

type KnownFolder = { id: string; name: string; path: string }

let knownFoldersCache: KnownFolder[] | null = null
let knownFoldersLoad: Promise<KnownFolder[]> | null = null

export function prefetchKnownFolders() {
  if (!isTauri()) return
  if (knownFoldersLoad) return
  knownFoldersLoad = invoke<KnownFolder[]>("list_known_folders")
    .then((folders) => {
      knownFoldersCache = folders
      return folders
    })
    .catch(() => {
      knownFoldersCache = []
      return [] as KnownFolder[]
    })
}

type CreateAlcoveDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string, color: AlcoveColor, glyph: string, folderPath?: string | null) => void
  onSave?: (name: string, color: AlcoveColor, glyph: string, folderPath?: string | null) => void
  onDelete?: () => void
  seedName?: string
  alcove?: Alcove | null
}

export function CreateAlcoveDialog({
  open,
  onOpenChange,
  onCreate,
  onSave,
  onDelete,
  seedName = "",
  alcove = null,
}: CreateAlcoveDialogProps) {
  const editing = Boolean(alcove)
  const [name, setName] = useState(seedName)
  const [color, setColor] = useState<AlcoveColor>("violet")
  const [glyph, setGlyph] = useState<AlcoveGlyphId>(() =>
    defaultAlcoveGlyph("new", seedName),
  )
  const [glyphTouched, setGlyphTouched] = useState(false)
  const [folderPath, setFolderPath] = useState<string | null>(null)
  const [known, setKnown] = useState<KnownFolder[]>(() => knownFoldersCache ?? [])
  const glyphDelay = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isTauri()) return
    prefetchKnownFolders()
    if (knownFoldersCache) {
      setKnown(knownFoldersCache)
      return
    }
    void knownFoldersLoad?.then(setKnown)
  }, [])

  useEffect(() => {
    if (!open) return
    if (alcove) {
      setName(alcove.name)
      setColor(alcove.color)
      setGlyph(resolveAlcoveGlyph(alcove))
      setGlyphTouched(true)
      setFolderPath(alcove.folderPath ?? null)
    } else {
      setName(seedName)
      setColor("violet")
      setGlyph(defaultAlcoveGlyph("new", seedName))
      setGlyphTouched(false)
      setFolderPath(null)
    }
    if (glyphDelay.current) {
      clearTimeout(glyphDelay.current)
      glyphDelay.current = null
    }
  }, [open, seedName, alcove])

  useEffect(
    () => () => {
      if (glyphDelay.current) clearTimeout(glyphDelay.current)
    },
    [],
  )

  const chooseFolder = useCallback(
    (path: string, folderName: string) => {
      setFolderPath(path)
      setName((current) => {
        if (current.trim() && glyphTouched) return current
        return folderName
      })
      if (!glyphTouched) setGlyph(defaultAlcoveGlyph("new", folderName))
    },
    [glyphTouched],
  )

  function queueGlyphFromName(next: string) {
    if (glyphTouched) return
    if (glyphDelay.current) clearTimeout(glyphDelay.current)
    glyphDelay.current = setTimeout(() => {
      setGlyph(defaultAlcoveGlyph("new", next))
      glyphDelay.current = null
    }, 250)
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
    if (alcove) onSave?.(name, color, glyph, folderPath)
    else onCreate(name, color, glyph, folderPath)
    onOpenChange(false)
  }

  function remove() {
    onDelete?.()
    onOpenChange(false)
  }

  const pickGlyph = useCallback((next: AlcoveGlyphId) => {
    if (glyphDelay.current) {
      clearTimeout(glyphDelay.current)
      glyphDelay.current = null
    }
    setGlyphTouched(true)
    setGlyph(next)
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Alcove" : "New Alcove"}</DialogTitle>
          <DialogDescription>
            {editing
              ? alcove?.isInbox
                ? "Inbox is the catch-all. You can rename it, but it cannot be deleted."
                : "Change the name, icon, color, or the folder this drawer mirrors."
              : "A named space on the desktop — or a live view of any folder."}
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
                queueGlyphFromName(next)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit()
              }}
            />
          </div>
          {isTauri() && !alcove?.isInbox ? (
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
          {alcove?.isInbox ? null : (
            <div className="flex flex-col gap-1.5">
              <Label>Icon</Label>
              <AlcoveGlyphGrid value={glyph} onChange={pickGlyph} />
            </div>
          )}
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
        <DialogFooter className={onDelete ? "sm:justify-between" : undefined}>
          {onDelete ? (
            <Button variant="destructive" onClick={remove}>
              Delete
            </Button>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!name.trim()} onClick={submit}>
              {editing ? "Save" : "Create"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
