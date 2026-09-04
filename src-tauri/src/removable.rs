//! Notices which drive letters are removable media, and lets one be ejected.
//!
//! A live-folder drawer already does everything a plugged-in USB stick needs:
//! point one at `E:\` and `list_folder_icons` reads it like any other folder.
//! The two things that do not already exist are knowing `E:\` is removable
//! rather than the system disk, and telling Windows it is safe to pull out —
//! so this is the whole of what is new. The frontend polls `list()` the same
//! way it already polls `desktop_revision` (see `watch.rs`); no device-change
//! listener is needed for a bitmask read plus one call per set bit.

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemovableDrive {
    pub root: String,
    pub name: String,
}

#[cfg(windows)]
mod win {
    use super::RemovableDrive;

    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{
        CloseHandle, ERROR_NOT_READY, ERROR_NO_MEDIA_IN_DRIVE, GENERIC_READ, GENERIC_WRITE, HANDLE,
    };
    use windows::Win32::Storage::FileSystem::{
        CreateFileW, GetDriveTypeW, GetLogicalDrives, GetVolumeInformationW,
        FILE_ATTRIBUTE_NORMAL, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
    };
    use windows::Win32::System::Ioctl::{
        FSCTL_DISMOUNT_VOLUME, FSCTL_LOCK_VOLUME, IOCTL_STORAGE_EJECT_MEDIA,
        IOCTL_STORAGE_MEDIA_REMOVAL, PREVENT_MEDIA_REMOVAL,
    };
    use windows::Win32::System::Diagnostics::Debug::{
        SetThreadErrorMode, SEM_FAILCRITICALERRORS, THREAD_ERROR_MODE,
    };
    use windows::Win32::System::IO::DeviceIoControl;

    // `windows` gates this behind Win32_System_WindowsProgramming, which
    // nothing else here needs — a local copy of one documented constant is a
    // smaller diff than a third feature flag.
    const DRIVE_REMOVABLE: u32 = 2;

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// What a drive letter is holding: a volume with this label (possibly
    /// empty), or nothing at all.
    enum Volume {
        /// A real volume. The label is empty when it has never been named.
        Present(String),
        /// An empty card reader slot — still `DRIVE_REMOVABLE`, but there is
        /// nothing there for a drawer to list.
        NoMedia,
    }

    /// Reads the volume label of an already-widened `root`. Only "no media"
    /// means skip the drive: an unformatted stick fails this call too
    /// (`ERROR_UNRECOGNIZED_VOLUME`), and it is plugged in and worth showing.
    fn volume(root_wide: &[u16]) -> Volume {
        let mut buf = [0u16; 256];
        match unsafe {
            GetVolumeInformationW(PCWSTR(root_wide.as_ptr()), Some(&mut buf), None, None, None, None)
        } {
            Ok(()) => {
                let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
                Volume::Present(String::from_utf16_lossy(&buf[..len]))
            }
            Err(err) if err.code() == ERROR_NOT_READY.to_hresult()
                || err.code() == ERROR_NO_MEDIA_IN_DRIVE.to_hresult() =>
            {
                Volume::NoMedia
            }
            // Unformatted, or a volume we may not read. Either way the stick is
            // in the port, so it gets a drawer under the generic name.
            Err(err) => {
                log::info!("removable: no label available: {err}");
                Volume::Present(String::new())
            }
        }
    }

    /// Asks Windows not to put a modal on screen when a drive cannot answer.
    /// Without it, `GetVolumeInformationW` against an empty card reader slot
    /// raises the "Please insert a disk into drive E:" dialog — and this runs
    /// on a two-second poll, so it would raise it forever. Restores the
    /// previous mode on drop so nothing else on this thread inherits it.
    struct QuietErrors(THREAD_ERROR_MODE);

    impl QuietErrors {
        fn new() -> Self {
            let mut previous = THREAD_ERROR_MODE::default();
            let _ = unsafe { SetThreadErrorMode(SEM_FAILCRITICALERRORS, Some(&mut previous)) };
            Self(previous)
        }
    }

    impl Drop for QuietErrors {
        fn drop(&mut self) {
            let _ = unsafe { SetThreadErrorMode(self.0, None) };
        }
    }

    pub fn list() -> Vec<RemovableDrive> {
        let _quiet = QuietErrors::new();
        let mask = unsafe { GetLogicalDrives() };
        let mut drives = Vec::new();
        for i in 0..26u32 {
            if mask & (1 << i) == 0 {
                continue;
            }
            let letter = (b'A' + i as u8) as char;
            let root = format!("{letter}:\\");
            let root_wide = wide(&root);
            if unsafe { GetDriveTypeW(PCWSTR(root_wide.as_ptr())) } != DRIVE_REMOVABLE {
                continue;
            }
            let label = match volume(&root_wide) {
                Volume::Present(label) => label,
                Volume::NoMedia => continue,
            };
            let name = if label.is_empty() {
                "Removable Disk".into()
            } else {
                label
            };
            drives.push(RemovableDrive { root, name });
        }
        drives
    }

