/**
 * Alcove takes its light and its tint from the wallpaper it sits on.
 *
 * A light wallpaper gets paper surfaces, a dark one gets slate, and both lean
 * toward the wallpaper's dominant hue by a chroma small enough not to read as a
 * colour. Everything downstream is CSS: this only decides two numbers and puts
 * them on <html>, where `index.css` turns them into the whole palette.
 *
 * The verdict is saved so the search and taskbar windows, which never load the
 * wallpaper, paint in the same theme from their first frame.
 */

export type WallpaperTheme = {
  mode: "light" | "dark"
  /** OKLCH hue, 0..360. */
  hue: number
  /**
   * Mean OKLCH chroma of the wallpaper, 0 for grey up to about 0.2 for a
   * saturated picture. Surfaces take a fraction of it, so a vivid wallpaper
   * gets visibly tinted paper and a grey one stays neutral.
   */
  chroma: number
  /** Mean OKLab lightness, 0..1. Surfaces sit a fixed step above it. */
  lightness: number
}

const KEY = "alcove.theme.v1"
const FALLBACK: WallpaperTheme = { mode: "dark", hue: 250, chroma: 0, lightness: 0.2 }

/** Above this mean OKLab lightness the wallpaper counts as light. */
const LIGHT_ABOVE = 0.5
/** Below this mean chroma the wallpaper is grey; keep the default hue. */
const GREY_BELOW = 0.02

export function applyTheme(theme: WallpaperTheme) {
  const root = document.documentElement
  root.dataset.wp = theme.mode
  root.style.setProperty("--wp-h", String(Math.round(theme.hue)))
  root.style.setProperty("--wp-c", theme.chroma.toFixed(3))
  root.style.setProperty("--wp-l", theme.lightness.toFixed(3))
  try {
    localStorage.setItem(KEY, JSON.stringify(theme))
  } catch {
    // a per-viewer convenience; nothing depends on it surviving
  }
}

export function savedTheme(): WallpaperTheme {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return FALLBACK
    const parsed = JSON.parse(raw) as Partial<WallpaperTheme>
    if (
      (parsed.mode === "light" || parsed.mode === "dark") &&
      typeof parsed.hue === "number" &&
      Number.isFinite(parsed.hue)
    ) {
      const chroma =
        typeof parsed.chroma === "number" && Number.isFinite(parsed.chroma)
          ? parsed.chroma
          : 0
      const lightness =
        typeof parsed.lightness === "number" && Number.isFinite(parsed.lightness)
          ? parsed.lightness
          : parsed.mode === "light"
            ? 0.8
            : 0.2
      return { mode: parsed.mode, hue: parsed.hue, chroma, lightness }
    }
  } catch {
    // fall through
  }
  return FALLBACK
}

/** First paint in every window, before the wallpaper is known. */
export function applySavedTheme() {
  applyTheme(savedTheme())
}

/** Every window on every desk re-reads the wallpaper. */
const CHANGED = "alcove:wallpaper-changed"

/** Tell this window, and every other desk, that the wallpaper moved. */
export function announceWallpaperChange() {
  window.dispatchEvent(new Event(CHANGED))
  if (typeof BroadcastChannel === "undefined") return
  const channel = new BroadcastChannel("alcove-desk")
  channel.postMessage({ type: "wallpaper-changed" })
  channel.close()
}

/** Run `onChange` whenever the wallpaper is replaced, here or on another desk. */
export function onWallpaperChange(handler: () => void): () => void {
  window.addEventListener(CHANGED, handler)
  const channel =
    typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("alcove-desk")
  function onMessage(event: MessageEvent<{ type?: string }>) {
    if (event.data?.type === "wallpaper-changed") handler()
  }
  channel?.addEventListener("message", onMessage)
  return () => {
    window.removeEventListener(CHANGED, handler)
    channel?.removeEventListener("message", onMessage)
    channel?.close()
  }
}

/**
 * The user's Surface setting: how far the surfaces lean into the wallpaper.
 * Lives in the desktop state; this only tells CSS about it.
 */
export function applyTone(tone: "blend" | "tinted" | "solid") {
  document.documentElement.dataset.tone = tone
}

/**
 * The user's text settings. Size scales the whole scale at once; strong pushes
 * the muted inks further from the surface for anyone who finds them soft.
 */
export function applyText(size: "default" | "large" | "larger", strong: boolean) {
  const root = document.documentElement
  root.dataset.text = size
  if (strong) root.dataset.contrast = "high"
  else delete root.dataset.contrast
}

/** sRGB byte to linear light. */
function linear(byte: number) {
  const c = byte / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Linear sRGB to OKLab. The standard matrices, nothing clever. */
function oklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/**
 * Mean lightness plus a chroma-weighted circular mean of hue, so a mostly-grey
 * photo with one red car reads as grey, and a blue sky reads as blue.
 */
export function themeFromPixels(rgba: Uint8ClampedArray): WallpaperTheme {
  let n = 0
  let sumL = 0
  let sumA = 0
  let sumB = 0
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue
    const [L, a, b] = oklab(linear(rgba[i]), linear(rgba[i + 1]), linear(rgba[i + 2]))
    n += 1
    sumL += L
    sumA += a
    sumB += b
  }
  if (n === 0) return FALLBACK
  const meanL = sumL / n
  const meanA = sumA / n
  const meanB = sumB / n
  const chroma = Math.hypot(meanA, meanB)
  const grey = chroma < GREY_BELOW
  const hue = grey
    ? FALLBACK.hue
    : ((Math.atan2(meanB, meanA) * 180) / Math.PI + 360) % 360
  return {
    mode: meanL > LIGHT_ABOVE ? "light" : "dark",
    hue,
    chroma: grey ? 0 : chroma,
    lightness: Math.min(1, Math.max(0, meanL)),
  }
}

function parseHex(color: string): [number, number, number] | null {
  const hex = color.trim().replace(/^#/, "")
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ]
}

/**
 * Decide the theme for a wallpaper: the image when there is one, else the
 * solid colour Windows reports. Never rejects; a broken image falls back to
 * the colour, and a broken colour falls back to slate.
 */
export function themeFromBackground(
  color: string,
  imageUrl: string | null,
): Promise<WallpaperTheme> {
  const fromColor = () => {
    const rgb = parseHex(color)
    if (!rgb) return FALLBACK
    return themeFromPixels(new Uint8ClampedArray([...rgb, 255]))
  }
  if (!imageUrl) return Promise.resolve(fromColor())
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      try {
        // Small on purpose: this is a mood reading, not a histogram.
        const side = 24
        const canvas = document.createElement("canvas")
        canvas.width = side
        canvas.height = side
        const ctx = canvas.getContext("2d", { willReadFrequently: true })
        if (!ctx) return resolve(fromColor())
        ctx.drawImage(image, 0, 0, side, side)
        resolve(themeFromPixels(ctx.getImageData(0, 0, side, side).data))
      } catch {
        resolve(fromColor())
      }
    }
    image.onerror = () => resolve(fromColor())
    image.src = imageUrl
  })
}
