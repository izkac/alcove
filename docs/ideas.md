# Wallpaper feature ideas

Candidates for the empty desktop space Alcove clears. Mockups for 4 and 5:
https://claude.ai/code/artifact/a1755260-20ef-4275-afa4-0e29d18b7eff

All of them reuse the existing glass language (black/35 panels, white/15 borders,
chips, accent bars) — no new visual system needed.

The through-line: move from **organizing icons** to **owning file flow** —
inbound (auto-filing, live folders) and outbound (frequent strip, launcher).

## 4. Peek Portals

Drop a folder anywhere on the wallpaper and its contents open **in place** — a
translucent, borderless grid. No Explorer window, no chrome.

- **Open:** drag a folder onto empty wallpaper (same drag used between Alcoves).
- **Frame:** centered glass panel with a cyan edge marking it as transient.
  Breadcrumb header (`Desktop / Projects · 14 items`), subfolder tiles tinted cyan.
- **Drill in:** click a subfolder → contents replace the grid in the same frame.
- **Dismiss:** click the wallpaper — the portal evaporates. Nothing to close, ever.
- **Keys:** double-click opens a file · `Enter` opens the folder in Explorer ·
  `Backspace` goes up a level.
- **Build note:** this is the AlcoveChip peek-popover grown up — same component
  pattern, re-parented onto the wallpaper, backed by a real directory listing.

## 5. Scratch Shelf

A dashed drop-zone that embraces what desktops are actually used for: dumping.
Anything left on it quietly expires to the Inbox after seven days.

- **Look:** dashed amber border, faint amber tint, deliberately *not* glassy —
  reads as a workbench, not a home. Amber marks the whole expiry system.
- **Expiry badge per item:** grey countdown (`6d`, `4d`) → amber under 48h
  (`2d`, `1d`) → solid amber `today`, with the tile fading out.
- **Expiry is an event, not a loss:** items move to **Inbox** — never deleted —
  with a toast (`filed to Inbox after 7 days · Undo`).
- **Reset:** opening or dragging an item resets its seven-day clock.
- **Build note:** one special Alcove with a timestamp per item and a daily sweep.

## 6. Frequent strip (top of screen)

A row of the things you actually open, auto-filled and auto-maintained, pinned to
the top edge — the wallpaper's other free edge, opposite the taskbar.

The whole design problem is **churn**: if icons reshuffle every time counts
change, muscle memory dies and the strip feels haunted. So it is slot-based, not
rank-based:

- **Fixed slots** (8). An item that earns a slot **keeps its position** even as
  ranks move underneath it. Order means "when you earned this slot", not live rank.
- **Hysteresis on eviction.** A challenger only takes a slot when it clearly
  out-scores the weakest incumbent (1.5×). One icon changes; the other seven
  stay exactly where they were.
- **Frecency, not raw counts.** Opens decay with a ~14-day half-life, so the app
  you hammered during one project stops squatting once the project ends.
- **Manual override beats both.** *Keep* locks a slot (never evicted); *hide*
  bans an item from the strip forever. The hybrid beats pure-auto and
  pure-manual.
- **No chrome.** Same chip/glass language as the rail, no header, no close
  button; hidden entirely until there is something to show.

## 7. Drawer canvas — groups in rows

A drawer with 57 apps in a 6-wide panel is a scroll well. Large drawers should
open across the empty wallpaper that Alcove just cleared, and let the user shape
the inside.

- **Two open modes.** *Panel* (today's small floating grid — right for
  Documents-6) and *canvas*, which expands across the free desktop area. Drawers
  over ~12 items open as canvas by default; either mode can be forced per drawer.
- **Groups render as rows, top to bottom.** A named header ("Dev", "Adobe",
  "Games") plus a wrapping icon grid. Reorder the rows; the order is the user's.
- **Works before curation.** Anything ungrouped sits in an "Everything else" row
  at the bottom, so a fresh drawer is useful on day one and groups are opt-in.
- **Drag between rows.** Drop an icon on a group row to file it there — same
  pointer-drag already used between drawers.
- **Still not a window.** No chrome, no close button; it renders on the wallpaper
  and click-away dismisses. The rail stays home; the canvas is always a visitor.
  If users start leaving it open, we have reinvented the cluttered desktop.

## Status

- **4, 5** — mockups only, no code.
- **6, 7** — implemented. Frecency and slot logic in `src/lib/frecency.ts`
  (self-check: `npm run check`), strip in `src/components/frequent-strip.tsx`,
  canvas in `src/components/alcove-canvas.tsx`.
