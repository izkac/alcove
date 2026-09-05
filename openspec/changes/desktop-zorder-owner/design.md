# Design — desk windows owned by the desktop icon host

## Measurements

Throwaway C# probes, Windows 10 Pro N 19045, 1920x1080. Each drove a real
`Shell.Application.ToggleDesktop` (what Win+D invokes) against a borderless,
skip-taskbar window covering the work area — the shape of an Alcove desk.

### Shell topology

| Window | Class | Relationship | Role |
| --- | --- | --- | --- |
| `0x18024C` | WorkerW | top-level | owns `SHELLDLL_DefView` — the icon host |
| `0xAC080A` | WorkerW | parent = Progman | wallpaper painter |
| `0x10104` | Progman | top-level | shell root, no DefView |

`find_shell()` already returns this icon host as `ShellWindows::host`.

### M1 — Win+D raises the desktop, it does not minimize us

```
BEFORE   iconic=False  z(me)=2  z(host)=19  z(wall)=20  hit=<our window>
WIN+D    iconic=False  z(me)=4  z(host)=2   z(wall)=3   hit=WorkerW
```

`iconic` stays false throughout; so do `visible` and DWM `cloaked`. The window
is covered, not minimized. This invalidates the assumption behind
`restore_to_desktop`'s `SW_RESTORE` path for the Win+D case.

### M2 — Ownership holds the position with no pulse

With `SetWindowLongPtr(hwnd, GWLP_HWNDPARENT, host)`:

```
BEFORE   z(me)=2  z(host)=19  hit=<our window>
WIN+D    z(me)=2  z(host)=3   hit=<our window>    <-- never covered
```

The window kept its place above the desktop across the raise, with no
`SetWindowPos` call of our own.

### M3 — Apps still cover an owned window

```
owner set                       -> our window on top
notepad maximized + foreground  -> covered by Notepad
notepad closed                  -> our window on top
```

"Above the wallpaper, below apps" is preserved. Ownership orders us against
the owner, not against the whole desktop.

### M4 — A destroyed cross-process owner does not destroy the owned window

Two-process probe; the owner process destroyed its window at t=5:

```
t=4  ownerAlive=True   ownedAlive=True  ownedVisible=True  ownerAttr=0x7101D0
t=5  ownerAlive=False  ownedAlive=True  ownedVisible=True  ownerAttr=0x0
```

Windows clears the owner attribute and leaves the window alive. An Explorer
restart therefore costs one attribute, not a window rebuild.

## Why not `SetParent` / `WS_CHILD`

Measured to produce the same z-order behaviour, and rejected on cost:

| | owner | WS_CHILD child |
| --- | --- | --- |
| Survives Explorer restart | yes (M4) | no — parent destruction destroys children |
| Window coordinates | unchanged, screen space | host-client relative, every rect translated |
| Stays a top-level window | yes | no |
| WebView2 hosting | untouched | plausible but unproven here |
| Activation / focus / drag-drop | unchanged | untested territory |

Both reach the same goal. Ownership reaches it with a smaller blast radius and
a cheaper failure mode.

## Mechanism

`GWLP_HWNDPARENT` (-8) sets a top-level window's **owner**, despite the name.
`SetWindowLongPtrW` writes it, `GetWindowLongPtrW` reads it back. Windows keeps
an owned window above its owner in z-order for as long as the owner lives.

## Changes to `desktop.rs`

- `Inner` gains `host: Option<isize>` next to the existing `def_view`.
- `own_desktop(hwnd, host)` sets the owner; `disown_desktop(hwnd)` clears it.
- `reveal()` records the host and arms every known desk window.
- `sync_desks()` arms each desk window it creates or re-finds.
- The 2s branch of the sweep compares each desk window's current owner against
  the recorded host and re-arms on mismatch, alongside the existing
  `refresh_def_view`. `refresh_def_view` also updates the recorded host.
- `detach()` clears the owner on every desk window.

## Deletions

- `raise_over_wallpaper` — the pulse itself
- `wallpaper_is_covering`, `belongs_to`, `is_desktop_class` — the hit-test that
  fed it
- the `covering: HashSet<isize>` and `burst_left` state, and the 30 ms fast
  tick they drive; the loop settles at its 250 ms cadence
- `needs_restore` and its `restore_to_desktop` call survive, demoted to a
  safety net for anything that really does minimize or hide us

## Testing

`owner_needs_rearm(current: Option<isize>, host: Option<isize>) -> bool` is the
only branching logic, and it is pure. Unit test covers: already armed,
cleared by Explorer restart, host changed, no host known, window not armed yet.

The window behaviour itself is not scriptable in CI — it needs a live Explorer
and a real Show Desktop. Manual verification is recorded in the tasks.
