# Alcove User Guide

Alcove replaces the loose grid of icons on your Windows desktop with named groups you
can collapse, page through and rearrange. This guide covers everything it does.

Alcove works on the real files on your Desktop. Opening something opens the real file
with the real Windows program. Alcove does not copy or move anything unless you drag
it somewhere, and deleting from Alcove means the Recycle Bin, same as Explorer.

---

## First run

The first time Alcove opens it looks at what is already on your Desktop and offers to
sort it into drawers. It groups by what the files are:

| Drawer | What lands in it |
| --- | --- |
| Apps | `.exe` and `.msc` programs, and `.lnk` / `.url` shortcuts |
| Installers | `.msi` installers, and `.zip` `.7z` `.rar` `.iso` archives |
| Photos | `.jpg` `.png` `.gif` `.bmp` `.webp` `.tif` `.tiff` `.heic` |
| Folders | Anything that is a folder |
| Documents | Everything else |

You can accept the groups it suggests, uncheck the ones you do not want, or **start
with an empty Inbox** and file things yourself. Nothing is moved on disk either way —
a drawer is a view of your Desktop, not a folder.

If you would rather start over later, Settings has **Start with an empty Inbox**.
**Reload desktop icons** is the safe one: it picks up files that appeared on your
Desktop without touching how you have arranged anything.

---

## The pieces

### Alcoves (drawers)

An Alcove is a named group of icons. It has a colour, an icon, and a count.

- **Click** its tile in the rail to open it. Click the tile or the title again to
  close it.
- One drawer is open at a time — opening another closes the first, so the wallpaper
  stays clear.
- Small drawers open as a compact **panel**. Past twelve items a drawer opens as a
  **canvas** spread across the desktop instead. Use **Spread across the desktop** and
  **Show as a small panel** in the drawer header to force either.

### The Inbox

The Inbox is the drawer that catches everything not filed anywhere else. Alcove
watches your Desktop folder, so a file saved there by a browser, an installer or an
unzipped archive appears here on its own, and stays until you file it. It is always
present and cannot be deleted. Leaving an icon on the wallpaper is not the same as
leaving it unsorted — an icon you park keeps the drawer it belongs to.

### The shelf rail

The strip down the left edge, and the main way you get around. It holds the Inbox at
the top, then one tile per drawer, with New Alcove, Search and Settings at the
bottom. Each tile shows the drawer's name and its item count; hover it to see how
much disk space it holds, and which drawer is the heaviest. Drag a drawer up or down
to change its place; the tile follows the pointer. Inbox stays at the top. Right-click
for **Move up** / **Move down**.

Alcove takes its look from your wallpaper. The rail, the frequent strip and the
open drawers use the same see-through wash, so they sit in the picture rather
than as a panel on top of it. Dialogs and menus stay paper on a light picture
and slate on a dark one. **Surface** in Settings → General sets how opaque that
wash is: **Tinted** (the default) and **Blend** keep the wash see-through,
**Solid** paints the rail, strip and drawers as plain paper or slate.

**Text size** in the same place scales every label at once, and **Stronger text**
darkens the smaller labels if they read too softly on your screen.

### The wallpaper

Alcove covers the desktop, so its right-click menu is where the wallpaper lives.
**Background** offers:

- **Choose a picture…** lists pictures from Pictures and a few other folders and
  sets the one you click as your Windows wallpaper, on every monitor. It is the
  real wallpaper, so it stays when Alcove is closed.
- **Solid colour…** clears the wallpaper and leaves a plain colour behind it,
  with eight presets and a colour picker.
- **Windows personalisation…** opens Windows' own background settings, for
  slideshows, fit and everything else Alcove does not do.

Either way Alcove re-reads the desktop straight after and re-tints itself, so its
surfaces follow the new background.

### The frequent strip

A row of your most-used items along the top or bottom edge. You do not fill it; it
fills itself from what you actually open.

