import { useEffect, useState } from "react"
import { invoke, isTauri } from "@/lib/tauri"

type VisibilityWindow = Window & { __ALCOVE_VISIBLE__?: boolean }
const current = () => (window as VisibilityWindow).__ALCOVE_VISIBLE__ ?? !isTauri()

// Native show/hide also writes the flag, so events sent before React mounts
// are not lost. DOM focus alone cannot detect a non-activating bar window.
export function useWindowVisible() {
  const [visible, setVisible] = useState(current)
  useEffect(() => {
    let alive = true
    let changed = false
    const update = () => { changed = true; setVisible(current()) }
    window.addEventListener("alcove-visibility", update)
    if (isTauri()) {
      invoke<boolean>("window_visible").then((value) => {
        if (alive && !changed) setVisible(value)
      }).catch(() => undefined)
    }
    return () => {
      alive = false
      window.removeEventListener("alcove-visibility", update)
    }
  }, [])
  return visible
}
