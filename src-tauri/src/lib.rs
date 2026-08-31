mod autostart;
mod desktop;
mod harvest;
mod licence;
mod persist;
mod search;
mod taskbar;
mod update;

use desktop::DesktopState;
use tauri::{Manager, WebviewWindow};

#[tauri::command]
fn attach_to_desktop(
    window: WebviewWindow,
    state: tauri::State<'_, DesktopState>,
) -> Result<bool, String> {
    desktop::attach(&window, &state)?;
    Ok(true)
}

#[tauri::command]
fn detach_from_desktop(
    window: WebviewWindow,
    state: tauri::State<'_, DesktopState>,
) -> Result<bool, String> {
    desktop::detach(&window, &state)?;
    Ok(false)
}

#[tauri::command]
fn desktop_attached(state: tauri::State<'_, DesktopState>) -> bool {
    state.attached()
}

#[tauri::command]
fn list_desktop_icons() -> Result<Vec<harvest::HarvestedIcon>, String> {
    harvest::list_icons()
}

#[tauri::command]
fn list_folder_icons(path: String) -> Result<Vec<harvest::HarvestedIcon>, String> {
    harvest::list_folder(&path)
}

#[tauri::command]
fn shell_icon(target: String) -> Result<String, String> {
    harvest::shell_icon(&target)
}

/// Async so a cold PDF/video thumbnail extraction runs off the main thread —
/// this fires on every selection change and must never stall the desktop.
#[tauri::command]
async fn thumbnail(path: String) -> Result<Option<String>, String> {
    harvest::thumb_data_url(std::path::Path::new(&path))
}

#[tauri::command]
fn list_known_folders() -> Vec<harvest::KnownFolder> {
    harvest::known_folders()
}

#[tauri::command]
fn pick_folder(_window: WebviewWindow) -> Result<Option<String>, String> {
    harvest::pick_folder(0)
}

#[tauri::command]
fn open_desktop_item(path: String, args: Option<String>) -> Result<(), String> {
    harvest::open_item_with(&path, args.as_deref())
}

#[tauri::command]
fn recycle_bin() -> Result<harvest::RecycleBin, String> {
    harvest::recycle_bin()
}

#[tauri::command]
fn show_recycle_bin_menu(window: WebviewWindow, x: i32, y: i32) -> Result<(), String> {
    let hwnd = window
        .hwnd()
        .map(|handle| handle.0 as isize)
        .map_err(|err| err.to_string())?;
    window
        .run_on_main_thread(move || {
            if let Err(err) = harvest::popup_recycle_bin_menu(hwnd, x, y) {
                log::warn!("recycle bin menu: {err}");
            }
        })
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn empty_recycle_bin() -> Result<(), String> {
    harvest::empty_recycle_bin()
}

#[tauri::command]
fn recycle_bin_properties() -> Result<(), String> {
    harvest::recycle_bin_properties()
}

#[tauri::command]
fn paste_into_folder(window: WebviewWindow, dest: Option<String>) -> Result<(), String> {
    let hwnd = window
        .hwnd()
        .map(|handle| handle.0 as isize)
        .map_err(|err| err.to_string())?;
    let (tx, rx) = std::sync::mpsc::channel();
    window
        .run_on_main_thread(move || {
            let _ = tx.send(harvest::paste_into(hwnd, dest.as_deref()));
        })
        .map_err(|err| err.to_string())?;
    rx.recv().map_err(|err| err.to_string())?
}

#[tauri::command]
fn recycle_desktop_items(window: WebviewWindow, paths: Vec<String>) -> Result<(), String> {
    let hwnd = window
        .hwnd()
        .map(|handle| handle.0 as isize)
        .map_err(|err| err.to_string())?;
    let (tx, rx) = std::sync::mpsc::channel();
    window
        .run_on_main_thread(move || {
            let _ = tx.send(harvest::recycle_paths(hwnd, &paths));
        })
        .map_err(|err| err.to_string())?;
    rx.recv().map_err(|err| err.to_string())?
}

#[tauri::command]
fn desktop_background() -> Result<harvest::DesktopBackground, String> {
    harvest::desktop_background()
}

#[tauri::command]
fn set_windows_taskbar_hidden(
    app: tauri::AppHandle,
    state: tauri::State<'_, DesktopState>,
    hidden: bool,
) -> Result<bool, String> {
    let now_hidden = taskbar::set_taskbar_autohide(hidden)?;
    // The work area changes when the taskbar reservation goes away; re-cover it.
    std::thread::sleep(std::time::Duration::from_millis(250));
    let _ = desktop::recover_all(&app, &state);
    Ok(now_hidden)
}

#[tauri::command]
fn windows_taskbar_hidden() -> bool {
    taskbar::taskbar_autohidden()
}

#[tauri::command]
fn list_running_windows() -> Result<Vec<taskbar::RunningApp>, String> {
    taskbar::list_running()
}

#[tauri::command]
fn activate_window(hwnd: isize) -> Result<(), String> {
    taskbar::activate(hwnd)
}

#[tauri::command]
fn this_desk(window: WebviewWindow) -> Result<desktop::DeskInfo, String> {
    desktop::this_desk(&window)
}

#[tauri::command]
fn list_desks(app: tauri::AppHandle) -> Result<Vec<desktop::DeskInfo>, String> {
    desktop::list_desks(&app)
}

#[tauri::command]
fn desk_hit(app: tauri::AppHandle) -> Option<desktop::DeskHit> {
    desktop::desk_hit(&app)
}

#[tauri::command]
fn focus_desktop(app: tauri::AppHandle) -> Result<(), String> {
    for (label, window) in app.webview_windows() {
        if label != "main" && !label.starts_with("desk-") {
            continue;
        }
        let _ = window.show();
        let _ = window.unminimize();
    }
    Ok(())
}

#[tauri::command]
fn show_search_window(app: tauri::AppHandle) -> Result<(), String> {
    search::show(&app)
}

#[tauri::command]
fn hide_search_window(app: tauri::AppHandle) -> Result<(), String> {
    search::hide(&app)
}

#[tauri::command]
fn autostart_enabled() -> bool {
    autostart::is_enabled()
}

#[tauri::command]
fn set_autostart(enabled: bool) -> Result<bool, String> {
    if enabled {
        autostart::enable()?;
    } else {
        autostart::disable()?;
    }
    Ok(autostart::is_enabled())
}

/// The newer version on the release feed, or null when we are current or
/// offline. Never errors: a failed check must not become a popup.
#[tauri::command]
async fn update_available(app: tauri::AppHandle) -> Option<update::Available> {
    update::check(&app).await
}

#[tauri::command]
fn licence_status(app: tauri::AppHandle) -> Option<licence::Licence> {
    licence::load(&app)
}

#[tauri::command]
fn activate_licence(app: tauri::AppHandle, key: String) -> Result<licence::Licence, String> {
    licence::store(&app, &key)
}

#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    update::install(&app).await
}

