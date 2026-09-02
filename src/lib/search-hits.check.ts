/**
 * Self-check for the launcher's supporting logic. Run: npm run check
 *
 * The assertions that matter are the ones about not being annoying: a file name
 * must never be mistaken for a website, a typed line must never end in a dead
 * end, and a walk over someone's Downloads must not offer the same file twice.
 */
import assert from "node:assert/strict"
import {
  asUrl,
  commandTerm,
  deepRoots,
  DEEP_ROOT_CAP,
  fallbacks,
  looksLikePath,
  looksLikeUrl,
  newDeepHits,
  paletteFor,
  parentFolder,
  parentPath,
  webUrl,
  whenBucket,
} from "./search-hits.ts"
import type { Alcove, DesktopIcon } from "../types.ts"

// --- command mode ---

assert.equal(commandTerm("notes"), null, "an ordinary search is not a command")
assert.equal(commandTerm(">"), "", "a bare > asks for the whole palette")
assert.equal(commandTerm("> wall "), "wall")
assert.equal(commandTerm("  >set"), "set", "leading space still opens the palette")
assert.ok(paletteFor("").length >= 5, "a bare > lists the whole palette")
assert.deepEqual(
  paletteFor("wallpaper").map((entry) => entry.command),
  ["wallpaper"],
)
assert.equal(paletteFor("zzz").length, 0, "a command that does not exist shows nothing")

// --- what a typed line means ---

assert.ok(looksLikePath("C:\\Users\\me"))
assert.ok(looksLikePath("c:/users/me"))
assert.ok(looksLikePath("\\\\server\\share"))
assert.ok(looksLikePath("%APPDATA%\\Alcove"))
assert.ok(looksLikePath("~/Downloads"))
assert.equal(looksLikePath("report"), false)
assert.equal(looksLikePath("C:"), false, "a bare drive letter is not a path to open")

assert.ok(looksLikeUrl("https://anthropic.com"))
assert.ok(looksLikeUrl("www.example.co.uk"))
assert.ok(looksLikeUrl("example.com/pricing"))
assert.equal(looksLikeUrl("my notes.com"), false, "a space rules out a URL")
assert.equal(looksLikeUrl("notes.md"), false, "a file name is not a website")
assert.equal(looksLikeUrl("setup.exe"), false)
assert.equal(looksLikeUrl("photo.jpeg"), false)
assert.equal(looksLikeUrl("report"), false, "one word with no dot is not a website")

assert.equal(asUrl("example.com"), "https://example.com", "a bare host gets a scheme")
assert.equal(asUrl("http://example.com"), "http://example.com", "an explicit scheme is kept")
assert.ok(webUrl("tax return 2026").includes("tax%20return%202026"))

// --- fallbacks ---

assert.deepEqual(fallbacks("   "), [], "an empty box offers nothing to run")
for (const query of ["report", "C:\\Users\\me", "example.com", "a long sentence typed by mistake"]) {
  assert.ok(
    fallbacks(query).length > 0,
    `"${query}" must never end in a dead end`,
  )
  assert.ok(
    fallbacks(query).some((item) => item.id === "web"),
    "the web is always the last resort",
  )
}
assert.equal(fallbacks("C:\\Users\\me")[0].id, "open-path")
assert.equal(fallbacks("example.com")[0].id, "open-url")
assert.equal(fallbacks("notepad")[0].id, "run")
assert.equal(
  fallbacks("two words").some((item) => item.id === "run"),
  false,
  "Run is not offered for something the shell could only reject",
)
assert.equal(
  fallbacks("example.com")[0].target,
  "https://example.com",
  "the row opens the URL it says it will",
)

// --- how recent a row is ---

const now = new Date("2026-09-02T14:30:00").getTime()
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

assert.equal(whenBucket(now - HOUR, now), "time", "today is a clock time")
assert.equal(whenBucket(new Date("2026-09-02T00:00:00").getTime(), now), "time")
assert.equal(whenBucket(new Date("2026-09-01T23:59:00").getTime(), now), "yesterday")
assert.equal(whenBucket(now - 3 * DAY, now), "weekday")
assert.equal(whenBucket(now - 30 * DAY, now), "date")
assert.equal(whenBucket(new Date("2025-12-30T10:00:00").getTime(), now), "year")
assert.equal(whenBucket(null, now), "none")
assert.equal(whenBucket(undefined, now), "none")
assert.equal(whenBucket(Number.NaN, now), "none")

// --- where a deep hit came from ---

assert.equal(parentFolder("C:\\Users\\me\\Downloads\\tax.pdf"), "Downloads")
assert.equal(parentFolder("C:/Users/me/Downloads/tax.pdf"), "Downloads")
assert.equal(parentFolder("tax.pdf"), "", "a bare name has no folder to name")
assert.equal(parentFolder(undefined), "")

assert.equal(parentPath("C:\\Users\\me\\Downloads\\tax.pdf"), "C:\\Users\\me\\Downloads")
assert.equal(parentPath("C:/Users/me/tax.pdf"), "C:/Users/me")
assert.equal(parentPath("C:\\tax.pdf"), "C:", "the drive root is still a folder to open")
assert.equal(parentPath("tax.pdf"), "", "a bare name has no folder, so Shift+Enter does nothing")
assert.equal(parentPath(undefined), "")

// --- which folders get walked ---

function drawer(id: string, folderPath?: string | null): Alcove {
  return {
    id,
    name: id,
    color: "slate",
    collapsed: false,
    isInbox: false,
    order: 0,
    page: 0,
    folderPath: folderPath ?? null,
  }
}

assert.deepEqual(
  deepRoots([drawer("a", "C:\\Downloads"), drawer("b"), drawer("c", "C:\\Docs")]),
  ["C:\\Downloads", "C:\\Docs"],
  "only live-folder drawers are walked",
)
assert.deepEqual(
  deepRoots([drawer("a", "C:\\Downloads"), drawer("b", "c:\\downloads")]),
  ["C:\\Downloads"],
  "Windows paths differ only in case, so the same tree is never walked twice",
)
assert.equal(
  deepRoots(Array.from({ length: 20 }, (_, i) => drawer(`d${i}`, `C:\\f${i}`))).length,
  DEEP_ROOT_CAP,
  "roots are capped — they all share one time budget",
)

// --- deep hits never duplicate a drawer's own listing ---

function file(path: string): DesktopIcon {
  return {
    id: path,
    name: path.split("\\").pop() ?? path,
    kind: "document",
    alcoveId: null,
    groupHint: "documents",
    path,
  }
}

const known = [file("C:\\Downloads\\tax.pdf")]
const deep = [
  file("C:\\Downloads\\tax.pdf"),
  file("C:\\Downloads\\2025\\tax.pdf"),
  file("C:\\Downloads\\2025\\tax.pdf"),
]
assert.deepEqual(
  newDeepHits(known, deep).map((icon) => icon.path),
  ["C:\\Downloads\\2025\\tax.pdf"],
  "the drawer's own copy wins, and the walk never repeats itself",
)
assert.deepEqual(
  newDeepHits([file("c:\\downloads\\TAX.pdf")], [file("C:\\Downloads\\tax.pdf")]),
  [],
  "the same file in different letter case is still the same file",
)

console.log("search-hits.check ok")
