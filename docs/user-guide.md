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

If you would rather start over later, Settings has both **Start with an empty Inbox**
and **Reload desktop icons**.

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

The Inbox is the drawer that catches everything not filed anywhere else. New files
that appear on your Desktop land here, and dragging an icon onto empty wallpaper
sends it back here. It is always present and cannot be deleted.

### The shelf rail

The strip down the left edge, and the main way you get around. It holds the Inbox at
the top, then one tile per drawer, with New Alcove, Search and Settings at the
bottom. Each tile shows the drawer's name, its item count, and — for drawers holding
files with a size — how much disk space they take. The heaviest drawer is tinted when
it clearly outweighs the rest. Drag a drawer up or down to change its place — the tile follows the pointer. Inbox
stays at the top. Right-click for **Move up** / **Move down**.

### The frequent strip

A row of your most-used items along the top or bottom edge. You do not fill it; it
fills itself from what you actually open.

It has eight slots, and it is deliberately reluctant to rearrange them. An item's
score halves every two weeks, so old habits fade, and a newcomer has to beat the
weakest item on the strip by half again before it takes the slot. Items keep their
position as ranks shift, so nothing slides out from under your cursor.

Right-click any slot to override it: **Keep in this slot** nails an item down so the
ranking cannot displace it, and **Never show here** bans one for good. **Show in its
Alcove** jumps to wherever the item actually lives.

The left of the strip holds **shortcuts** — Windows tools like Control Panel,
Services and Command Prompt. Choose which appear in Settings.

### Pinned icons and the Recycle Bin

The bottom-right corner holds up to eight pinned icons stacked above the Recycle Bin.
Pinned icons never move, whatever the frequent strip is doing — drag an icon there,
or use **Pin to desktop** in its menu.

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

Right-click any icon for **Open**, **Rename**, **Pin to desktop**, **Move to** (another
drawer), **New Alcove with this**, and **Delete**.

Two things worth knowing:

- **Rename changes the label in Alcove only.** The file on disk keeps its real name.
- **Delete is a real Recycle Bin delete**, the same as deleting in Explorer.
- You can pin **eight** icons. Pinned icons sit above the Recycle Bin in the
  bottom-right corner and never move. The ninth pin is ignored.

---

## Settings

Open Settings from the gear at the bottom of the rail. It has three tabs.

**General** — Layout, icon size, and Collapse all.

**Frequent strip** — whether the strip sits at the top or bottom of the screen, and
which Windows shortcuts appear on its left. The shortcuts are grouped by category:
System, Command, Folders, Network and Developer.

**System** —

| Setting | What it does |
| --- | --- |
| Use as the desktop | Alcove covers the Windows desktop instead of floating in a window |
| Hide the Windows taskbar | Hides the taskbar; move the mouse to the screen edge to peek at it |
| Start when I sign in | Launches Alcove automatically at Windows sign-in |
| Reload desktop icons | Re-reads your Desktop and returns you to the first-run sorting screen |
| Start with an empty Inbox | Clears every drawer back to one empty Inbox. There is no confirmation prompt |

---

## Keyboard shortcuts

| Keys | Does |
| --- | --- |
| **Ctrl+Space** | Open search — works anywhere in Windows, even when Alcove is behind other apps |
| **Ctrl+F** | Search within Alcove |
| **Ctrl+N** | New Alcove |
| **Ctrl+Shift+H** | Collapse every drawer |
| **Ctrl+V** | Paste clipboard files into the open drawer's folder, or onto the Desktop |
| **Ctrl+A** | Select every icon in the open drawer |
| **Ctrl+click** an icon | Add or remove it from the selection |
| **Shift+click** an icon | Select the range from the last clicked icon |
| **Enter** | Open the selected icons |
| **Delete** | Send the selected icons — or the focused icon — to the Recycle Bin |
| **Esc** | Clear the selection, or close search |
| **Ctrl+Shift+F12** | Emergency release — hands the desktop back to Explorer |

If another program has already claimed Ctrl+Space, Alcove falls back to
**Ctrl+Shift+Space**. The startup log line `search hotkey …` tells you which one it
got — the rail's Search button always says Ctrl+Space regardless.

Ctrl+Space opens a standalone search window that works from anywhere in Windows. It
reads your last saved arrangement, so a drawer you created seconds ago may take a
moment to appear there.

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
| Drag an icon onto empty wallpaper | Send it back to the Inbox |
| Drag an icon to another screen | Move it to that screen's desk |
| Click an icon | Select it. Ctrl+click adds; Shift+click takes a range |
| Double-click an icon | Open the file with its normal Windows program |
| Double-click the wallpaper | Make a new Alcove |
| Right-click a drawer tile | Its menu — edit, move up/down, icon, colour, mirror a folder, move to another screen, delete |
| Right-click an icon | Open, Pin, Move to, New Alcove, Delete apply to the whole selection. Rename is one at a time |
| Right-click a frequent strip slot | Open, Show in its Alcove, Keep in this slot, Never show here |
| Right-click the wallpaper | Paste, New Alcove, Collapse all |

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

**A file I added on the Desktop is not showing.** Use **Reload desktop icons** in
Settings → System.

**Alcove is behind my other windows.** That is intended — it sits on the desktop, so
apps cover it. Minimise everything, or press the Show Desktop shortcut.

---

## What Alcove does not do

Running apps stay on the **Windows taskbar** — Alcove organizes the desktop, not your
open windows. Right-clicking an icon gives you Alcove's menu, not Explorer's full
context menu.