It starts with eight slots — Settings lets you pick anywhere from three to sixteen —
and it is deliberately reluctant to rearrange them. An item's score halves every two
weeks, so old habits fade, and a newcomer has to beat the weakest item on the strip
by half again before it takes the slot. Items keep their position as ranks shift, so
nothing slides out from under your cursor.

Right-click any slot to override it: **Keep in this slot** nails an item down so the
ranking cannot displace it, and **Never show here** bans one for good. **Show in its
Alcove** jumps to wherever the item actually lives.

The left of the strip holds **shortcuts** — Windows tools like Control Panel,
Services and Command Prompt. Choose which appear in Settings.

### Icons on the wallpaper

Drag an icon out of a drawer and drop it anywhere on the wallpaper: it stays there.
The desktop is still yours — Alcove only insists that what you leave out is what you
meant to leave out. Parked icons snap to a grid, so two can never land on top of each
other, and a screen that changes size pulls them back on rather than losing them off
the edge.

Parking an icon does not take it out of its drawer. It stays sorted where it was, and
the desktop is simply a second place you can see it from — so everything can be
categorised and the handful you reach for daily can still be out on the wallpaper.

**Put on the desktop** in an icon's right-click menu does the same as the drag, from
wherever the icon is — useful inside a drawer, where a group row under the pointer
claims the drop. To put one away, drag it back onto a drawer — on the rail, or the
title bar of the open one — or use **Take off the desktop**.

A drawer wide enough to cover the screen would leave nowhere to drop. So while you
drag, the open drawer goes see-through and lets the drop fall past it onto the
wallpaper; its title bar and group rows stay live, for when you meant to file it
there after all. Drop on the wallpaper and the drawer closes so you can see where the
icon landed.

### Pinned icons and the Recycle Bin

The bottom-right corner holds up to eight pinned icons stacked above the Recycle Bin.
Pinned icons never move, whatever the frequent strip is doing — drag an icon onto the
stack to add it. Drag one out of the stack onto the wallpaper to give it a place of
its own instead.

The Recycle Bin is the real one: right-clicking it gives you Windows' own menu, not
Alcove's.

### Desks

Each monitor gets its own desk with its own drawers and its own layout. A drawer
belongs to one desk, and you can move it to another from its menu. Layouts are saved
per desk, so rearranging one screen leaves the others alone.

---

## Working with folders

A drawer can mirror a real folder on disk. Point one at, say, your Downloads folder
and it shows that folder's live contents — add a file in Explorer and it appears.

Folder drawers have four views:

| View | Shows |
| --- | --- |
| Icons | Icons at your chosen size |
| Large | Big icons, for pictures |
| List | Small icons in a compact list |
| Details | Name, type, size and date, with sortable columns |

Click a column heading in Details to sort by it; click again to reverse.

To stop mirroring, use **Stop mirroring folder** in the drawer's menu. The drawer
stays; it just goes back to holding whatever you put in it.

### USB sticks and memory cards

Plug one in and it opens as a drawer of its own within a second or two, named
after the drive's label. It works like any other folder drawer — browse it, drill
into subfolders, drag files out into an Alcove.

The drawer has an **eject** button instead of the usual edit and delete buttons,
because it only lasts as long as the drive is plugged in. Ejecting flushes
everything still being written and unmounts the drive, then closes the drawer. If
something else still has a file open, the eject fails, the drawer stays, and
Alcove tells you which drive it was. Unplugging without ejecting closes the drawer
too — nothing is left behind, and none of these drawers are remembered between
runs.

Two things this does not do. It does not stop Windows Autoplay, which is a Windows
setting and not Alcove's to change — turn it off in Windows Settings if you want
it gone. And on some sticks the drive letter stays in Explorer after ejecting
until you physically pull the drive; your data is already safe at that point.

Turn the whole thing off with **Open a drawer for USB drives** in Settings.

---

## Layouts and size

**Layouts** — Work, Home and Clean are three saved arrangements. Switching between
them rearranges your drawers and remembers each one separately, so you can have a
tidy Clean layout for screen sharing and a busy Work one for the rest of the time.
Clean shows the Inbox alone.

