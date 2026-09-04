## Why

Idea 12 in `docs/ideas.md`: plugging in a USB stick or a camera should open a
drawer with an eject button, not the Autoplay dialog. Autoplay asks a question
and then opens Explorer — a window to close, over the desk Alcove already owns.
A drawer is already the shape of the thing you plugged in, and every piece it
needs exists: mirrored-folder drawers, `list_folder_icons`, drill-down, drag-out.
The only genuinely new parts are noticing the volume and ejecting it.

## What Changes

- Alcove notices removable volumes appearing and disappearing and opens a
  temporary live-folder drawer for each one, named after its volume label.
- The drawer carries an eject button in its header. Ejecting flushes and
  dismounts the volume, then closes the drawer.
- Unplugging without ejecting closes the drawer on its own within a couple of
  seconds.
- These drawers are never written to `desktop.json` — a drive that was plugged
  in last Tuesday must not come back as an empty drawer at startup.
- A settings switch turns the whole behaviour off. On by default.

## Capabilities

### New Capabilities
- `removable-drives`: noticing removable volumes, showing each as a temporary drawer, and ejecting one.

## Impact

- `src-tauri/src/removable.rs` (new), registered in `src-tauri/src/lib.rs`
- `windows` crate gains the `Win32_System_IO` and `Win32_System_Ioctl` features
- `src/types.ts` — `Alcove.removable`, `DesktopState.autoDriveDrawers`
- `src/hooks/use-alcove-desktop.ts` — the poll that syncs drawers to drives
- `src/lib/storage.ts` — strip removable drawers on save
- `src/components/alcove-panel.tsx`, `alcove-canvas.tsx` — eject button
- `src/components/settings-dialog.tsx` — the off switch
