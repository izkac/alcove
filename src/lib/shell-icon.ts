import { useEffect, useState } from "react"
import { invoke, isTauri } from "./tauri.ts"
import { ImageCache, ImageRequests } from "./image-cache.ts"

const ART = new ImageCache(8 * 1024 * 1024, 512)
const requests = new ImageRequests(ART, 4, (target) => invoke<string>("shell_icon", { target }))

/**
 * Real Windows icon for a launcher target — an `exe`/`dll`/`cpl` path with an
 * optional `,index`, a folder, or a `shell:` name. Null while it loads, or for
 * anything Windows has no icon for. Pass "" to skip the lookup.
 */
export function useShellIcon(target: string) {
  // Mounted consumers retain their own art even if the shared cache evicts it.
  const [result, setResult] = useState<{ target: string; art: string | null } | null>(null)
  useEffect(() => {
    if (!target || !isTauri()) return
    return requests.subscribe(target, (art) => setResult({ target, art }))
  }, [target])
  return result?.target === target ? result.art : ART.get(target) ?? null
}
