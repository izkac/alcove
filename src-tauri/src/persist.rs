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
    std::fs::read_to_string(&path).map(Some).map_err(|err| err.to_string())
}

pub fn save(app: &AppHandle, json: String) -> Result<(), String> {
    let path = state_path(app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|err| err.to_string())?;
    }
    std::fs::write(&path, json).map_err(|err| err.to_string())
}
