## Why

Pressing Win+D makes Alcove blink. Measurement (see `design.md`) shows the
cause is not a timing bug: Show Desktop never minimizes Alcove, it **raises
Explorer's icon host and wallpaper WorkerW to the front of the z-order**, and
Alcove's watchdog then pulses `HWND_TOPMOST -> NOTOPMOST -> TOP` to climb back
over. That pulse, plus WebView2 re-presenting a full-screen surface, is the
flash. No poll rate fixes it, because the cover lands before we can react.

Explorer's own desktop icons never blink on Win+D, because they belong to the
window Explorer raises. Alcove can inherit exactly that behaviour by making
the icon host its **owner**: an owned window is always displayed above its
owner, so it rides the raise instead of racing it.

## What Changes

- Each desk window takes Explorer's desktop icon host as its owner
  (`GWLP_HWNDPARENT`) while Alcove is attached to the desktop.
- The 2-second sweep that already re-finds the icon list also re-arms the
  owner when Windows has cleared it (Explorer restart) or the host changed.
- Detaching clears the owner before Explorer's icons are restored.
- The z-order recovery machinery this replaces is deleted: the topmost pulse,
  the wallpaper-covering hit test, the per-window `covering` set and the 30 Hz
  burst. The minimized/hidden/cloaked safety net stays.

## Capabilities

### New Capabilities
- `desktop-surface`: how Alcove holds its place in the desktop z-order. No baseline spec exists for it yet, so the delta is written as ADDED.

## Impact

- `src-tauri/src/desktop.rs` — owner arm/clear/re-arm, deletions above
- `src-tauri/Cargo.toml` — no new crate features (`Win32_UI_WindowsAndMessaging`
  already covers `SetWindowLongPtrW`/`GetWindowLongPtrW`)
- No frontend change, no IPC change, no persisted-state change

## Non-goals

- Reparenting with `SetParent`/`WS_CHILD`. Measured to work, but a destroyed
  parent destroys its children, so an Explorer restart would kill the desk
  windows; ownership survives it. See `design.md` for the comparison.
- Any change to how the wallpaper is painted or how icons are hidden.
