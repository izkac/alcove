# Alcove

Give every icon a home.

Alcove is a Windows desktop organizer: named groups (Alcoves) that collapse to chips, page when they get full, and switch between Work / Home / Clean layouts. This repo is a high-fidelity interactive desktop you can click through. The same UI can later sit in a native overlay on the real Windows desktop.

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

```bat
npm install
npm run dev
```

The dev server binds to [http://127.0.0.1:43147](http://127.0.0.1:43147).

## What you can do

- **Organize** a sample cluttered desktop into Apps, Client A, Documents, Photos, Folders, Installers, and Shortcuts — or start with an empty Inbox
- **Drag** icons between Alcoves (drop on the wallpaper to send them to Inbox)
- **Collapse** an Alcove to a chip; hover to peek; click to expand. Neighbors reflow
- **Page** through overflow instead of growing across the wallpaper
- Switch **Work / Home / Clean** layouts, density, and focus mode
- **Search** with Ctrl+F (or Cmd+F)
- **Pin rail** for a few icons that never collapse
- **Collapse all** with Ctrl+Shift+H; **New Alcove** with Ctrl+N

The Alcove menu on the taskbar can drop a new file, reload the sample desktop, or reset to an empty Inbox.

## Stack

Vite, React, TypeScript, Tailwind CSS, and shadcn/ui.

## Not in this slice

Harvesting real Windows desktop icons, Explorer context menus, and drawing on the desktop Z-order (`WorkerW`). That is the native follow-up.
