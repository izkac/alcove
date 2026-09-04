## 1. Rust: enumerate and eject

- [x] 1.1 Add `Win32_System_IO` and `Win32_System_Ioctl` to the `windows` crate features in `src-tauri/Cargo.toml`.
- [x] 1.2 New `src-tauri/src/removable.rs`: `RemovableDrive { root, name }` (serde camelCase) and `list()` — `GetLogicalDrives` bitmask, keep drives whose `GetDriveTypeW` is `DRIVE_REMOVABLE`, name from `GetVolumeInformationW` falling back to `"Removable Disk"`. Non-Windows stub returns empty.
- [x] 1.3 `eject(root)` in the same module: open `\.\X:`, then `FSCTL_LOCK_VOLUME` → `FSCTL_DISMOUNT_VOLUME` → `IOCTL_STORAGE_EJECT_MEDIA` via `DeviceIoControl`, returning the failing step's error. Comment the known ceiling (letter may linger; `CM_Request_Device_Eject` is the upgrade).
- [x] 1.4 Rust test in `removable.rs`: the enumeration never includes the system drive and every entry's root parses as a drive root. Run `cargo test -p alcove removable`.
- [x] 1.5 Register `mod removable`, the `list_removable_drives` and `eject_drive` commands (both `spawn_blocking`) in `src-tauri/src/lib.rs`, and add them to `invoke_handler`. Confirm with `cargo check`.

## 2. Frontend: drive state to drawers

- [x] 2.1 `src/types.ts`: `Alcove.removable?: string | null` (drive root) and `DesktopState.autoDriveDrawers?: boolean`. Default the flag to `true` in `migrate()` and clear any `removable` drawer on load in `src/lib/storage.ts`.
- [x] 2.2 `src/lib/removable-drawers.ts`: pure `syncDriveDrawers(state, drives, enabled)` returning the next state — add missing, drop absent, rename in place, match on drive root, drop the icons of a dropped drawer, and move focus off a drawer it removed. No Tauri, no React.
- [x] 2.3 `src/lib/removable-drawers.check.ts` covering insert, remove, idempotent re-poll, relabel, and disabled-clears-all; wire it into the `check` script in `package.json`. Run `npm run check`.
- [x] 2.4 `src/lib/storage.ts`: `serialize()` drops removable drawers and their icons. Extend the self-check from 2.3 to cover it.
- [x] 2.5 `src/hooks/use-alcove-desktop.ts`: poll `list_removable_drives` on the existing 2s `desktop_revision` interval and feed `syncDriveDrawers`; expose `ejectDrive(alcoveId)` which invokes `eject_drive`, removes the drawer on success and toasts the drive name on failure.

## 3. UI

- [x] 3.1 Eject button in the removable drawer's header in `src/components/alcove-panel.tsx` and `src/components/alcove-canvas.tsx` (`onEject` prop, rendered only when `alcove.removable`), wired through `src/components/desktop-shell.tsx`.
- [x] 3.2 "Open a drawer for USB drives" switch in `src/components/settings-dialog.tsx` bound to `autoDriveDrawers`.

## 4. Verify

- [x] 4.1 `npm run check`, `npx oxlint src`, `npx tsc -b --noEmit`, `npm run build` and `cargo test` all clean; `cargo clippy` clean for `removable.rs` (the repo has pre-existing warnings in `harvest.rs`, `search.rs` and `taskbar.rs` that this change does not touch).
- [ ] 4.2 **Manual, needs hardware.** No scriptable e2e exists — Windows reports `subst` drives and mounted VHDs as `DRIVE_FIXED`, so nothing synthesises a `DRIVE_REMOVABLE` volume without a third-party driver (recorded via `forge e2e skip`). Plug a stick in: the drawer appears with its files; eject from the drawer; the drawer closes.
