# Wallpaper feature ideas

Candidates for the empty desktop space Alcove clears.

Mockups: **8** (interactive) https://claude.ai/code/artifact/57d7dea3-ef21-466b-a522-e3eb504d81d5
· **5**, and the dead version of 4: https://claude.ai/code/artifact/a1755260-20ef-4275-afa4-0e29d18b7eff

All of them reuse the existing glass language (black/35 panels, white/15 borders,
chips, accent bars) — no new visual system needed.

The through-line: move from **organizing icons** to **owning file flow** —
inbound (auto-filing, live folders) and outbound (frequent strip, launcher).

**Three tests every idea on this page has to pass.** Each one has already killed
a version of something below:

1. **Where does the content come from?** If the answer is "the user opens
   Explorer first", the feature is circular and Explorer already won. (Killed
   the original #4.)
2. **Why not just use the thing that exists?** Name the specific advantage. If
   the only answer is "ours looks nicer", it is not a feature.
3. **Is the space actually free when the feature needs it?** Drawers over 12
   items open as a canvas that fills the screen, so "the empty desktop" is
   occupied precisely during the moments you were counting on it. (Killed the
   original #8.)

Ideas are grouped by how long they hold the space: **temporary** ones borrow it
and give it back, **permanent** ones must earn the right to sit there forever.

## 4. Drill-down inside a drawer (no wallpaper space at all)

*(Rewritten. The original "Peek Portals" pitch — drag a folder onto the wallpaper
and it opens as a floating translucent grid — is dead. See the post-mortem below;
what survives is the part that had a real source.)*

A live-folder drawer is currently a dead end at depth one: it lists subfolders,
and clicking one calls `open_desktop_item`, which ejects you into Explorer.
Drilling in should stay inside the drawer.

- **Open:** click a subfolder *already shown in a drawer*. No new gesture, no new
  surface — the contents replace in place.
- **Breadcrumb header:** `Downloads / installers · 14 items`, each crumb clickable.
- **Back:** `Backspace`, or click a crumb. Closing the drawer resets to its root.
- **Escape hatch at every level:** `Enter` (or a header button) opens the current
  folder in Explorer.
- **Build note:** cheap now that live folders shipped. A `folderPath` cursor per
  open drawer, `list_folder_icons` on the new path, and `FolderItems` renders it
  unchanged in icons/list/details.

### Why this beats Explorer (and why the original didn't)

The killer question for the original was **where does the folder come from?**
Only three answers exist, and two are fatal: from Explorer (circular — you're
already there, just double-click it), or loose on the wallpaper (Alcove's entire
job is that there are none left). The only real source is *a folder already
inside a drawer* — which makes the drag-onto-wallpaper gesture a solution to a
problem nobody has, and turns the whole idea into ordinary drill-down navigation.

Reframed that way it wins on exactly two things, and should not claim more:

1. **No window to close.** "What's in here?" and "grab one file out of here" are
   look-and-leave actions. Explorer charges a window, a taskbar button, an
   alt-tab slot and a close click for a two-second look.
2. **Same plane as the drawers.** Dragging a file from a nested folder into an
   Alcove is one gesture on one surface. With Explorer it is window-juggling over
   the desktop layer — and Explorer structurally *cannot* fix this, because
   Alcove lives beneath it. This is the one advantage no Explorer release can
   take away.

**What it must not become:** a file manager. Explorer keeps winning copy, rename,
multi-select, and properties, and chasing that is a losing fight against a team
of hundreds. The split is: Alcove handles the glance and the grab, Explorer
handles the work — and the exit is always one keystroke away.

## 5. Scratch Shelf (permanent)

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

## 6. Frequent strip (permanent, top or bottom edge)

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

## 7. Drawer canvas — groups in rows (temporary)

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

## 8. The rail as drag furniture (temporary)

Mockup: https://claude.ai/code/artifact/57d7dea3-ef21-466b-a522-e3eb504d81d5

The rail is a good *resting* shape and a bad *aiming* shape. While you drag it
becomes the aiming shape — wide, contiguous, welded to the screen edge — and
snaps back on release. Nothing persists.

The feature is **two halves**, and only one of them touches the canvas.

### Half A — contiguous edge hit-zones (always on, free)

This is where nearly all the ergonomic win lives, and it changes no pixels.

- **Contiguity is the real win, not size.** Rail icons sit 9px apart today, and a
  miss between two of them is not a no-op — it is a file that silently went to
  the neighbour and has to be hunted down later. From the first frame of a drag,
  each row's hit band grows to meet its neighbours: every pixel of the rail
  belongs to some drawer, with nothing to fall between.
- **The edge does the rest.** A target welded to the screen edge is effectively
  infinite on that axis — throw the pointer left as hard as you like and it stops
  there. That is why the taskbar and the Start button feel effortless. Treat
  everything left of the rail's right edge as a hit, so overshoot is free.
- **A faint cue on drag start** tells you the rail is live without widening it.

### Half B — widening, for reading not aiming (gated, cosmetic)

- **Its only job is labelling:** "which drawer am I about to drop into?" It
  waits until the pointer is at the rail's doorstep — by which point Half A would
  have caught the drop anyway. **The widening confirms; it never assists.**
- **The threshold hugs the rail, it is not an approach corridor.** Canvas group
  content starts ~102px from the desk edge while the narrow rail ends at 76, so a
  generous trigger would swallow exactly what you were aiming at. Expand at ~108;
  collapse at ~260, past the *widened* rail's own edge, so it never shuts while
  you are standing on it. The gap between the two is hysteresis — one threshold
  makes the rail flicker open and shut as you drag along it.
- **Travel guard.** A file in the leftmost column starts already inside the
  trigger zone, so the rail would pop open the moment you picked it up and cover
  the area you are dragging *from*. Stay shut until the pointer has moved ~40px.
- **Overlay, never push.** If it pushed, the canvas would reflow mid-drag and the
  tile under the user's hand would move — the one thing a drag cannot survive.
- **It only ever grows toward you.** Edge-anchored, expanding rightward, row
  positions fixed vertically. The target gets bigger in your direction and never
  moves away, which is the usual failure of animated targets.
- **Take the hit rect from the intended state, not the animating one,** or the
  hit area lags the visual for the length of the transition. When the rail is
  visibly covering a group row, the rail wins the drop: visual truth and hit
  truth must agree.

### Common to both

- **Suggested row is pre-lit,** learned from where the last file like this went.
  It never snaps or auto-drops: if the hint is ever something you have to fight,
  it is worse than no hint. Dropping anywhere else must stay exactly as easy.
- **`Esc` cancels.** There is no way to abort a drag today, and a feature that
  encourages bigger, more confident gestures should let you change your mind.
- **Build note:** drop resolution needs no changes — the hook already resolves
  `[data-alcove-id]` under the pointer; the bands are a hit-test detail on top.
- **Fallback if occlusion still bites:** expand only the *hovered* row as a
  flyout — one 52px strip instead of the full-height rail. Since the widening is
  only labelling, naming the row you are actually on may be sufficient.

### Why this replaced the wallpaper version

The first pass projected big targets onto empty desktop space. That fails on its
own terms: drawers over 12 items open as a **canvas that fills the screen** (#7),
so the free space is occupied exactly when you would be dragging. The feature
would almost never fire.

The rail was always the right place — and it is also the *better* place. The
wallpaper put targets mid-screen, demanding precise aim in two dimensions; the
rail asks for one (slam left, then get the vertical right).

Two things fall out of the correction:

- **Scope shrinks, honestly.** Filing *within* an open drawer already works —
  canvas group rows are big contiguous targets. All that is left is moving an
  item *out* to a different drawer. Smaller feature, cleaner.
- **Parking is deleted.** It was a wallpaper concept and there is no wallpaper to
  put it on. Inbox is already the first row and already means "undecided", so a
  hold zone would duplicate it — unless the Scratch Shelf (#5) ships with real
  expiry, which is what would make it distinct.

### Revision 2: the widening was never the hit win

A widened rail covers ~160px of every canvas group row — including the row labels
at the left, which is exactly where you aim to identify a row. Chasing that
conflict exposed a bigger error: **once a target is at the screen edge, its width
barely matters**, because you can already slam the pointer into it. What makes
rail drops hard is *vertical* — 56px rows with 9px gaps.

So the Fitts's-law argument I used to sell the widening was double-counting the
edge, and the honest split is Half A / Half B above: contiguity and the edge do
the work for free, and the widening is demoted to labelling and gated so it stops
covering the thing you might be aiming at instead.

## 9. Today row — recent, which is not the same as frequent (permanent)

The frequent strip (#6) holds the things you open over and over. It will never
hold the contract you were editing twenty minutes ago and will never open again
after Friday — and that file is the one you actually hunt for.

- **Time-boxed, not ranked.** Files touched today, oldest dropping off at
  midnight. No slots, no hysteresis.
- **Churn is correct here.** #6 fights churn because a launcher must hold still
  for muscle memory. This list is inherently volatile, and pretending otherwise
  would be dishonest — so it is labelled by time (`Today`, `Yesterday`) and never
  claims a stable position.
- **Source:** `modifiedAt` is already harvested for live folders, and opens are
  already tracked by frecency. No new plumbing.
- **Why not Explorer's Quick Access:** it exists, but it is *inside* an Explorer
  window — you pay the window to read it — and it is polluted with system noise.
  Ambient on the desktop is the whole difference.
- **Risk:** two horizontal strips is one too many. Probably shares the strip
  surface with #6 as a second row that only appears on days you touched things,
  or the two become tabs on one bar.

## 10. Zero-inbox wallpaper (permanent, usually empty)

The one thing the old Windows desktop got right: a file you have not dealt with
sits in your way. Alcove currently sends new arrivals to an Inbox drawer with a
badge — and a badge is as easy to ignore forever as an unread email count.

- **Unfiled items live on the wallpaper.** New files in watched folders appear as
  real icons in the cleared space, and *only* those. Filing one removes it.
- **Empty means done.** The wallpaper stops being a leftover and becomes a status
  readout: a clear desktop is proof there is nothing to decide, not just proof
  you ran the organiser once.
- **Capped.** Show ~12, then a `+N more` chip, so a bad day cannot recreate the
  clutter Alcove removed.
- **Why not the Inbox drawer we already have:** the drawer is a place you have to
  remember to visit. Physical occupancy of the space you cleared creates the
  pressure to file; that pressure is the product.
- **Risk:** this is the highest-risk idea here, because done badly it is just the
  old desktop with extra steps. It only works if auto-filing rules are good
  enough that the common case really is an empty wallpaper.

## Rejected, with reasons

Written down so they stop coming back:

- **Clock / weather / system-monitor widgets.** Windows and Rainmeter own this,
  it is a maintenance treadmill, and it makes the clean desktop noisy again —
  which is the one thing Alcove sells.
- **Sticky notes.** Windows Sticky Notes exists and is fine.
- **Window snap zones.** Out of scope; Alcove is a desktop layer, not a window
  manager, and FancyZones already does it.
- **Two-up drawer compare.** The rail already accepts a drop onto any drawer from
  anywhere, so a side-by-side view adds layout work and no new capability.
- **A floating folder portal on the wallpaper** (the original #4). No source for
  the gesture — see the post-mortem in #4.
- **Drop targets projected onto the wallpaper** (the original #8). The space is
  occupied by an open canvas exactly when you would be dragging, and mid-screen
  targets are harder to hit than edge ones anyway. See the post-mortem in #8.

## Status

- **4, 5, 8, 9, 10** — not built.
- **6, 7** — implemented. Frecency and slot logic in `src/lib/frecency.ts`
  (self-check: `npm run check`), strip in `src/components/frequent-strip.tsx`,
  canvas in `src/components/alcove-canvas.tsx`.
- **Live folders** — implemented since these notes began (`list_folder_icons`,
  `folderPath` on an Alcove, icons/list/details views), which is what makes #4
  cheap and #9 nearly free.
