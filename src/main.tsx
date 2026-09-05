import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { applySavedTheme } from "./lib/wallpaper.ts"

const params = new URLSearchParams(window.location.search)
const isBar = params.has("bar")
const isSearch = params.has("search")

// Paint in the wallpaper's theme from the first frame; the desk refines it
// once it has actually looked at the wallpaper.
applySavedTheme()
if (isSearch) document.documentElement.classList.add("search-window")

// Each WebView imports only its own interface. Hidden helpers are prewarmed
// by native code after the desktop has mounted and attached.
const Screen = isSearch
  ? (await import("./components/search-overlay.tsx")).SearchOverlay
  : isBar
    ? (await import("./components/bar-strip.tsx")).BarStrip
    : (await import("./App.tsx")).default

createRoot(document.getElementById("root")!).render(<StrictMode><Screen /></StrictMode>)