    /// `root` must already look like a drive root — a single letter, a colon,
    /// an optional trailing separator — before it becomes part of a device
    /// path. Anything else is refused rather than handed to `CreateFileW`.
    fn drive_letter(root: &str) -> Result<char, String> {
        let bytes = root.as_bytes();
        let shaped = matches!(bytes.len(), 2 | 3)
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && bytes.get(2).map_or(true, |&b| b == b'\\' || b == b'/');
        if shaped {
            Ok(bytes[0].to_ascii_uppercase() as char)
        } else {
            Err(format!("{root:?} is not a drive root"))
        }
    }

    /// Tells the device it may let go of the media. Takes an input struct, so
    /// it does not fit `control`'s no-buffer shape.
    fn allow_removal(handle: HANDLE, volume: &str) -> Result<(), String> {
        let mut request = PREVENT_MEDIA_REMOVAL {
            PreventMediaRemoval: false,
        };
        let mut returned: u32 = 0;
        unsafe {
            DeviceIoControl(
                handle,
                IOCTL_STORAGE_MEDIA_REMOVAL,
                Some(std::ptr::from_mut(&mut request).cast()),
                std::mem::size_of::<PREVENT_MEDIA_REMOVAL>() as u32,
                None,
                0,
                Some(&mut returned),
                None,
            )
        }
        .map_err(|err| format!("could not unlatch {volume} — {err}"))
    }

    fn control(handle: HANDLE, code: u32, volume: &str, step: &str) -> Result<(), String> {
        let mut returned: u32 = 0;
        unsafe { DeviceIoControl(handle, code, None, 0, None, 0, Some(&mut returned), None) }
            .map_err(|err| format!("could not {step} {volume} — {err}"))
    }

    // This locks, dismounts and asks the media to eject, which is the part
    // that protects data: nothing is written to the volume again after
    // FSCTL_LOCK_VOLUME succeeds. What it does not do is what "Safely Remove
    // Hardware" does — ask the device tree to drop the drive, which is why
    // the letter can linger until the stick is physically pulled. Reaching
    // that would mean IOCTL_STORAGE_GET_DEVICE_NUMBER plus a SetupDi walk
    // down to CM_Request_Device_Eject; worth it if the lingering letter ever
    // turns out to matter, not worth it up front.
    pub fn eject(root: &str) -> Result<(), String> {
        let letter = drive_letter(root)?;
        // Same reason as `list`: a device that has already gone away must not
        // raise a modal on a background thread nobody can see.
        let _quiet = QuietErrors::new();
        let volume = format!("{letter}:");
        let device_path = wide(&format!(r"\\.\{volume}"));

        let handle = unsafe {
            CreateFileW(
                PCWSTR(device_path.as_ptr()),
                (GENERIC_READ | GENERIC_WRITE).0,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                None,
                OPEN_EXISTING,
                FILE_ATTRIBUTE_NORMAL,
                None,
            )
        }
        .map_err(|err| format!("could not open {volume} — {err}"))?;

        // Lock, dismount, unlatch, eject — the documented order. Skipping the
        // unlatch step leaves devices that latch their media refusing the eject.
        let result = control(handle, FSCTL_LOCK_VOLUME, &volume, "lock")
            .and_then(|()| control(handle, FSCTL_DISMOUNT_VOLUME, &volume, "dismount"))
            .and_then(|()| allow_removal(handle, &volume))
            .and_then(|()| control(handle, IOCTL_STORAGE_EJECT_MEDIA, &volume, "eject"));

        // Every path through this closes the handle, lock included — an
        // early return here would leave the volume locked with nothing left
        // holding the handle that could unlock it.
        unsafe {
            let _ = CloseHandle(handle);
        }
        result
    }
}

#[cfg(not(windows))]
mod win {
    use super::RemovableDrive;

    pub fn list() -> Vec<RemovableDrive> {
        Vec::new()
    }

    pub fn eject(_root: &str) -> Result<(), String> {
        Err("removable drives are Windows-only".into())
    }
}

pub fn list() -> Vec<RemovableDrive> {
    win::list()
}

pub fn eject(root: &str) -> Result<(), String> {
    win::eject(root)
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn never_lists_the_system_drive() {
        let system_drive = std::env::var("SystemDrive")
            .unwrap_or_else(|_| "C:".into())
            .to_uppercase();
        let system_root = format!("{system_drive}\\");
        for drive in list() {
            assert_ne!(drive.root, system_root, "system drive should never be removable");
        }
    }

    #[test]
    fn every_root_is_a_drive_root() {
        for drive in list() {
            let bytes = drive.root.as_bytes();
            assert_eq!(bytes.len(), 3, "{:?} should be exactly X:\\", drive.root);
            assert!(bytes[0].is_ascii_alphabetic(), "{:?}", drive.root);
            assert_eq!(bytes[1], b':', "{:?}", drive.root);
            assert_eq!(bytes[2], b'\\', "{:?}", drive.root);
        }
    }

    #[test]
    fn eject_refuses_nonsense_without_touching_hardware() {
        assert!(eject("not a drive").is_err());
        assert!(eject("").is_err());
    }
}
