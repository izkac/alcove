mod desktop;
mod harvest;
mod taskbar;

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
fn open_desktop_item(path: String) -> Result<(), String> {
    harvest::open_item(&path)
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
fn desktop_background() -> Result<harvest::DesktopBackground, String> {
    harvest::desktop_background()
}

#[tauri::command]
fn set_windows_taskbar_hidden(
    window: WebviewWindow,
    state: tauri::State<'_, DesktopState>,
    hidden: bool,
) -> Result<bool, String> {
    let now_hidden = taskbar::set_taskbar_autohide(hidden)?;
    // The work area changes when the taskbar reservation goes away; re-cover it.
    std::thread::sleep(std::time::Duration::from_millis(250));
    let _ = desktop::recover(&window, &state);
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
fn focus_desktop(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DesktopState::default())
        .invoke_handler(tauri::generate_handler![
            attach_to_desktop,
            detach_from_desktop,
            desktop_attached,
            list_desktop_icons,
            open_desktop_item,
            recycle_bin,
            show_recycle_bin_menu,
            empty_recycle_bin,
            recycle_bin_properties,
            desktop_background,
            set_windows_taskbar_hidden,
            windows_taskbar_hidden,
            list_running_windows,
            activate_window,
            focus_desktop,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            desktop::spawn_emergency_hotkey(app.handle().clone());
            taskbar::spawn_bar_peek(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(
                event,
                tauri::WindowEvent::Destroyed | tauri::WindowEvent::CloseRequested { .. }
            ) {
                let handle = window.app_handle();
                if let Some(webview) = handle.get_webview_window(window.label()) {
                    let state = handle.state::<DesktopState>();
                    let _ = desktop::detach(&webview, &state);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
