---
name: Alcove
description: A calmer Windows desktop. Surfaces take their light and tint from the wallpaper they sit on.
colors:
  surface-slate: "oklch(24% var(--sc) var(--wp-h))"
  surface-slate-raised: "oklch(29% var(--sc) var(--wp-h))"
  surface-slate-field: "oklch(34% var(--sc) var(--wp-h))"
  ink-on-slate: "oklch(94% var(--ic) var(--wp-h))"
  ink-muted-on-slate: "oklch(68% var(--ic) var(--wp-h))"
  ink-faint-on-slate: "oklch(52% var(--ic) var(--wp-h))"
  hairline-on-slate: "oklch(100% 0 0 / 0.11)"
  selection-on-slate: "oklch(78% 0.1 var(--wp-h))"
  surface-paper: "oklch(94.5% var(--sc) var(--wp-h))"
  surface-paper-raised: "oklch(90% var(--sc) var(--wp-h))"
  surface-paper-field: "oklch(85.5% var(--sc) var(--wp-h))"
  ink-on-paper: "oklch(24% var(--ic) var(--wp-h))"
  ink-muted-on-paper: "oklch(48% var(--ic) var(--wp-h))"
  ink-faint-on-paper: "oklch(63% var(--ic) var(--wp-h))"
  hairline-on-paper: "oklch(20% 0.04 var(--wp-h) / 0.12)"
  selection-on-paper: "oklch(50% 0.16 var(--wp-h))"
  on-wallpaper: "oklch(99% 0 0)"
  home-veil-on-slate: "oklch(100% 0 0 / 0.12)"
  home-veil-on-paper: "oklch(18% 0.04 var(--wp-h) / 0.11)"
  dock-on-slate: "oklch(96% 0.02 var(--wp-h) / 0.16)"
  dock-on-paper: "oklch(18% 0.04 var(--wp-h) / 0.18)"
  destructive-on-slate: "oklch(72% 0.17 25)"
  destructive-on-paper: "oklch(55% 0.2 25)"
typography:
  title:
    fontFamily: "Geist Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.35
  body:
    fontFamily: "Geist Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
  meta:
    fontFamily: "Geist Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.3
  label:
    fontFamily: "Geist Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.25
  heading-eyebrow:
    fontFamily: "Geist Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    letterSpacing: "0.08em"
rounded:
  control: "8px"
  tile: "10px"
  roundel: "12px"
  sheet: "14px"
  pill: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  rail:
    backgroundColor: "{colors.dock-on-slate}"
    width: "72px"
  rail-roundel:
    backgroundColor: "transparent"
    rounded: "{rounded.roundel}"
    size: "48px"
  rail-roundel-active:
    backgroundColor: "{colors.selection-on-slate}"
    rounded: "{rounded.roundel}"
    size: "48px"
  sheet:
    backgroundColor: "{colors.surface-slate}"
    textColor: "{colors.ink-on-slate}"
    rounded: "{rounded.sheet}"
  strip-pill:
    backgroundColor: "{colors.dock-on-slate}"
    rounded: "{rounded.pill}"
    padding: "6px 8px"
  icon-tile:
    rounded: "{rounded.tile}"
    padding: "6px 4px"
    typography: "{typography.label}"
  icon-tile-selected:
    backgroundColor: "{colors.selection-on-slate}"
    rounded: "{rounded.tile}"
  filter-field:
    backgroundColor: "{colors.surface-slate-raised}"
    textColor: "{colors.ink-on-slate}"
    rounded: "{rounded.control}"
    height: "32px"
    typography: "{typography.body}"
  icon-button:
    textColor: "{colors.ink-muted-on-slate}"
    rounded: "{rounded.control}"
    size: "28px"
  icon-button-hover:
    backgroundColor: "{colors.surface-slate-raised}"
    textColor: "{colors.ink-on-slate}"
    rounded: "{rounded.control}"
    size: "28px"
---

# Design System: Alcove

## 1. Overview

**Creative North Star: "The Desk Takes the Room's Light"**

Alcove is not an app that sits on top of Windows; it is the desktop. So it has no
colour of its own. Every surface reads the wallpaper behind it and answers in
kind: a light wallpaper gets paper, a dark one gets slate, and both lean toward
the wallpaper's dominant colour. How far they lean is the wallpaper's own
saturation: a grey photo keeps neutral surfaces, a vivid blue gets paper that is
plainly pale blue. Paper is never white; it sits at 94.5% lightness so it reads
as a surface, not as glare. The result should feel like a well-made desk in
whatever room the user has, never like a foreign window pasted over their
picture. Three numbers make this work, `--wp-h` (hue), `--wp-c` (chroma) and
`--wp-l` (lightness), set on `<html>` once the wallpaper has been sampled. The
surface lightness `--surf-l` sits a fixed step above `--wp-l`, `--sc` and `--ic`
derive the surface and ink chroma from `--wp-c`, and every colour below is a
function of those. The wallpaper can be changed from Alcove's own right-click
menu, and every desk re-samples and re-tints when it is.