**Icon size** — Comfortable, Compact or Tiny. This changes both the icon size and how
much fits in a drawer before it starts scrolling.

---

## Renaming, pinning and deleting

Right-click any icon for **Open**, **Rename**, **Put on the desktop**, **Move to**
(another drawer), **New Alcove with this**, and **Delete**.

Worth knowing:

- **Rename changes the label in Alcove only.** The file on disk keeps its real name.
- **Delete is a real Recycle Bin delete**, the same as deleting in Explorer — the
  one thing Alcove does that leaves your Desktop folder, so Windows asks first.
  Everything else (drawers, groups, parking, renaming) only ever changes Alcove.
- You can pin **eight** icons to the corner stack. They sit above the Recycle Bin in
  the bottom-right corner and never move. The ninth pin is ignored. Icons you park on
  the wallpaper yourself do not count — park as many as the screen holds.

---

## Settings

Open Settings from the gear at the bottom of the rail. It has three tabs.

**General** — Layout, icon size, and Collapse all.

**Frequent strip** — whether the strip sits at the top or bottom of the screen, how
many app slots it holds, and which Windows shortcuts appear on its left. The
shortcuts are grouped by category: System, Command, Folders, Network and Developer,
and they do not count towards the slot number.

Changing the number never disturbs what is already there: growing adds empty slots
on the end and fills them from what you have opened before, and shrinking drops from
the end only. Nothing that stays moves position.

**System** —

| Setting | What it does |
| --- | --- |
| Use as the desktop | Alcove covers the Windows desktop instead of floating in a window |
| Hide the Windows taskbar | Hides the taskbar; move the mouse to the screen edge to peek at it |
| Open a drawer for USB drives | Plugging a removable drive in opens it as a drawer; unplugging closes it |
| Start when I sign in | Launches Alcove automatically at Windows sign-in |
| Reload desktop icons | Re-reads your Desktop now. Rarely needed; new files arrive on their own. Keeps your drawers |
| Start with an empty Inbox | Clears every drawer back to one empty Inbox. There is no confirmation prompt |

---

## Keyboard shortcuts

| Keys | Does |
| --- | --- |
| **Ctrl+Space** | Open search — works anywhere in Windows, even when Alcove is behind other apps |
| **Ctrl+F** | Search within Alcove — Enter shows the file on the desktop rather than opening it |
| **Ctrl+N** | New Alcove |
| **Ctrl+Shift+H** | Collapse every drawer |
| **Ctrl+V** | Paste clipboard files into the open drawer's folder, or onto the Desktop |
| **Ctrl+A** | Select every icon in the open drawer |
| **Ctrl+click** an icon | Add or remove it from the selection |
| **Shift+click** an icon | Select the range from the last clicked icon |
| **Enter** | Open the selected icons |
| **Delete** | Send the selected icons — or the focused icon — to the Recycle Bin |
| **1**–**9** in search | Open that numbered result, before you type anything |
| **Ctrl+Enter** in search | Show the highlighted file in Explorer |
| **Shift+Enter** in search | Open the folder that holds it |
| **>** in search | Turn the list into commands |
| **Backspace** | Go up a level in a drilled-into folder |
| **Esc** | Clear the selection, or close search |
| **Ctrl+Shift+F12** | Emergency release — hands the desktop back to Explorer |

If another program has already claimed Ctrl+Space, Alcove falls back to
**Ctrl+Shift+Space**. The startup log line `search hotkey …` tells you which one it
got — the rail's Search button always says Ctrl+Space regardless.

Ctrl+Space opens a standalone search window that works from anywhere in Windows. It
reads your last saved arrangement, so a drawer you created seconds ago may take a
moment to appear there.

Before you type it shows two short lists: **Today**, the files you have changed since
midnight, and **Frequent**, what you open most. Pictures get at most two rows in
Today between them, so an afternoon of downloading wallpapers cannot bury the
document you were writing. Press **1** to **9** to open one without touching the
mouse. Today is the half the frequent strip cannot cover — the
document you were editing twenty minutes ago and will never open again after Friday.

