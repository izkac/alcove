# Product

## Register

product

## Users

People on Windows 10 and 11 whose desktop has become a dumping ground, and who
would otherwise buy Fences to fix it. The core user is a developer or power user
with fifty-plus shortcuts, a Downloads folder they live in, and two or three
monitors. They are not "using Alcove" for any length of time. They glance at it
between tasks, dozens of times a day, to launch one thing or to see what just
landed, and then they are gone again. Their state of mind is mid-task and slightly
impatient: recognise, click, leave.

The job to be done is "get me the thing I want without the desktop being a mess",
and the second job is "tell me what arrived on the desktop since I last looked".

## Product Purpose

Alcove replaces the loose grid of icons on the Windows desktop with named drawers
that open one at a time, so the wallpaper stays clear the rest of the time. It
reads the real files on the real Desktop, opens them with the real Windows shell,
and watches the folder so new arrivals show up in the Inbox on their own. It is a
desktop layer, not a file manager: Explorer keeps copy, rename, properties and
the rest.

Success looks like a clear wallpaper most of the day, a launch that takes one
glance and one click, and a user who forgets Alcove is a separate program.

## Brand Personality

Calm, plain-spoken, sure of itself. Three words: quiet, deliberate, unhurried.

The voice never sells. No exclamation marks, no "seamless", no feature tours. It
says what a thing does in a sentence and stops. The tagline is "Give every icon a
home", and the page title is "a calmer Windows desktop". The emotional goal is
relief: the feeling of a tidy desk, not the feeling of a new gadget.

## Anti-references

- **Rainmeter and widget dashboards.** Clocks, weather, CPU graphs. They make the
  clean desktop noisy again, which is the one thing Alcove sells.
- **Fences-style titled zones.** Translucent boxes with headers living permanently
  on the wallpaper. That is the clutter with borders around it.
- **Glassmorphism as identity.** Blur-everything, frosted-panel-everywhere. The
  current build leans on it and it reads as "generic modern app", not as Alcove.
- **RGB launcher aesthetics.** Neon accents, glows, gradient text, anything that
  looks like it wants to be noticed.
- **Explorer.** Alcove must never grow into a file manager. Copy, rename,
  multi-select management and properties belong to Explorer, one keystroke away.
- **The old Windows desktop.** A flat grid of loose icons is the problem, not a
  fallback.

## Design Principles

1. **The wallpaper is the product.** Every surface has to justify covering it,
   and nothing stays on screen that the user did not leave there. The rail stays
   home; everything else is a visitor.
2. **Native to each desk.** Alcove takes its light, its tint and its scale from
   the wallpaper and the monitor it sits on. It should never look like a foreign
   app pasted over Windows.
3. **Recognise at a distance.** Hierarchy is built for a glance from across the
   room: the icon first, the name second, the count third. Anything smaller than
   that is chrome and should be nearly invisible until needed.
4. **Still hands.** Nothing moves under the pointer. Strip slots hold position,
   drop targets never reflow the thing being dragged, and motion only ever
   confirms something that already happened.
5. **Earned familiarity.** Standard affordances, standard shortcuts, standard
   menus. The tool should disappear into the launch. Delight is reserved for
   moments, never spread across pages.

## Accessibility & Inclusion

Standard baseline, taken seriously: every control reachable by keyboard with a
visible focus ring, `prefers-reduced-motion` respected, WCAG AA text contrast.
The one special case is text drawn over a user's wallpaper, which can be any
colour: such text must carry its own contrast (a scrim or a shadow) rather than
hoping the wallpaper cooperates. No hover-only functionality. Windows display
scaling from 100% to 200% must not break layout.
