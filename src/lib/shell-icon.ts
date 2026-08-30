import { useEffect, useState } from "react"
import { invoke, isTauri } from "@/lib/tauri"

// Shared across every strip, panel and the Settings picker: the same handful of
// targets is asked for repeatedly, and the art never changes while we run.
const ART = new Map<string, string | null>()

/**
 * Real Windows icon for a launcher target — an `exe`/`dll`/`cpl` path with an
 * optional `,index`, a folder, or a `shell:` name. Null while it loads, or for
 * anything Windows has no icon for. Pass "" to skip the lookup.
 */
export function useShellIcon(target: string) {
  const [, redraw] = useState(0)
  useEffect(() => {
    if (ART.has(target) || !target || !isTauri()) return
    let alive = true
    invoke<string>("shell_icon", { target })
      .then((art) => {
        ART.set(target, art)
        if (alive) redraw((n) => n + 1)
      })
      .catch(() => ART.set(target, null))
    return () => {
      alive = false
    }
  }, [target])
  return ART.get(target) ?? null
}
