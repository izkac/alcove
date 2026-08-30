# Alcove

Give every icon a home.

Alcove is a Windows desktop organizer: named groups (Alcoves) that collapse to chips, page when they get full, and switch between Work / Home / Clean layouts. In the browser it is a clickable mock. As a desktop app it can pin that UI onto the real desktop, in place of Explorer’s icons.

## Local home

On your machine this project lives at:

```text
S:\Projects\alcove
```

This cloud workspace is the git repo. After you create the GitHub repository, clone it straight there (no nested extra folder):

```bat
git clone <repo-url> S:\Projects\alcove
cd S:\Projects\alcove
```

`S:\Projects\alcove\package.json` is the app.

## Run

Browser:

```bat
npm install
npm run dev
```

The dev server binds to [http://127.0.0.1:43147](http://127.0.0.1:43147).

Desktop window (Tauri — needs [Rust](https://www.rust-lang.org/tools/install) and the MSVC Build Tools on Windows):

```bat
npm run desktop
```

That starts Vite and covers the real desktop with the Alcove UI (Explorer icons are hidden; the Windows taskbar stays). Do not run `npm run dev` at the same time — they share port 43147.

Alcove menu: **Show as a window** pops it back out. **Use as the desktop** pins it again. If icons vanish and the app is stuck, press **Ctrl+Shift+F12**, or restart Explorer.

This uses the files on your Windows Desktop, with the same icons Explorer shows.

To ship an installer:

```bat
npm run installer
```

That builds a current-user NSIS setup at `src-tauri\target\release\bundle\nsis\`. The installer puts Alcove in the Start menu and registers it to start when this user signs in. The window stays hidden until it already covers the desktop, so it does not pop in small and then stretch. Settings can turn sign-in start off; uninstall removes it.

## What you can do

- **Organize** Desktop files into Apps, Documents, Photos, Folders, Installers, and Shortcuts — or start with an empty Inbox
- **Drag** icons between Alcoves (drop on the wallpaper to send them to Inbox)
- **Collapse** an Alcove to a chip; hover to peek; click to expand. Neighbors reflow
- **Page** through overflow instead of growing across the wallpaper
- **Frequent strip** at the top edge fills itself with what you actually open. Slots hold their position as ranks shift, so nothing moves under your cursor; right-click one to keep it in place or ban it
- **Spread a drawer across the desktop** — drawers over 12 items open as a full canvas, where you can make named groups that render as rows. Drag icons between rows; anything uncurated stays in "Everything else"
- Switch **Work / Home / Clean** layouts, density, and focus mode
- **Search** with Ctrl+F (or Cmd+F)
- **Pin rail** for a few icons that never collapse
- **Collapse all** with Ctrl+Shift+H; **New Alcove** with Ctrl+N

The Alcove menu on the taskbar can drop a new file, reload the sample desktop, or reset to an empty Inbox.

## Stack

Vite, React, TypeScript, Tailwind CSS, shadcn/ui, and Tauri. On Windows the app hides Explorer’s icon list and covers the work area with the same UI you see in the browser.

## Not in this slice

Explorer context menus.
