/**
 * Self-check for the launcher's empty state and result ranking.
 * Run: npm run check
 *
 * The launcher is the one place that competes head-on with the Start menu, and
 * the only thing it can win on is knowing what you actually open. So the
 * assertions are about that: frecency settles ties but never beats a clearly
 * better match, and Today does not fill with shortcuts installed months ago.
 */
import assert from "node:assert/strict"
import { rankLaunch, recordOpen, type Frecency } from "./frecency.ts"
import { HOME_LIMIT, homeOrder, launcherHome } from "./launcher.ts"
import type { DesktopIcon, IconKind } from "../types.ts"

const now = new Date("2026-08-31T14:00:00").getTime()
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function icon(id: string, kind: IconKind, modifiedAt?: number): DesktopIcon {
  return {
    id,
    name: id,
    kind,
    alcoveId: "docs",
    groupHint: "documents",
    path: `C:\\${id}`,
    modifiedAt: modifiedAt ?? null,
  }
}

function opens(store: Frecency, id: string, times: number, at = now): Frecency {
  let next = store
  for (let i = 0; i < times; i += 1) next = recordOpen(next, id, at)
  return next
}

// --- ranking ---

assert.equal(rankLaunch(0, 999), 0, "frecency never rescues a non-match")
assert.equal(rankLaunch(1, 0), 1, "a cold exact match is unchanged")
assert.ok(rankLaunch(1, 20) > rankLaunch(1, 0), "opening something lifts it")
assert.ok(
  rankLaunch(0.9, 20) > rankLaunch(1, 0),
  "a near-match you use daily beats an exact match you never open",
)
assert.ok(
  rankLaunch(0.5, 999) < rankLaunch(1, 0),
  "but a poor match never beats a good one, however hot it is",
)
assert.ok(rankLaunch(1, 999) <= 1.6, "the boost is bounded")

// --- empty state ---

const icons = [
  icon("chrome.lnk", "app", now - 200 * DAY),
  icon("shortcut.lnk", "shortcut", now - HOUR),
  icon("contract.docx", "document", now - 2 * HOUR),
  icon("notes.md", "document", now - 30 * 60 * 1000),
  icon("old.pdf", "document", now - 3 * DAY),
  icon("nostamp.txt", "document"),
]

const home = launcherHome(icons, {}, [], now)
assert.deepEqual(
  home.today.map((item) => item.id),
  ["notes.md", "contract.docx"],
  "today is today's documents, newest first",
)
assert.equal(
  home.today.some((item) => item.kind === "app" || item.kind === "shortcut"),
  false,
  "a .lnk's timestamp is its install date — apps never belong in Today",
)

// A file modified at 23:59 yesterday is not today, however recent it feels.
const lateLastNight = new Date("2026-08-30T23:59:00").getTime()
assert.equal(
  launcherHome([icon("late.txt", "document", lateLastNight)], {}, [], now).today.length,
  0,
  "Today ends at midnight, not 24 hours ago",
)

// A clock that jumped backwards must not surface files "modified in the future".
assert.equal(
  launcherHome([icon("future.txt", "document", now + DAY)], {}, [], now).today.length,
  0,
)

// Frequent fills the rest, and never repeats what Today already shows.
let frecency: Frecency = {}
frecency = opens(frecency, "chrome.lnk", 9)
frecency = opens(frecency, "notes.md", 7)
frecency = opens(frecency, "old.pdf", 3)
const withHistory = launcherHome(icons, frecency, [], now)
assert.deepEqual(
  withHistory.frequent.map((item) => item.id),
  ["chrome.lnk", "old.pdf"],
  "frequent is ranked by frecency and skips anything already in Today",
)

// "Never show here" applies to both halves.
const hidden = launcherHome(icons, frecency, ["notes.md", "chrome.lnk"], now)
assert.equal(
  [...hidden.today, ...hidden.frequent].some((item) =>
    ["notes.md", "chrome.lnk"].includes(item.id),
  ),
  false,
)

// Nothing opened and nothing touched today is an honestly empty launcher.
assert.deepEqual(launcherHome([icon("a.txt", "document", now - 9 * DAY)], {}, [], now), {
  today: [],
  frequent: [],
})

// The flat order is what the number keys fire, so it can never exceed nine.
const many = Array.from({ length: 40 }, (_, i) => icon(`f${i}.txt`, "document", now - HOUR))
let heavy: Frecency = {}
for (const item of many) heavy = opens(heavy, item.id, 5)
const big = launcherHome(many, heavy, [], now)
assert.equal(homeOrder(big).length, HOME_LIMIT)
assert.equal(new Set(homeOrder(big).map((i) => i.id)).size, HOME_LIMIT, "no duplicates")

console.log("launcher.check ok")
