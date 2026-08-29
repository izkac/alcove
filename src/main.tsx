import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.tsx"
import { BarStrip } from "./components/bar-strip.tsx"
import { SearchOverlay } from "./components/search-overlay.tsx"

const params = new URLSearchParams(window.location.search)
const isBar = params.has("bar")
const isSearch = params.has("search")

if (isSearch) document.documentElement.classList.add("search-window")

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isSearch ? <SearchOverlay /> : isBar ? <BarStrip /> : <App />}
  </StrictMode>,
)
