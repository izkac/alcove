## 1. Own the desktop icon host

- [x] 1.1 `src-tauri/src/desktop.rs`: add `GetWindowLongPtrW`/`SetWindowLongPtrW` and `GWLP_HWNDPARENT` to the `windows` imports. Add `own_desktop(hwnd, host)` and `disown_desktop(hwnd)` wrapping `SetWindowLongPtrW(hwnd, GWLP_HWNDPARENT, ...)`, each with a comment that `GWLP_HWNDPARENT` sets the *owner*, not the parent, and that an owned window is kept above its owner. Confirm with `cargo check`.
- [x] 1.2 Add `host: Option<isize>` to `Inner` beside `def_view`. Record it in `prepare()` from `find_shell()`, clear it in `detach()`.
- [x] 1.3 Pure `owner_needs_rearm(current: Option<isize>, host: Option<isize>) -> bool` — true only when a host is known and the window's current owner differs from it. No Win32 in the function.
- [x] 1.4 Rust test in `desktop.rs` for `owner_needs_rearm`: already armed → false; owner cleared to `None` (Explorer restart) → true; host changed → true; no host known → false regardless of current. Run `cargo test -p alcove desktop`.

## 2. Arm, re-arm and release

- [x] 2.1 `reveal()` arms every desk window recorded in `Inner.desks` with the icon host, before `window.show()`.
- [x] 2.2 `sync_desks()` arms each desk window it creates and each existing one it re-finds, so a monitor hotplug never leaves an unarmed desk.
- [x] 2.3 In the 2s branch of `spawn_desktop_threads`, next to `refresh_def_view`: refresh the recorded host too, then for each desk window read `GetWindowLongPtrW(hwnd, GWLP_HWNDPARENT)` and re-arm when `owner_needs_rearm` says so. Log once per re-arm, not per tick.
- [x] 2.4 `detach()` calls `disown_desktop` on every desk window before Explorer's icons are shown again.

## 3. Delete the recovery machinery

- [x] 3.1 Remove `raise_over_wallpaper`, `wallpaper_is_covering`, `belongs_to` and `is_desktop_class`, plus any imports left unused (`WindowFromPoint`, `GetAncestor`, `HWND_TOPMOST`, `HWND_NOTOPMOST`, `POINT`, `GA_ROOT`).
- [x] 3.2 Drop the `covering: HashSet<isize>` and `burst_left` state and the 30 ms fast tick from the sweep loop; the loop parks at its 250 ms cadence. Keep the notification wake-up.
- [x] 3.3 Reduce `restore_to_desktop` to the `needs_restore` safety net (iconic / invisible / off-screen / cloaked) and drop its `raise` parameter. Comment that Win+D is handled by ownership now, so this only catches software that genuinely minimizes or hides the desk.
- [x] 3.4 `cargo check` and `cargo clippy` clean for `desktop.rs` (the repo has pre-existing warnings in `harvest.rs`, `search.rs` and `taskbar.rs` that this change does not touch).

## 4. Verify

- [x] 4.1 `cargo test` (35 pass, 5 new), `npm run check`, `npx oxlint src`, `npx tsc -b --noEmit` and `npm run tauri build -- --no-bundle` all clean; no new warnings in `desktop.rs`. The earlier `npm run build` failure was a filesystem permission on the project tree (no Delete right); the owner fixed it and the build now passes.
- [x] 4.2 **Win+D holds the desk.** `forge e2e run` GREEN against a binary containing this change: 31 samples across a real `ToggleDesktop`, `ownerIsHost` true in every one, `centerOwner` never `WorkerW`/`Progman`, `iconic` false throughout. The desk tracks exactly one z-order slot above the icon host, and ordinary applications still cover it on restore. Tables in the session's `verify-evidence.md`.
- [x] 4.3 **Explorer restart recovery.** Killed and restarted Explorer with Alcove attached. The desk window survived with the same HWND; the icon host came back as a different class (Progman `0x201FA` rather than WorkerW `0x18024C`); `refresh_def_view` re-pointed the host, `rearm_desks` re-armed the owner to it, and the icon list stayed hidden.
- [ ] 4.4 **Blocked.** Needs a second monitor; none attached to this machine. `sync_desks` arms each desk it creates, but the multi-monitor path is unexercised.
- [x] 4.5 **Detach.** Ctrl+Shift+F12 restored Explorer's icons (`DefView visible=True`), released the owner to `0x0`, and returned Alcove to an ordinary 1456x939 window.
- [x] 4.6 e2e harness authored (`openspec/changes/desktop-zorder-owner/e2e.json`, `scripts/e2e/`) and executed green. It fails on the old behaviour: `ownerIsHost` is false in all 31 samples without the change, so the assert step fails deterministically rather than relying on catching the transient cover.

## 5. Keep the desk behind applications

- [x] 5.1 Subclass each desk window and drop the z-order half of `WM_WINDOWPOSCHANGING` when the move rides an activation (`SWP_NOACTIVATE` clear). Our own moves announce themselves through `MOVING` and pass unchanged.
- [x] 5.2 Install the pin in `prepare()` and in `arm_one_desk`, so every desk carries it, including one added for a new monitor.
- [x] 5.3 `scripts/e2e/desk-stays-behind.ps1`: put a real application in front, click a desk pixel, and fail if the desk moved ahead of it or is painted over it. Wired into `e2e.json`.
- [x] 5.4 Verified the test catches the fault: with the pin disabled and rebuilt, both assertions fire; restored, it passes. Win+D and the click check each pass five consecutive runs.
