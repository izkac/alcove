import type { FrecencyEntry } from "@/types"

/** Slots the frequent strip starts with. Settings can change it. */
export const TOP_SLOTS = 8

/** Below this the strip is not worth the screen edge it occupies. */
export const TOP_SLOTS_MIN = 3

/**
 * Past this the strip stops being "the things you actually open" and turns into
 * a second desktop — which is the clutter Alcove exists to remove. It is also
 * one centred row on a screen edge, so it physically runs out of room.
 */
export const TOP_SLOTS_MAX = 16

export function clampSlotCount(count: number | undefined | null): number {
  if (typeof count !== "number" || !Number.isFinite(count)) return TOP_SLOTS
  return Math.min(TOP_SLOTS_MAX, Math.max(TOP_SLOTS_MIN, Math.round(count)))
}

/**
 * Grow or shrink the strip without disturbing what stays. Holding still is the
 * strip's whole point, so growing only appends empty slots and shrinking only
 * drops from the end — nothing that keeps its place ever changes index.
 */
export function resizeSlots(
  slots: (string | null)[],
  count: number | undefined | null,
): (string | null)[] {
  return Array.from({ length: clampSlotCount(count) }, (_, index) => slots[index] ?? null)
}

/** Opens lose half their weight every two weeks, so old habits fade out. */
const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000

/**
 * A challenger must beat the weakest incumbent by this much to take its slot.
 * Without the margin, two items with near-equal scores trade places on every
 * open and the strip flickers.
 */
const CHALLENGE_RATIO = 1.5

export type Frecency = Record<string, FrecencyEntry>

export function scoreAt(entry: FrecencyEntry | undefined, now: number): number {
  if (!entry) return 0
  const elapsed = Math.max(0, now - entry.at)
  return entry.score * Math.pow(0.5, elapsed / HALF_LIFE_MS)
}

export function recordOpen(frecency: Frecency, id: string, now: number): Frecency {
  return { ...frecency, [id]: { score: scoreAt(frecency[id], now) + 1, at: now } }
}

type SlotOptions = {
  now: number
  /** Ids still present on the desktop; anything else is dropped from a slot. */
  exists: (id: string) => boolean
  keep: string[]
  hide: string[]
}

/**
 * Re-seats the frequent strip. Incumbents keep their index — the only movement
 * is an empty slot being filled, or one clear challenger displacing one loser.
 */
export function refreshSlots(
  slots: (string | null)[],
  frecency: Frecency,
  { now, exists, keep, hide }: SlotOptions,
): (string | null)[] {
  const hidden = new Set(hide)
  const locked = new Set(keep)
  const seen = new Set<string>()

  // The array carries the size — Settings resizes it, this only re-seats it.
  const size = slots.length > 0 ? slots.length : TOP_SLOTS
  const next: (string | null)[] = Array.from({ length: size }, (_, index) => {
    const id = slots[index] ?? null
    if (!id || hidden.has(id) || seen.has(id) || !exists(id)) return null
    seen.add(id)
    return id
  })

  const candidates = Object.keys(frecency)
    .filter((id) => !seen.has(id) && !hidden.has(id) && exists(id))
    .map((id) => ({ id, score: scoreAt(frecency[id], now) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))

  let pending = 0
  for (let index = 0; index < next.length && pending < candidates.length; index += 1) {
    if (next[index] !== null) continue
    next[index] = candidates[pending].id
    pending += 1
  }

  // Candidates are sorted, so the first one that cannot win ends the round.
  for (; pending < candidates.length; pending += 1) {
    const challenger = candidates[pending]
    let weakest = -1
    let weakestScore = Infinity
    for (let index = 0; index < next.length; index += 1) {
      const id = next[index]
      if (!id || locked.has(id)) continue
      const score = scoreAt(frecency[id], now)
      if (score < weakestScore) {
        weakest = index
        weakestScore = score
      }
    }
    if (weakest < 0 || challenger.score < weakestScore * CHALLENGE_RATIO) break
    next[weakest] = challenger.id
  }

  return next
}

/** Drops history for icons that are gone, so the store cannot grow forever. */
export function pruneFrecency(frecency: Frecency, exists: (id: string) => boolean): Frecency {
  const kept = Object.keys(frecency).filter(exists)
  if (kept.length === Object.keys(frecency).length) return frecency
  return Object.fromEntries(kept.map((id) => [id, frecency[id]]))
}

/**
 * How much a launcher result's text match is worth once we know how often it is
 * actually opened. Multiplied into the fuzzy match score, so a non-match stays a
 * non-match — frecency only settles ties and near-ties, it never lets a poor
 * match beat a good one.
 */
export function rankLaunch(match: number, frecencyScore: number): number {
  if (match <= 0) return 0
  const boost = 1 + 0.6 * (1 - Math.pow(0.5, Math.max(0, frecencyScore) / 4))
  return match * boost
}
