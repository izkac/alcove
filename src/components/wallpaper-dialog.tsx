import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useThumbnail } from "@/lib/thumbnail"
import { invoke, isTauri } from "@/lib/tauri"
import { cn } from "@/lib/utils"
import {
  picturesIn,
  preferPictureFolders,
  type KnownFolder,
} from "@/lib/wallpaper-pictures"
import type { HarvestedIcon } from "@/lib/harvest-merge"

type WallpaperDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (path: string) => Promise<void> | void
}

/**
 * In-app picture picker. The Windows file dialog crashes Alcove
 * (`IFileOpenDialog::Show` in comdlg32), so this lists pictures from known
 * folders instead.
 */
export function WallpaperDialog({
  open,
  onOpenChange,
  onApply,
}: WallpaperDialogProps) {
  const [folders, setFolders] = useState<KnownFolder[]>([])
  const [folderId, setFolderId] = useState<string | null>(null)
  const [items, setItems] = useState<HarvestedIcon[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState<string | null>(null)
  const folder = folders.find((item) => item.id === folderId) ?? null

  useEffect(() => {
    if (!open) return
    if (!isTauri()) {
      setFolders([])
      setItems([])
      setError(null)
      return
    }
    let cancelled = false
    invoke<KnownFolder[]>("list_known_folders")
      .then((found) => {
        if (cancelled) return
        const ordered = preferPictureFolders(found)
        setFolders(ordered)
        setFolderId((current) => {
          if (current && ordered.some((item) => item.id === current)) return current
          return ordered.find((item) => item.id === "pictures")?.id ?? ordered[0]?.id ?? null
        })
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open || !folder || !isTauri()) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setItems([])
    invoke<HarvestedIcon[]>("list_folder_icons", { path: folder.path })
      .then((icons) => {
        if (!cancelled) setItems(picturesIn(icons))
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, folder?.path])

  function pick(path: string) {
    if (applying) return
    setApplying(path)
    Promise.resolve(onApply(path))
      .then(() => onOpenChange(false))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setApplying(null))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose a picture</DialogTitle>
          <DialogDescription>
            This becomes the Windows wallpaper, on every monitor.
          </DialogDescription>
        </DialogHeader>

        {!isTauri() ? (
          <p className="text-sm text-muted-foreground">
            Changing the wallpaper is only on Windows.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              {folders.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  size="sm"
                  variant={item.id === folderId ? "secondary" : "outline"}
                  onClick={() => setFolderId(item.id)}
                >
                  {item.name}
                </Button>
              ))}
            </div>
            <PictureGrid
              items={items}
              loading={loading}
              error={error}
              applying={applying}
              onPick={pick}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PictureGrid({
  items,
  loading,
  error,
  applying,
  onPick,
}: {
  items: HarvestedIcon[]
  loading: boolean
  error: string | null
  applying: string | null
  onPick: (path: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-muted-foreground">Looking for pictures…</p>
      ) : items.length === 0 ? (
        error ? null : (
          <p className="text-sm text-muted-foreground">No pictures in this folder.</p>
        )
      ) : (
        <div className="grid max-h-96 grid-cols-4 gap-2 overflow-y-auto pr-0.5">
          {items.map((picture) => (
            <PictureTile
              key={picture.path}
              picture={picture}
              busy={applying !== null}
              active={applying === picture.path}
              onPick={() => onPick(picture.path)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PictureTile({
  picture,
  busy,
  active,
  onPick,
}: {
  picture: HarvestedIcon
  busy: boolean
  active: boolean
  onPick: () => void
}) {
  const tile = useRef<HTMLButtonElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const element = tile.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const thumb = useThumbnail(visible ? picture.path : undefined)
  const src = thumb || picture.imageUrl
  return (
    <button
      type="button"
      title={picture.name}
      ref={tile}
      disabled={busy}
      onClick={onPick}
      className={cn(
        "flex flex-col rounded-lg p-1 text-left outline-none transition-colors duration-150",
        "hover:bg-accent focus-visible:ring-2 focus-visible:ring-sel",
        active ? "bg-sel-soft ring-1 ring-sel" : "ring-1 ring-transparent",
        "disabled:opacity-50",
      )}
    >
      <span className="block aspect-square overflow-hidden rounded-md bg-surface-2">
        {src ? (
          <img src={src} alt="" className="size-full object-cover" />
        ) : null}
      </span>
      <span className="mt-1 line-clamp-2 text-label text-ink">{picture.name}</span>
    </button>
  )
}