Once you type, results are ranked by how often you actually open them, not just by
how well the name matches. Something you use daily wins a close call, but a weak
match never beats a strong one however often you open it.

Each row says what it is under its name — the type, the size and when it changed —
which is the difference between five files called `pexels-70588695` and five files
you can tell apart.

### What search can find

Typing searches four things at once, each in its own group.

- **Icons** on the desktop and in every drawer.
- **Running windows.** Choosing one switches to it, so Ctrl+Space is Alt+Tab you
  can type into.
- **Drawers**, by name. Enter opens the drawer on the screen it lives on.
- **Deeper in your folders.** A drawer pointed at a folder lists the 400 newest
  files in it and nothing below that, so search also walks the folders underneath.
  The walk stops after about half a second and shows what it found by then, nearest
  folders first. It skips the places nobody means — `node_modules`, `AppData`, the
  Recycle Bin.

Hold **Ctrl** with Enter to show the highlighted file in Explorer instead of opening
it, or **Shift** to open the folder around it.

### Commands

Type **>** and the list becomes verbs: new drawer, collapse every drawer, change
wallpaper, settings, hide or show the Windows taskbar, empty the Recycle Bin.
Emptying the bin still goes through Windows' own confirmation. Each command shows
the shortcut that already does it, so the palette teaches its way out of itself.

### When nothing matches

Search never answers with a dead end. Whatever you typed, it offers something that
runs: a path you typed opens, a web address opens in your browser, a single word
runs the way **Win+R** would, and there is always a web search at the bottom.

---

## Mouse

| Action | Does |
| --- | --- |
| Click a rail tile | Open that drawer; click again to close it |
| Drag a drawer tile up or down | Change its place on the rail |
| Drag a drawer to another screen | Move it to that screen's desk |
| Drag an icon onto a drawer | File it there |
| Drag selected icons onto a drawer, group, pin, or another screen | File all of them there |
| Drag an icon onto the corner pins | Pin it so it never moves |
| Drag an icon onto empty wallpaper | Leave it there, where you dropped it |
| Drag an icon out of a drawer that fills the screen | The drawer goes see-through; drop anywhere but its title bar or a group row |
| Drag a file onto an app on the frequent strip | Open it with that app, instead of its usual one |
| Drag an icon to another screen | Move it to that screen's desk |
| Click an icon | Select it. Ctrl+click adds; Shift+click takes a range |
| Double-click an icon | Open the file with its normal Windows program |
| Double-click the wallpaper | Make a new Alcove |
| Right-click a drawer tile | Its menu — edit, move up/down, icon, colour, mirror a folder, move to another screen, delete |
| Right-click an icon | Open, Put on the desktop, Move to, New Alcove, Delete apply to the whole selection. Rename is one at a time |
| Right-click a frequent strip slot | Open, Show in its Alcove, Keep in this slot, Never show here |
| Right-click the wallpaper | Paste, New Alcove, Collapse all, Background |

---

## Where your settings live

Everything — drawers, layouts, pins, preferences — is saved to:

```text
%APPDATA%\com.alcove.desktop\desktop.json
```

Deleting that file resets Alcove to a fresh desktop. It never touches your files.

---

## If something goes wrong

**Icons vanished and Alcove is stuck.** Press **Ctrl+Shift+F12**. This releases the
desktop and gives Explorer's icons back. Restarting Explorer also works.

**The Windows taskbar is missing.** Turn off **Hide the Windows taskbar** in Settings
→ System, or move the mouse to the screen edge to peek at it.

**A file I added on the Desktop is not showing.** New files land in the Inbox on
their own within a couple of seconds. If one does not, use **Reload desktop icons**
in Settings → System.

**Alcove is behind my other windows.** That is intended — it sits on the desktop, so
apps cover it. Minimise everything, or press the Show Desktop shortcut.

---

## What Alcove does not do

Running apps stay on the **Windows taskbar** — Alcove organizes the desktop, not your
open windows. Right-clicking an icon gives you Alcove's menu, not Explorer's full
context menu.
