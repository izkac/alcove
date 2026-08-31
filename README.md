# Alcove

Give every icon a home.

Alcove is a Windows desktop organizer. It replaces the loose grid of icons on your
desktop with named groups — **Alcoves** — that open one at a time, spread across the
desktop when they get big, and keep their own arrangement per monitor. It reads the
real files on your Windows Desktop and opens them with the real Windows shell;
nothing is copied or moved unless you move it.

As a desktop app it draws itself onto the desktop in place of Explorer's icons. In a
browser it runs as a clickable mock with sample data, which is how you develop it.

## Install

Download `Alcove_0.1.0_x64-setup.exe` and run it. It installs for the current user,
adds Alcove to the Start menu, and registers it to start at sign-in. You can turn
sign-in start off in Settings; uninstalling removes it.

To build the installer yourself, see [Building](#building) below.

## What it does

- **Organizes your Desktop into drawers.** On first run Alcove sorts what is already
  on your Desktop into Apps, Documents, Photos, Folders and Installers — or you can
  start with an empty Inbox and file things yourself.
- **Opens one drawer at a time.** Click a drawer's tile in the rail to open it, click
  again to close. The wallpaper stays clear the rest of the time.
- **Grows into a canvas, not across the wallpaper.** Small drawers open as a compact
  panel. Past twelve items a drawer opens spread across the desktop instead, where
  you can make named rows and drag icons between them.
- **Mirrors real folders.** Point a drawer at a folder on disk and it shows that
  folder's live contents, with icon, list and details views and sortable columns.
- **Learns what you open.** The frequent strip along the top or bottom edge fills
  itself with what you actually use. Slots hold their position as ranks shift, so
  nothing moves under your cursor mid-click.
- **Gives each monitor its own desk.** Drawers belong to a screen, and you can move
  them between screens. The layout is saved per desk.
- **Keeps Windows working.** Running apps stay on the Windows taskbar, files open
  with their real shell associations, and the Recycle Bin behaves like the Recycle
  Bin. Alcove organizes the desktop; it does not replace Explorer.

Full instructions are in the [User Guide](docs/user-guide.md).

## Running from source

Requires Node.js. The desktop app additionally needs
[Rust](https://www.rust-lang.org/tools/install) and the MSVC Build Tools.

Browser mock — sample data, no Windows integration:

```bat
npm install
npm run dev
```

Vite serves it at http://127.0.0.1:43147.

Desktop app — the real thing, against your real Desktop:

```bat
npm run desktop
```

This covers the desktop with the Alcove UI and hides Explorer's icons. The Windows
taskbar stays. Do not run `npm run dev` at the same time; they share port 43147.

If icons vanish and the app is stuck, press **Ctrl+Shift+F12** to release the
desktop, or restart Explorer.

## Building

```bat
npm run installer
```

Produces a current-user NSIS installer at
`src-tauri\target\release\bundle\nsis\`. The window stays hidden until it already
covers the desktop, so it does not appear small and then stretch.

## Licence

Alcove is free and complete. Every feature, every monitor, no time limit, no
nag at startup — it starts with Windows and *is* your desktop, and something
that asks for money every morning is what bundled junk does.

A licence buys **updates**: newer versions for the period it covers. When it
lapses the copy you have keeps working forever, in full — you just stop being
offered newer ones. That means there is nothing to revoke, no activation server,
and no check that can fail and lock you out. Keys are verified offline against a
public key built into the app.

The source is here to read, build and modify for yourself. Redistributing builds
is the one thing it does not allow — see [LICENCE.md](LICENCE.md).

To issue a key:

```bat
node scripts/issue-licence.mjs "buyer@example.com" 12
```

Signs `<name>|<expiry>` with `%USERPROFILE%\.tauri\alcove-licence.key` and prints the key
to send. That key is separate from the update signing key on purpose: a leaked
licence key must not also be able to push a build to every install. Both live
outside this repo and neither can be regenerated.

## Releasing an update

Alcove updates itself. Shortly after it starts, the primary desk asks
`https://github.com/izkac/alcove/releases/latest/download/latest.json` whether
there is a newer build and offers it as a toast; Settings → System → Updates
checks on demand. A failed check is silent — being offline is not an event.

Updates are signed, and the app refuses anything that does not verify against
the public key in `tauri.conf.json`. The private key is at
`%USERPROFILE%\.tauri\alcove.key`, is **not** in this repo, and cannot be
regenerated: lose it and existing installs can never be updated again. Back it
up somewhere you would not lose a password.

To cut a release:

1. Bump `version` in `package.json` and `src-tauri/tauri.conf.json`.
2. Build with the signing key in the environment:

```bat
set TAURI_SIGNING_PRIVATE_KEY_PATH=%USERPROFILE%\.tauri\alcove.key
set TAURI_SIGNING_PRIVATE_KEY_PASSWORD=
npm run installer
```

3. Publish the `.exe`, the `.exe.sig`, and a `latest.json` naming that version
   and the installer URL, as a GitHub release. Everything lands in
   `src-tauri\target\release\bundle\nsis\`.

Installing runs the NSIS installer, which takes the running Alcove down with it.
Because Alcove hides Explorer's icon list while attached, the update path hands
the desktop back *between* the download and the install — after the installer
starts, none of our code is guaranteed to run again.

## Where your settings live

Layout, drawers, pins and preferences are written to
`%APPDATA%\com.alcove.desktop\desktop.json`. Deleting that file resets Alcove to a
fresh desktop; it never touches your files.

## Development

```bat
npm run check    # assert-based checks for the pure logic modules
npm run lint     # oxlint
npm run build    # tsc -b && vite build
```

`npm run check` runs the `*.check.ts` files next to the modules they cover. Logic
with a branch or a rule in it is expected to leave one of these behind.

## Stack

Vite, React, TypeScript, Tailwind CSS, shadcn/ui, and Tauri 2. The Windows
integration — harvesting Desktop icons, extracting shell icons, the Recycle Bin,
the taskbar, desktop attachment — is Rust in `src-tauri/`.

## Not in this slice

Explorer context menus.
