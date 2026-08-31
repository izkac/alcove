import { useEffect, useState } from "react"
import { invoke, isTauri } from "./tauri.ts"

// Path -> data URL, or null for "Windows has no thumbnail for this type".
// Misses are remembered too: selecting an exe should ask the shell once, not on
// every click. Bounded because a 512px PNG data URL is ~200KB and a session can
// touch thousands of files; the Rust side keeps its own disk cache, so evicting
// here is cheap.
export const THUMB_LIMIT = 40
export const THUMBS = new Map<string, string | null>()

export function remember(path: string, art: string | null) {
  THUMBS.delete(path)
  THUMBS.set(path, art)
  if (THUMBS.size > THUMB_LIMIT) {
    const oldest = THUMBS.keys().next()
    if (!oldest.done) THUMBS.delete(oldest.value)
  }
}

/**
 * The document's own thumbnail — page one of a PDF, the first frame of a video,
 * the photo itself. Null while it loads, for anything with no thumbnail
 * provider, and in the browser mock.
 */
export function useThumbnail(path?: string) {
  const [, redraw] = useState(0)
  useEffect(() => {
    if (!path || THUMBS.has(path) || !isTauri()) return
    let alive = true
    invoke<string | null>("thumbnail", { path })
      .then((art) => {
        remember(path, art ?? null)
        if (alive) redraw((n) => n + 1)
      })
      .catch(() => remember(path, null))
    return () => {
      alive = false
    }
  }, [path])
  return path ? THUMBS.get(path) ?? null : null
}
