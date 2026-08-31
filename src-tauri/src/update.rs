use tauri::{AppHandle, Manager};
use tauri_plugin_updater::UpdaterExt;

/// A newer build, and whether this install is entitled to it.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Available {
    pub version: String,
    pub licensed: bool,
}

/// Ask the release feed whether there is a newer build. `None` means we are
/// current, the network is down, or the feed is unreachable — all three are the
/// same to the caller, because none of them is worth interrupting anyone over.
///
/// An unlicensed install is still told a version exists. Hiding it would be the
/// dishonest half of a paywall: the software is free and stays free, and what a
/// licence buys is being able to move to the new one.
pub async fn check(app: &AppHandle) -> Option<Available> {
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(err) => {
            log::warn!("updater unavailable: {err}");
            return None;
        }
    };
    match updater.check().await {
        Ok(Some(update)) => Some(Available {
            version: update.version.clone(),
            licensed: crate::licence::active(app),
        }),
        Ok(None) => None,
        Err(err) => {
            log::info!("update check: {err}");
            None
        }
    }
}

/// Fetch the new build and hand over to its installer.
///
/// Download and install are kept apart on purpose. The download is slow and has
/// no side effects; the install spawns the NSIS installer, which takes this
/// process down with it. Alcove hides Explorer's icon list while it is attached,
/// so the desktop has to be handed back in the gap between the two — after that
/// point nothing of ours is guaranteed to run again.
pub async fn install(app: &AppHandle) -> Result<(), String> {
    if !crate::licence::active(app) {
        return Err("A licence keeps Alcove updated. This copy keeps working as it is.".into());
    }
    let updater = app.updater().map_err(|err| err.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "Alcove is already up to date".to_string())?;

    let mut seen = 0usize;
    let bytes = update
        .download(
            |chunk, total| {
                seen += chunk;
                if let Some(total) = total {
                    log::info!("update: {seen}/{total} bytes");
                }
            },
            || log::info!("update downloaded"),
        )
        .await
        .map_err(|err| err.to_string())?;

    if let Some(main) = app.get_webview_window("main") {
        let state = app.state::<crate::desktop::DesktopState>();
        let _ = crate::desktop::detach(&main, &state);
    }

    update.install(bytes).map_err(|err| err.to_string())?;
    // NSIS normally takes us down and relaunches; this covers the case it does not.
    app.restart();
}
