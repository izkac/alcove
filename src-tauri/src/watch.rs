//! Notices when the Desktop folder changes underneath us.
//!
//! Alcove reads the real Desktop once at startup and then never looks again, so
//! a file saved by a browser, an installer's new shortcut, or anything unzipped
//! there stays invisible until the app restarts. That is the gap this closes.
//!
//! It deliberately does not say *what* changed. Windows will tell us, but the
//! answer is never worth the bookkeeping: the only useful response to "the
//! Desktop changed" is to read it again, which the frontend already knows how to
//! do. So this keeps a counter, and the UI re-harvests whenever it moves.

use std::sync::atomic::{AtomicU64, Ordering};

/// Bumped once per settled burst of Desktop changes. The frontend re-reads the
/// Desktop whenever it sees this move.
static REVISION: AtomicU64 = AtomicU64::new(0);

pub fn revision() -> u64 {
    REVISION.load(Ordering::Relaxed)
}

pub fn spawn() {
    let dirs = crate::harvest::desktop_dirs();
    if dirs.is_empty() {
        log::warn!("desktop watch: no Desktop folder to watch");
        return;
    }
    watch_dirs(dirs, || {
        // The memo would otherwise hand the frontend back the listing we just
        // learned is stale.
        crate::harvest::forget_icons();
        REVISION.fetch_add(1, Ordering::Relaxed);
    });
}

/// Saving a file, unzipping an archive or running an installer produces a burst
/// of notifications, not one. Wait for the folder to go quiet before saying so,
/// or a 50-file unzip costs 50 full harvests.
#[cfg(windows)]
const SETTLE_MS: u32 = 400;

/// Call `changed` once per settled burst of changes in any of `dirs`.
#[cfg(windows)]
fn watch_dirs<F>(dirs: Vec<std::path::PathBuf>, changed: F)
where
    F: Fn() + Send + 'static,
{
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{HANDLE, WAIT_EVENT, WAIT_OBJECT_0, WAIT_TIMEOUT};
    use windows::Win32::Storage::FileSystem::{
        FindCloseChangeNotification, FindFirstChangeNotificationW, FindNextChangeNotification,
        FILE_NOTIFY_CHANGE_ATTRIBUTES, FILE_NOTIFY_CHANGE_DIR_NAME, FILE_NOTIFY_CHANGE_FILE_NAME,
        FILE_NOTIFY_CHANGE_LAST_WRITE, FILE_NOTIFY_CHANGE_SIZE,
    };
    use windows::Win32::System::Threading::{WaitForMultipleObjects, INFINITE};

    /// Which handle woke us, if any.
    fn fired(event: WAIT_EVENT, count: usize) -> Option<usize> {
        let index = event.0.checked_sub(WAIT_OBJECT_0.0)? as usize;
        (index < count).then_some(index)
    }

    let started = std::thread::Builder::new()
        .name("alcove-desktop-watch".into())
        .spawn(move || {
            let filter = FILE_NOTIFY_CHANGE_FILE_NAME
                | FILE_NOTIFY_CHANGE_DIR_NAME
                | FILE_NOTIFY_CHANGE_ATTRIBUTES
                | FILE_NOTIFY_CHANGE_SIZE
                | FILE_NOTIFY_CHANGE_LAST_WRITE;

            let mut handles: Vec<HANDLE> = Vec::new();
            for dir in &dirs {
                let wide: Vec<u16> = dir
                    .as_os_str()
                    .encode_wide()
                    .chain(std::iter::once(0))
                    .collect();
                match unsafe { FindFirstChangeNotificationW(PCWSTR(wide.as_ptr()), false, filter) }
                {
                    Ok(handle) if !handle.is_invalid() => {
                        log::info!("watching {}", dir.display());
                        handles.push(handle);
                    }
                    Ok(_) => log::warn!("desktop watch: {} gave no handle", dir.display()),
                    Err(err) => log::warn!("desktop watch: {}: {err}", dir.display()),
                }
            }
            if handles.is_empty() {
                return;
            }

            loop {
                let signalled = unsafe { WaitForMultipleObjects(&handles, false, INFINITE) };
                let Some(index) = fired(signalled, handles.len()) else {
                    log::warn!("desktop watch: wait failed, giving up");
                    break;
                };
                // Re-arm before draining, or changes made during the settle
                // window are lost instead of folded into this burst.
                if unsafe { FindNextChangeNotification(handles[index]) }.is_err() {
                    log::warn!("desktop watch: could not re-arm, giving up");
                    break;
                }
                loop {
                    let more = unsafe { WaitForMultipleObjects(&handles, false, SETTLE_MS) };
                    if more == WAIT_TIMEOUT {
                        break;
                    }
                    let Some(index) = fired(more, handles.len()) else {
                        break;
                    };
                    if unsafe { FindNextChangeNotification(handles[index]) }.is_err() {
                        break;
                    }
                }
                changed();
            }

            for handle in handles {
                let _ = unsafe { FindCloseChangeNotification(handle) };
            }
        });
    if let Err(err) = started {
        log::warn!("desktop watch: could not start: {err}");
    }
}

#[cfg(not(windows))]
fn watch_dirs<F>(_dirs: Vec<std::path::PathBuf>, _changed: F)
where
    F: Fn() + Send + 'static,
{
}

#[cfg(all(test, windows))]
mod tests {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    /// Wait for `hits` to reach `want`, or give up. Change notifications are
    /// asynchronous and the watcher waits out a settle window on top, so this
    /// polls rather than sleeping a fixed guess.
    fn wait_for(hits: &AtomicU64, want: u64, limit: Duration) -> u64 {
        let deadline = Instant::now() + limit;
        while Instant::now() < deadline {
            let seen = hits.load(Ordering::Relaxed);
            if seen >= want {
                return seen;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        hits.load(Ordering::Relaxed)
    }

    #[test]
    fn a_new_file_moves_the_revision() {
        let dir = std::env::temp_dir().join(format!("alcove-watch-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temp dir");

        let hits = Arc::new(AtomicU64::new(0));
        let counter = Arc::clone(&hits);
        super::watch_dirs(vec![dir.clone()], move || {
            counter.fetch_add(1, Ordering::Relaxed);
        });
        // Let the watch arm before touching the folder.
        std::thread::sleep(Duration::from_millis(300));
        assert_eq!(hits.load(Ordering::Relaxed), 0, "quiet folder, no change");

        std::fs::write(dir.join("saved-by-some-other-program.txt"), b"hi").expect("write");
        assert_eq!(
            wait_for(&hits, 1, Duration::from_secs(5)),
            1,
            "a file appearing in the folder is one change"
        );

        // A burst is one re-read, not one per file: this is the whole reason the
        // watcher waits for the folder to go quiet.
        for i in 0..25 {
            std::fs::write(dir.join(format!("unzipped-{i}.txt")), b"x").expect("write");
        }
        let after = wait_for(&hits, 2, Duration::from_secs(5));
        assert!(after >= 2, "the burst was noticed (saw {after})");
        assert!(
            after < 10,
            "25 files coalesced into a few reads, not 25 (saw {after})"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}
