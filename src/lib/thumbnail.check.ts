/**
 * Self-check for the preview thumbnail cache. Run: npm run check
 *
 * The cache holds ~200KB data URLs, so the only thing worth asserting is that
 * it stays bounded and that re-selecting a file keeps it warm.
 */
import assert from "node:assert/strict"
import { THUMBS, THUMB_LIMIT, remember } from "./thumbnail.ts"

remember("a.pdf", "data:image/png;base64,AAAA")
assert.equal(THUMBS.get("a.pdf"), "data:image/png;base64,AAAA")

// A miss is an answer, not an absence — it must be cached so the shell is asked once.
remember("setup.exe", null)
assert.equal(THUMBS.has("setup.exe"), true)
assert.equal(THUMBS.get("setup.exe"), null)

for (let n = 0; n < THUMB_LIMIT * 2; n += 1) remember(`f${n}.png`, "x")
assert.equal(THUMBS.size, THUMB_LIMIT)
assert.equal(THUMBS.has("a.pdf"), false, "oldest entries are evicted")

// Re-remembering moves an entry to the back of the eviction queue.
remember(`f${THUMB_LIMIT}.png`, "x")
for (let n = 0; n < THUMB_LIMIT - 1; n += 1) remember(`g${n}.png`, "x")
assert.equal(THUMBS.has(`f${THUMB_LIMIT}.png`), true, "touched entries survive")

console.log("thumbnail check ok")