#[tauri::command]
fn load_desktop_state(app: tauri::AppHandle) -> Result<Option<String>, String> {
    persist::load(&app)
}

#[tauri::command]
fn save_desktop_state(app: tauri::AppHandle, json: String) -> Result<(), String> {
    persist::save(&app, json)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(all(windows, not(debug_assertions)))]
    if !autostart::claim_singleton() {
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(DesktopState::default())
        .invoke_handler(tauri::generate_handler![
            attach_to_desktop,
            detach_from_desktop,
            desktop_attached,
            list_desktop_icons,
            list_folder_icons,
            list_known_folders,
            shell_icon,
            thumbnail,
            pick_folder,
            open_desktop_item,
            recycle_bin,
            show_recycle_bin_menu,
            empty_recycle_bin,
            recycle_bin_properties,
            paste_into_folder,
            recycle_desktop_items,
            desktop_background,
            set_windows_taskbar_hidden,
            windows_taskbar_hidden,
            list_running_windows,
            activate_window,
            focus_desktop,
            show_search_window,
            hide_search_window,
            autostart_enabled,
            set_autostart,
            this_desk,
            list_desks,
            desk_hit,
            load_desktop_state,
            save_desktop_state,
            update_available,
            install_update,
            licence_status,
            activate_licence,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // A killed or crashed run leaves Explorer's icons hidden and nothing
            // on screen to say why. Put them back before we hide them again.
            if persist::desktop_left_hidden(app.handle()) {
                log::warn!("previous run left the desktop icons hidden; restoring");
                desktop::repair_hidden_desktop();
                persist::mark_desktop_hidden(app.handle(), false);
            }

            if let Some(main) = app.get_webview_window("main") {
                let _ = main.hide();
                let state = app.state::<DesktopState>();
                let _ = desktop::prepare(&main, &state);
            }

            desktop::spawn_emergency_hotkey(app.handle().clone());
            taskbar::spawn_bar_peek(app.handle().clone());
            search::spawn_hotkey(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "search" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
                return;
            }
            if window.label().starts_with("desk-") {
                return;
            }
            if window.label() != "main" {
                return;
            }
            if matches!(
                event,
                tauri::WindowEvent::Destroyed | tauri::WindowEvent::CloseRequested { .. }
            ) {
                let handle = window.app_handle();
                if let Some(webview) = handle.get_webview_window("main") {
                    let state = handle.state::<DesktopState>();
                    let _ = desktop::detach(&webview, &state);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|handle, event| {
            // Second net under on_window_event: a quit that never destroys the
            // main window must still hand the desktop back.
            if matches!(event, tauri::RunEvent::Exit) {
                if let Some(main) = handle.get_webview_window("main") {
                    let state = handle.state::<DesktopState>();
                    let _ = desktop::detach(&main, &state);
                }
            }
        });
}
