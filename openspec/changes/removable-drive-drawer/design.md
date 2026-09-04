## Context

Live-folder drawers already do almost all of this. An `Alcove` with a
`folderPath` lists that folder through `list_folder_icons`, renders in
icons/list/details, drills into subfolders and accepts drags. Point one at
`E:\` and the drawer is done. What is missing is (a) knowing `E:\` arrived,
(b) knowing it left, (c) ejecting it, and (d) keeping the drawer out of the
saved state.

The Desktop watcher (`src-tauri/src/watch.rs`) is the local precedent for (a):
Rust keeps a counter, the frontend polls it every 2s and re-reads when it moves.

## Goals / Non-Goals

**Goals:**
- A drawer per removable volume, appearing and disappearing with the volume.
- Eject from inside the drawer, with an honest failure message.
- Zero residue in `desktop.json`.

**Non-Goals:**
- Suppressing Windows Autoplay. That is a system setting Alcove has no business
  writing; the drawer competes with the dialog rather than replacing it.
- Camera/MTP devices. Phones and cameras that mount over MTP have no drive
  letter and no folder path, so `list_folder_icons` has nothing to read. Only
  volumes with a drive letter are in scope.
- Per-drive memory (name, colour, view). A drawer that exists for the length of
  one plug-in does not need preferences.

## Decisions

**Poll `GetLogicalDrives` from the frontend, no new Rust thread.** The obvious
build note was "a volume-change listener" — `WM_DEVICECHANGE`, a message-only
window, a revision counter like `watch.rs`. But the frontend already runs a 2s
poll for `desktop_revision`, and enumerating drives is a bitmask read plus one
`GetDriveTypeW` per set bit. One new command, `list_removable_drives`, called on
the interval that already exists, is the whole listener. A dropped tick costs two
seconds, same as the Desktop watcher.

**Eject via lock → dismount → eject-media on `\.\E:`.** `CM_Request_Device_Eject`
is what "Safely remove hardware" calls, but reaching it from a drive letter means
`IOCTL_STORAGE_GET_DEVICE_NUMBER` plus a SetupDi device-tree walk — roughly 150
lines for the difference between "safe to unplug" and "the letter also vanishes".
The three `DeviceIoControl` calls flush and dismount the volume, which is the part
that protects data. On some sticks the drive letter lingers until you physically
pull it; the drawer closes either way. Marked in the source with the upgrade path.

**Removable drawers live in `state.alcoves` like any other.** The alternative was
deriving them at render time, which keeps state clean but means every consumer of
`alcoves` — panels, canvas, drag targets, the icon context menu's "move to" list,
search — needs to learn about a second source. One optional field (`removable`,
holding the drive root) plus a filter in `serialize()` is a much smaller diff, and
everything downstream keeps working unchanged.

**Match drawers to drives by drive root, not by name.** A stick relabelled between
plug-ins is the same drawer; two sticks with the same label are two drawers.

## Risks / Trade-offs

- **A drawer opening unasked is intrusive.** Hence the settings switch, and hence
  the drawer never stealing focus away from a canvas the user has open.
- **`GetVolumeInformationW` can block** on a drive that is spinning up or on a
  card reader with no card. The command runs on a blocking thread, and a drive
  that will not answer falls back to "Removable Disk" rather than hanging.
- **Eject can legitimately fail** when another program holds a file open. The
  failure surfaces as a toast naming the drive; the drawer stays put.
