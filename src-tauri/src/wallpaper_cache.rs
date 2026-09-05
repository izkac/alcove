//! Retain fitted monitor variants; serialize publication and pruning.
use std::path::Path;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};

static FILES: Mutex<()> = Mutex::new(());
static TEMP_ID: AtomicU64 = AtomicU64::new(0);
const MAX_FILES: usize = 16;
const MAX_BYTES: u64 = 64 * 1024 * 1024;

pub fn read(file: &Path) -> Option<Vec<u8>> {
    let _guard = FILES.lock().ok()?;
    if std::fs::metadata(file).ok()?.len() > MAX_BYTES {
        return None;
    }
    let bytes = std::fs::read(file).ok()?;
    (bytes.len() > 32).then_some(bytes)
}

pub fn write(file: &Path, jpeg: &[u8]) {
    let Ok(_guard) = FILES.lock() else { return };
    let _ = write_with_limits(file, jpeg, MAX_FILES, MAX_BYTES);
}

fn write_with_limits(
    file: &Path,
    jpeg: &[u8],
    max_files: usize,
    max_bytes: u64,
) -> std::io::Result<()> {
    use std::io::Write;
    if jpeg.len() as u64 > max_bytes || max_files == 0 {
        return Ok(());
    }
    let Some(dir) = file.parent() else {
        return Ok(());
    };
    let tmp = file.with_extension(format!(
        "jpg.{}.{}.tmp",
        std::process::id(),
        TEMP_ID.fetch_add(1, Ordering::Relaxed)
    ));
    let result = (|| {
        let mut output = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&tmp)?;
        output.write_all(jpeg)?;
        drop(output);
        std::fs::rename(&tmp, file)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result?;
    let mut files = std::fs::read_dir(dir)?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            // Temporary files belong to their writer; pruning never touches them.
            if path.extension().map_or(true, |ext| ext != "jpg") {
                return None;
            }
            let meta = entry.metadata().ok()?;
            if !meta.is_file() {
                return None;
            }
            Some((
                path,
                meta.len(),
                meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH),
            ))
        })
        .collect::<Vec<_>>();
    files.sort_by_key(|(path, _, modified)| (path == file, *modified));
    let mut bytes: u64 = files.iter().map(|(_, size, _)| size).sum();
    let mut count = files.len();
    for (path, size, _) in files {
        if count <= max_files && bytes <= max_bytes {
            break;
        }
        if path != file && std::fs::remove_file(path).is_ok() {
            count -= 1;
            bytes -= size;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retains_monitor_variants_and_prunes_only_finished_images() {
        let dir = std::env::temp_dir().join(format!(
            "alcove-wallpaper-test-{}-{}",
            std::process::id(),
            TEMP_ID.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let a = dir.join("1920x1080.jpg");
        let b = dir.join("2560x1440.jpg");
        let temp = dir.join("other.jpg.tmp");
        std::fs::write(&temp, [0; 10]).unwrap();
        write_with_limits(&a, &[1; 64], 2, 128).unwrap();
        write_with_limits(&b, &[2; 64], 2, 128).unwrap();
        assert_eq!(read(&a).unwrap(), [1; 64]);
        assert_eq!(read(&b).unwrap(), [2; 64]);
        write_with_limits(&b, &[3; 64], 2, 128).unwrap();
        assert_eq!(read(&b).unwrap(), [3; 64]);
        let c = dir.join("3840x2160.jpg");
        write_with_limits(&c, &[4; 80], 2, 128).unwrap();
        assert!(temp.exists());
        assert_eq!(read(&c).unwrap(), [4; 80]);
        assert!(!a.exists() && !b.exists());
        write_with_limits(&a, &[5; 129], 2, 128).unwrap();
        assert!(!a.exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
