import { useEffect, useState } from "react"
import { toast } from "sonner"
import { IconGlyph } from "@/components/icon-glyph"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { invoke, isTauri } from "@/lib/tauri"
import { cn } from "@/lib/utils"
import type { DesktopIcon } from "@/types"
import { Trash2 } from "lucide-react"
import type { MouseEvent } from "react"

type RecycleBinInfo = {
  name: string
  path: string
  imageUrl: string
}

type DesktopCornerProps = {
  pinnedIcons: DesktopIcon[]
  onOpenIcon: (icon: DesktopIcon) => void
}

export function DesktopCorner({ pinnedIcons, onOpenIcon }: DesktopCornerProps) {
  const [bin, setBin] = useState<RecycleBinInfo | null>(null)

  useEffect(() => {
    if (!isTauri()) return
    invoke<RecycleBinInfo>("recycle_bin")
      .then(setBin)
      .catch(() => undefined)
  }, [])

  function openBin() {
    const path = bin?.path ?? "shell:RecycleBinFolder"
    if (isTauri()) {
      invoke("open_desktop_item", { path }).catch(() => {
        toast("Could not open Recycle Bin")
      })
      return
    }
    toast("Recycle Bin")
  }

  function emptyBin() {
    if (!isTauri()) {
      toast("Empty Recycle Bin is only on Windows")
      return
    }
    invoke("empty_recycle_bin").catch((err) => {
      toast(err instanceof Error ? err.message : String(err))
    })
  }

  function properties() {
    if (!isTauri()) {
      toast("Recycle Bin properties are only on Windows")
      return
    }
    invoke("recycle_bin_properties").catch((err) => {
      toast(err instanceof Error ? err.message : String(err))
    })
  }

  function onNativeMenu(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    invoke("show_recycle_bin_menu", {
      x: Math.round(event.screenX),
      y: Math.round(event.screenY),
    }).catch((err) => {
      toast(err instanceof Error ? err.message : String(err))
    })
  }

  const label = bin?.name ?? "Recycle Bin"
  const glyph = bin?.imageUrl ? (
    <img
      src={bin.imageUrl}
      alt=""
      className="size-12 bg-transparent object-contain drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]"
      draggable={false}
      onContextMenu={(event) => event.preventDefault()}
    />
  ) : (
    <Trash2 className="size-12 bg-transparent p-1.5 drop-shadow-sm" />
  )

  const button = (
    <button
      type="button"
      title={label}
      onDoubleClick={openBin}
      onClick={openBin}
      onContextMenu={isTauri() ? onNativeMenu : undefined}
      className={cn(
        "pointer-events-auto flex w-[76px] flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-white/95",
        "hover:bg-white/10",
      )}
    >
      {glyph}
      <span className="line-clamp-2 w-full text-center text-[11px] leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
        {label}
      </span>
    </button>
  )

  return (
    <div className="pointer-events-none absolute right-3 bottom-3 z-20 flex flex-col items-center gap-1">
      {pinnedIcons.length > 0 ? (
        <div
          data-pin-rail=""
          className="pointer-events-auto flex flex-col items-center gap-1"
        >
          {pinnedIcons.map((icon) => (
            <button
              key={icon.id}
              type="button"
              title={icon.name}
              onDoubleClick={() => onOpenIcon(icon)}
              onClick={() => onOpenIcon(icon)}
              className="flex w-[76px] flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-white/95 hover:bg-white/10"
            >
              <IconGlyph icon={icon} size={48} />
              <span className="line-clamp-2 w-full text-center text-[11px] leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
                {icon.name}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {isTauri() ? (
        button
      ) : (
        <ContextMenu>
          <ContextMenuTrigger asChild>{button}</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={openBin}>Open</ContextMenuItem>
            <ContextMenuItem onSelect={emptyBin}>Empty Recycle Bin</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={properties}>Properties</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}
    </div>
  )
}