Home chrome is the exception to "one step lighter." The rail stays on screen all
day, so a 72px column of paper or slate, even one tinted to the wallpaper, reads
as a window pasted on the picture. Tinted and Blend paint the rail, the strip
and the open drawer with the same see-through wash: the picture shows through,
labels use On Wallpaper contrast, and the rail stays a flush column. The strip
is that paint in a floating pill; the drawer is that paint in a 14px-radius
sheet. **Solid** is the opt-in that paints all three opaque too.

One setting, Surface, decides how far the remaining visitors lean in. **Tinted**
(default) and **Blend** keep rail, strip and drawers in the picture. Blend also
lets the picture through chips and the preview card at 86% opacity. **Solid** is
a fixed paper (94.5%) or slate (24%) on every surface, including home chrome.
It lives on `<html>` as `data-tone`.

Two more settings cover text, and they are the only appearance settings besides
Surface. **Text size** scales the whole type scale through `--text-scale`
(`data-text`), and **Stronger text** (`data-contrast="high"`) moves the muted
inks and the hairline further from the surface. Neither introduces a new colour:
there is deliberately no font-colour picker, because a hand-picked ink loses its
contrast the moment the wallpaper changes.

The second idea is that icons are the interface. The user's real Windows icons
are the only saturated, high-contrast objects on screen. Everything Alcove draws
around them is quiet: the rail, strip and drawers are veils on the picture;
dialogs and menus stay matte surfaces; one selection accent; text in three muted
steps on surfaces, and On Wallpaper on home chrome. A drawer's chosen colour
survives, but on its glyph rather than its whole tile, so a rail of eight drawers
is a column of small tinted marks, not eight coloured blocks.

This system explicitly rejects what PRODUCT.md rejects: Rainmeter and widget
dashboards, Fences-style titled zones, glassmorphism as identity, RGB launcher
aesthetics, Explorer's density, and the flat grid of loose icons that is the
problem being solved. It also rejects blur, glow, gradient text, side-stripe
accents, and any motion that does not confirm something the user just did.

**Key Characteristics:**

- Two palettes, paper and slate, chosen by wallpaper luminance, both tinted by wallpaper hue
- Home chrome (rail, strip, drawers) is a veil on the picture; dialogs and menus stay opaque surfaces
- No backdrop blur anywhere
- One selection accent derived from the wallpaper hue; drawer colours live on glyphs only
- A four-step fixed type scale in one family, with tabular numerals throughout
- Text on bare wallpaper carries its own contrast via a text shadow, never by hoping
- Motion is 150 to 180 ms, ease-out, and only ever a fade with a 3px rise

## 2. Colors

A monochrome system in two lightness registers, warmed or cooled by the wallpaper, with a single accent that is the same hue pushed to saturation.

### Primary
- **Wallpaper Selection** (`oklch(50% 0.16 var(--wp-h))` on paper, `oklch(78% 0.1 var(--wp-h))` on slate): the only accent. Used for the open drawer's roundel ring, selected icon tiles, focus rings, the Inbox count badge, the kept-slot pin, switches, and checkboxes. Its soft form at 13 to 16 percent alpha fills selected tiles. It is never decoration.

