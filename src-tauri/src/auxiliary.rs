use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewWindow, WebviewWindowBuilder};

// Creation can be requested by desktop readiness and the search hotkey at
// once. Builders run on a worker, never inside a synchronous IPC callback.
static CREATION: Mutex<()> = Mutex::new(());

pub fn ensure(app: &AppHandle, label: &str) -> Result<WebviewWindow, String> {
    let _guard = CREATION.lock().map_err(|err| err.to_string())?;
    if let Some(window) = app.get_webview_window(label) {
        return Ok(window);
    }
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|config| config.label == label)
        .ok_or_else(|| format!("missing window config: {label}"))?;
    WebviewWindowBuilder::from_config(app, config)
        .map_err(|err| err.to_string())?
        .build()
        .map_err(|err| err.to_string())
}

pub fn prewarm(app: &AppHandle) -> Result<(), String> {
    ensure(app, "search")?;
    ensure(app, "bar")?;
    Ok(())
}

pub fn visibility(window: &WebviewWindow, visible: bool) {
    let _ = window.eval(&format!(
        "window.__ALCOVE_VISIBLE__={visible};window.dispatchEvent(new Event('alcove-visibility'));"
    ));
}
