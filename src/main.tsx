import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.tsx"
import { BarStrip } from "./components/bar-strip.tsx"

const isBar = new URLSearchParams(window.location.search).has("bar")

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isBar ? <BarStrip /> : <App />}</StrictMode>,
)
