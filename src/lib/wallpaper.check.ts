/**
 * Self-check for wallpaper mood. Run: npm run check
 *
 * Light vs dark is the median pixel, so a dark picture with a few bright
 * sparkles stays slate. Mean lightness still drives --wp-l.
 */
import assert from "node:assert/strict"
import { themeFromBackground, themeFromPixels } from "./wallpaper.ts"

function fill(rgb: number[], count: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(count * 4)
  for (let i = 0; i < count; i += 1) {
    out[i * 4] = rgb[0]
    out[i * 4 + 1] = rgb[1]
    out[i * 4 + 2] = rgb[2]
    out[i * 4 + 3] = 255
  }
  return out
}

function mix(dark: number[], light: number[], darkShare: number): Uint8ClampedArray {
  const n = 100
  const darkN = Math.round(n * darkShare)
  const out = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i += 1) {
    const rgb = i < darkN ? dark : light
    out[i * 4] = rgb[0]
    out[i * 4 + 1] = rgb[1]
    out[i * 4 + 2] = rgb[2]
    out[i * 4 + 3] = 255
  }
  return out
}

const POND = [18, 48, 58]
const SPARKLE = [230, 245, 250]
const PAPER = [236, 232, 220]

assert.equal(themeFromPixels(fill(POND, 24)).mode, "dark")
assert.equal(themeFromPixels(fill(PAPER, 24)).mode, "light")
assert.equal(
  themeFromPixels(mix(POND, SPARKLE, 0.6)).mode,
  "dark",
  "a dark pond with sparkles stays slate",
)
assert.equal(
  themeFromPixels(mix(PAPER, POND, 0.6)).mode,
  "light",
  "a light desk with a few dark marks stays paper",
)

/**
 * Releasing the decoded bitmap must not restart the load.
 *
 * `image.src = ""` resolves against the document URL, which is not an image,
 * so the browser fires `error`. When the error handler cleared `src` again it
 * re-entered itself and spun a core forever, recomputing the theme each turn
 * (ad5e570). The handlers must be detached before the release.
 */
{
  let errorFires = 0
  const CAP = 40
  class LoopingImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    #src = ""
    get src() {
      return this.#src
    }
    set src(value: string) {
      this.#src = value
      // Every assignment starts a load that fails, "" included. Only a
      // still-attached handler gets called, which is the thing under test.
      queueMicrotask(() => {
        if (!this.onerror) return
        errorFires += 1
        if (errorFires > CAP) return
        this.onerror()
      })
    }
  }
  const previous = (globalThis as { Image?: unknown }).Image
  ;(globalThis as { Image?: unknown }).Image = LoopingImage

  const theme = await themeFromBackground("#3a4a5a", "file:///gone.jpg")

  ;(globalThis as { Image?: unknown }).Image = previous
  assert.ok(theme, "a broken wallpaper still resolves to a theme")
  assert.equal(
    errorFires,
    1,
    `releasing the image re-entered the error handler ${errorFires} times; it must fire once`,
  )
}

console.log("wallpaper check ok")
