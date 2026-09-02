use std::io::Write;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|err| err.to_string())
        .map(|dir| dir.join("desktop.json"))
}

pub fn load(app: &AppHandle) -> Result<Option<String>, String> {
    let path = state_path(app)?;
    if !path.is_file() {
        return Ok(None);
    }
    std::fs::read_to_string(&path)
        .map(Some)
        .map_err(|err| err.to_string())
}

/// Write to a sibling temp file, flush it to disk, then rename over the target.
/// A plain write is one kill or power cut away from a truncated `desktop.json`,
/// and a truncated state file drops the user back into onboarding with every
/// drawer, group, pin and per-monitor layout gone. The rename is atomic, so the
/// worst case is losing the newest change, never the whole desk.
pub fn save(app: &AppHandle, json: String) -> Result<(), String> {
    let path = state_path(app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|err| err.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    {
        let mut file = std::fs::File::create(&tmp).map_err(|err| err.to_string())?;
        file.write_all(json.as_bytes())
            .map_err(|err| err.to_string())?;
        // Rename is atomic but only orders metadata; without this the rename can
        // land before the bytes do and survive a power cut pointing at nothing.
        file.sync_all().map_err(|err| err.to_string())?;
    }
    std::fs::rename(&tmp, &path).map_err(|err| err.to_string())
}

fn hidden_marker(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|err| err.to_string())
        .map(|dir| dir.join("desktop-hidden"))
}

/// Records that Explorer's icon list is hidden right now. Clean shutdowns clear
/// it; a marker still present at startup means the previous run was killed or
/// crashed while the real desktop icons were hidden.
pub fn mark_desktop_hidden(app: &AppHandle, hidden: bool) {
    let Ok(path) = hidden_marker(app) else {
        return;
    };
    if hidden {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(&path, b"1");
    } else {
        let _ = std::fs::remove_file(&path);
    }
}

pub fn desktop_left_hidden(app: &AppHandle) -> bool {
    hidden_marker(app)
        .map(|path| path.is_file())
        .unwrap_or(false)
}
