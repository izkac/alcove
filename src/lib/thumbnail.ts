import { useEffect, useState } from "react"
import { invoke, isTauri } from "./tauri.ts"
import { ImageCache, ImageRequests } from "./image-cache.ts"

// Path -> data URL, or null for "Windows has no thumbnail for this type".
// Misses are remembered too: selecting an exe should ask the shell once, not on
// every click. Bounded because a 512px PNG data URL is ~200KB and a session can
// touch thousands of files; the Rust side keeps its own disk cache, so evicting
// here is cheap.
export const THUMB_LIMIT = 64
export const THUMBS = new ImageCache(24 * 1024 * 1024, THUMB_LIMIT)
const requests = new ImageRequests(THUMBS, 2, (path) => invoke<string | null>("thumbnail", { path }))

export function remember(path: string, art: string | null) {
  THUMBS.set(path, art)
}

/**
 * The document's own thumbnail — page one of a PDF, the first frame of a video,
 * the photo itself. Null while it loads, for anything with no thumbnail
 * provider, and in the browser mock.
 */
export function useThumbnail(path?: string) {
  const [result, setResult] = useState<{ path: string; art: string | null } | null>(null)
  useEffect(() => {
    if (!path || !isTauri()) return
    return requests.subscribe(path, (art) => setResult({ path, art }))
  }, [path])
  return path ? result?.path === path ? result.art : THUMBS.get(path) ?? null : null
}
