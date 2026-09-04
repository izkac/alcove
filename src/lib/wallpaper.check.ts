/**
 * Self-check for wallpaper mood. Run: npm run check
 *
 * Light vs dark is the median pixel, so a dark picture with a few bright
 * sparkles stays slate. Mean lightness still drives --wp-l.
 */
import assert from "node:assert/strict"
import { themeFromPixels } from "./wallpaper.ts"

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

console.log("wallpaper check ok")