### Neutral
- **Paper** (`oklch(var(--surf-l) var(--sc) var(--wp-h))`; Tinted: `--surf-l` is the wallpaper lightness plus 18 points, clamped 66% to 94.5%, and `--sc` is half the wallpaper chroma capped at 0.09; Solid: 94.5% and 0.32 of the chroma capped at 0.05): chips and the preview card on a light wallpaper. Rail, drawers and the strip use Dock instead. Dialogs and menus use **Sheet** instead, so they neither sit in the wallpaper's mud nor glare as Solid paper.
- **Sheet** (`oklch(var(--pop-l) var(--pop-c) var(--wp-h) / 1)`; Tinted paper: lightness clamped 80% to 90% with a little more of the wallpaper chroma; Tinted slate: 26% to 36%; Solid: the Solid surface): dialogs, menus and search. Always opaque.
- **Paper Raised** (`--surf-l` minus 4.5 points): roundels at rest, filter fields, hover fills, the details-view header.
- **Paper Field** (`--surf-l` minus 9 points): segmented controls, count pills, the deepest recess.
- **Slate** (`oklch(var(--surf-l) var(--sc) var(--wp-h))`; Tinted: wallpaper lightness plus 9 points, clamped 20% to 32%, chroma 0.35 of the wallpaper's capped at 0.06; Solid: 24% and 0.2 of the chroma capped at 0.035): every surface on a dark wallpaper, and the default before the wallpaper has been read.
- **Slate Raised** (`--surf-l` plus 5) and **Slate Field** (plus 10): the same two steps up. In slate, elevation is lightness, not shadow.
- **Desk** (`--desk`, the surface colour at `--desk-a` opacity, 1 except 0.86 in Blend): chips and the preview card use this instead of Surface so that Blend can let the wallpaper through without touching dialogs. Drawers use Dock, with the rail and strip.
- **Home** (transparent in Tinted and Blend; equal to Desk in Solid): the rail column. It has no right-edge hairline unless Solid is on.
- **Veil** (`oklch(100% 0 0 / 0.12)` on slate, `oklch(18% 0.04 var(--wp-h) / 0.11)` on paper; Raised on Solid): roundels at rest. Hover bumps the alpha. This is a wash of the picture, not a chip of paper.
- **Dock** (`oklch(96% 0.02 var(--wp-h) / 0.16)` on slate, `oklch(18% 0.04 var(--wp-h) / 0.18)` on paper; Desk on Solid): the rail, the frequent strip, and open drawers. Darker than the wallpaper on paper, lighter on slate, always see-through.
- **Ink** (`oklch(24% var(--ic) var(--wp-h))` on paper, `oklch(94% var(--ic) var(--wp-h))` on slate; `--ic` is a smaller share of the wallpaper chroma, capped at 0.035): titles, icon labels, body copy.
- **Ink Muted** (on paper `--surf-l` minus 40 points, clamped 30% to 48%; on slate 68%): supporting copy on surfaces, icon buttons at rest in dialogs. It moves with the surface so its contrast holds as Tinted darkens the paper.
- **Ink Faint** (on paper `--surf-l` minus 26 points, clamped 42% to 63%; on slate 52%): placeholders, empty-state copy, crumb separators, group-row controls before hover.
- **Hairline** (`oklch(20% 0.04 var(--wp-h) / 0.12)` on paper, `oklch(100% 0 0 / 0.11)` on slate): the one border on visitors. Dialogs, menus, chips. Home chrome uses Dock Line instead.
- **On Wallpaper** (`oklch(99% 0 0)` with `0 1px 2px oklch(0% 0 0 / 0.6)` shadow): labels for parked icons, the Recycle Bin, and home chrome (rail tiles, strip slots, drawer titles and counts) whenever Surface is not Solid.

### Named Rules
**The Borrowed Hue Rule.** No colour in this system has a hue or a saturation of its own. Every neutral, every surface and the accent read `--wp-h` and `--wp-c`. A screenshot of Alcove on two different wallpapers should show two different tints of the same design, and on a grey wallpaper no tint at all.

**The Never White Rule.** Paper tops out at 94.5% lightness, and in the default Tinted tone it sits only 18 points above the wallpaper. Pure white on a saturated wallpaper reads as glare; if a surface looks white, its chroma or lightness is wrong. Light vs dark is the median pixel, so a dark picture with a few bright sparkles stays slate.

**The One Step Rule.** A visitor (a chip, a preview) is the wallpaper one step lighter, in the wallpaper's own colour. Dialogs and menus take a further step: a sheet at 80–90% on paper or 26–36% on slate, so they stay a readable card. Home chrome is not a visitor: it does not take that step, or it reads as a card on top of the picture.

**The Home Chrome Rule.** The rail, the strip and the open drawer are marks on the picture. Their fill is the Dock wash, their edge is a Dock Line, and their labels carry their own contrast the way parked icons do. Dialogs stay surfaces because they cover a choice.

**The Glyph Rule.** A drawer's colour goes on its glyph and its menu dot, at `oklch(56% 0.13 h)` on paper and `oklch(78% 0.1 h)` on slate. It never fills a tile, a ring, a header bar, or a stripe.

**The One Accent Rule.** The selection colour appears on at most a handful of pixels at any time: the open drawer, the selection, the focused control. If two different accents are visible, one of them is a mistake.

## 3. Typography

**Display Font:** Geist Variable (with Segoe UI, system-ui)
**Body Font:** Geist Variable (with Segoe UI, system-ui)
**Label/Mono Font:** none; numerals are tabular everywhere via `font-variant-numeric`

**Character:** One family, five sizes, two weights. Geist is a quiet grotesque that reads well at 11px on a matte surface, which is where most of Alcove's text lives. Nothing here is set to be admired; it is set to be recognised from across the room.

Every size below is `calc(base * var(--text-scale))`, where `--text-scale` is the user's Text size setting: 1 at Default, 1.1 at Large, 1.22 at Larger. Add a new size by adding a token to `@theme inline`, never by writing a literal `text-[13px]` in a component, or it will not scale.

### Hierarchy
- **Title** (500, 15px / 0.9375rem, 1.35): a drawer's name in its header, dialog titles, the empty-desktop headline. The largest text in the product.
- **Body** (400, 13px / 0.8125rem, 1.4): menu items, dialog copy, filter fields, counts beside a title, "New group".
- **Meta** (400, 12px / 0.75rem, 1.3): list-view file names, the preview card's name, chip counts, the bar clock.
- **Label** (400, 11px / 0.6875rem, 1.25): every icon label in every grid, rail labels, strip labels, details-view cells, empty copy. Two lines maximum, clamped.
- **Micro** (400, 10px / 0.625rem, 1.2): the count under a rail tile and the number key in search. The only two places below label size, both of them a bare numeral beside its own label.
- **Eyebrow** (500, 11px, 0.08em tracking, uppercase, On Wallpaper): group headings inside a canvas drawer only.

### Named Rules
**The Eleven Rule.** No text is smaller than 11px, and the only exception is Micro, a bare numeral that always sits beside a full-size label. The old build ran to 9px in the rail; those labels are now 11px and truncate instead of shrinking. There is no smaller stop on the Text size setting for the same reason.

**The Tabular Rule.** Counts, sizes and dates are always tabular numerals so a rail of "Apps · 51" and "Tools · 3" lines up without trying.

## 4. Elevation

Alcove is flat by default. Home chrome is a veil, so the picture shows through
the rail, the strip and the open drawer without blur. The strip's shadow is a
whisper, not a lift; the drawer has none, so it does not sit as a card on the
picture. On slate, dialog depth is lightness, with raised surfaces one step
lighter. Backdrop blur is not used anywhere; a previous system used it on every
panel and it read as generic.

### Shadow Vocabulary
- **Sheet** (`0 16px 48px -16px oklch(0% 0 0 / 0.4)` on paper, `/ 0.5` on slate): unused on drawers now; kept for any future opaque sheet.
- **Pill** (`0 10px 30px -12px oklch(0% 0 0 / 0.4)` / `/ 0.5`): collapsed chips. Not the frequent strip.
- **Dock** (`0 4px 14px -8px oklch(0% 0 0 / 0.14)` on paper, `0 4px 16px -8px / 0.22` on slate; Pill on Solid): the frequent strip. Soft enough that the pill does not float off the picture.
- **Pop** (`0 8px 24px -8px oklch(0% 0 0 / 0.28)` / `/ 0.45`): preview card, popovers, the empty-desktop hint, search.
- **Icon on wallpaper** (`drop-shadow(0 1px 1.5px oklch(0% 0 0 / 0.5))`): parked icons, rail glyphs, and strip icons when Surface is not Solid.

### Named Rules
**The Hairline First Rule.** Every floating *visitor* has a 1px Hairline border. The shadow is secondary and may be missing at small sizes; the hairline may not. Home chrome is not a visitor: its edge is a Dock Line at low alpha, or nothing.

**The No Glass Rule.** `backdrop-filter` is forbidden. Home chrome lets the wallpaper through with plain alpha. Blend does the same for chips and the preview card. Never blur, and never on dialogs or menus.

## 5. Components

### The Rail
- **Character:** a 72px flush column, the same Dock wash as the frequent strip, a Dock Line on the right edge, no rounding and no shadow. It is a strip of the picture, not a floating island.
- **Tile:** 48px roundel (12px radius), empty at rest like a strip slot, Veil Hover on hover. The drawer's glyph at 32px in its tint, stroke 2.5, near-white so it reads on the dock wash. Beneath it the name at 11px On Wallpaper, truncated at 66px, and the count on its own line at 10px at 70% of that.
- **Open drawer:** roundel fills with Selection Soft and gets a 1.5px inset Selection ring. Nothing else changes.
- **Inbox:** an amber-tinted inbox glyph, and a Selection-filled count badge only when the count is above zero.
- **Drag cue:** while an icon is being dragged, the column takes a faint wash. It never widens, and it never becomes Raised paper.
- **Bottom:** New, Search and Settings as 40px ghost icon buttons in On Wallpaper.

### Drawers (panel and canvas)
- **Corner Style:** 14px sheet radius.
- **Background:** Dock, with a Dock Line border and no Sheet shadow. The canvas is inset 24px from the desk on all sides rather than covering it.
- **Header:** a 28 to 32px glyph roundel, the name in Title On Wallpaper, the count in Body On Wallpaper at 70%, then a Veil filter field and ghost icon buttons for edit, delete, compact, and close.
- **Groups (canvas):** an Eyebrow heading in On Wallpaper, a faint count, a Dock Line beneath, and the row's controls hidden until the row is hovered or focused.
- **Internal Padding:** 16px sides, 12px top, 16px bottom; groups are spaced 20px apart.

### Icon tiles
- **Shape:** 10px radius, icon over a two-line 11px label, 6px gap.
- **Hover:** Raised fill on a surface; a 12 percent white fill on wallpaper.
- **Selected:** Selection Soft fill and a 1.5px Selection ring.
- **Focus:** 2px Selection outline, offset 1px.
- **On wallpaper:** label in On Wallpaper with its shadow; icon with the wallpaper drop shadow.

### The Frequent Strip
- **Style:** a 16px-radius pill in Dock, a whisper of an edge, and the Dock shadow, held at the top or bottom edge.
- **Slot:** 66px wide, 34px icon with the wallpaper drop shadow, 11px On Wallpaper label, 10px radius, Veil Hover on hover. A one-pixel Dock Line divides tools from apps. A kept slot shows a 10px Selection pin in its corner.

### Buttons
- **Shape:** 8px radius controls.
- **Primary:** Ink on Surface (inverted), used once per dialog.
- **Ghost / icon buttons:** Ink Muted at rest, Raised fill and Ink on hover, 28 to 40px square.
- **Destructive:** the destructive red at 10 to 20 percent as a fill, never a solid.

### Inputs / Fields
- **Style:** Raised fill, no border at rest, 8px radius, 32px tall, Body size, Ink Faint placeholder.
- **Focus:** Selection border and a 25 percent Selection ring.

### Dialogs, menus, search
- All use the same Surface (Paper) or Raised (Slate) background with a hairline ring and the Pop shadow, through the shadcn tokens `--popover`, `--border`, `--muted`, `--ring`, which are mapped to this system.

## 6. Do's and Don'ts

### Do:
- **Do** derive every colour from `--wp-h`; add a new token by editing `index.css`, never by writing a literal hue in a component.
- **Do** put a drawer's colour on its glyph with `tintStyle(color)` and the `tint` utility, and nowhere else.
- **Do** use the `on-wallpaper` utility, or `home-ink` on rail, strip and drawers, for any text that sits on the picture, and `wp-icon-shadow` / `home-mark` for its icon.
- **Do** keep icon labels at 11px and let them truncate or clamp to two lines.
- **Do** mark the selected or open thing with Selection Soft plus a 1.5px Selection ring, and nothing else.
- **Do** keep transitions to 150 ms colour changes and the 180 ms `alcove-rise` arrival, with `prefers-reduced-motion` dropping the rise.
- **Do** give every control a visible `focus-visible` outline in Selection.

### Don't:
- **Don't** use `backdrop-blur`, `bg-black/…`, `bg-white/…` or any of the old glass classes. Home chrome uses the `home` / `veil` / `dock` tokens, never a literal alpha.
- **Don't** paint the rail or an open drawer as a Surface or Desk slab. That is what makes Alcove look like an app on the wallpaper.
- **Don't** fill a tile, a ring or a header with a drawer's colour, and never add a `border-left` accent stripe.
- **Don't** introduce a second accent; semantic red is for delete only and is not an accent.
- **Don't** build Rainmeter-style widgets, clocks, or meters on the wallpaper, and don't leave titled zones on it.
- **Don't** let Alcove grow into Explorer: no properties panes, no multi-column file management chrome.
- **Don't** use gradient text, glows, neon, or "RGB launcher" effects.
- **Don't** set text below 11px or use fluid `clamp()` type, and don't hardcode a px size in a component; it will not follow the Text size setting.
- **Don't** add a font-colour picker. The ink is derived from the wallpaper so it holds contrast on any picture; a hand-picked colour does not.
- **Don't** animate layout properties, and never bounce or overshoot.
