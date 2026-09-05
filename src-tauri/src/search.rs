use tauri::{AppHandle, Manager, WebviewWindow};

const SEARCH_HOTKEY_ID: i32 = 0xA10C;
// Two-line rows and a hint bar: a file now says its type, size and time under
// its name, which is the only way to tell five downloads apart at a glance.
const SEARCH_WIDTH: f64 = 600.0;
const SEARCH_HEIGHT: f64 = 512.0;

#[cfg(windows)]
mod win {
    use super::*;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        RegisterHotKey, MOD_CONTROL, MOD_NOREPEAT, MOD_SHIFT, VK_SPACE,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, GetMessageW, SetForegroundWindow, SetWindowPos, TranslateMessage,
        HWND_TOPMOST, MSG, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, WM_HOTKEY,
    };

    fn hwnd_of(window: &WebviewWindow) -> Option<HWND> {
        window
            .hwnd()
            .ok()
            .map(|handle| HWND(handle.0 as *mut core::ffi::c_void))
    }

    fn place(window: &WebviewWindow) {
        let Ok(Some(monitor)) = window.primary_monitor() else {
            return;
        };
        let scale = monitor.scale_factor();
        let width = (SEARCH_WIDTH * scale).round() as u32;
        let height = (SEARCH_HEIGHT * scale).round() as u32;
        let _ = window.set_size(tauri::PhysicalSize::new(width, height));
        let origin = monitor.position();
        let area = monitor.size();
        let x = origin.x + (area.width as i32 - width as i32) / 2;
        let y = origin.y + (area.height as i32 - height as i32) / 5;
        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    }

    pub fn show(app: &AppHandle) -> Result<(), String> {
        let window = crate::auxiliary::ensure(app, "search")?;
        place(&window);
        let _ = window.set_shadow(false);
        let _ = window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
        window.show().map_err(|err| err.to_string())?;
        crate::auxiliary::visibility(&window, true);
        let _ = window.unminimize();
        let _ = window.set_focus();
        if let Some(hwnd) = hwnd_of(&window) {
            unsafe {
                let _ = SetWindowPos(
                    hwnd,
                    Some(HWND_TOPMOST),
                    0,
                    0,
                    0,
                    0,
                    SWP_SHOWWINDOW | SWP_NOMOVE | SWP_NOSIZE,
                );
                let _ = SetForegroundWindow(hwnd);
            }
        }
        Ok(())
    }

    pub fn hide(app: &AppHandle) -> Result<(), String> {
        let Some(window) = app.get_webview_window("search") else {
            return Ok(());
        };
        window.hide().map_err(|err| err.to_string())?;
        crate::auxiliary::visibility(&window, false);
        Ok(())
    }

    pub fn toggle(app: &AppHandle) {
        if app.get_webview_window("search").is_some_and(|window| window.is_visible().unwrap_or(false)) {
            let _ = hide(app);
            return;
        }
        let _ = show(app);
    }

    fn register_hotkey() -> Result<&'static str, String> {
        unsafe {
            if RegisterHotKey(
                None,
                SEARCH_HOTKEY_ID,
                MOD_CONTROL | MOD_NOREPEAT,
                VK_SPACE.0 as u32,
            )
            .is_ok()
            {
                return Ok("Ctrl+Space");
            }
            if RegisterHotKey(
                None,
                SEARCH_HOTKEY_ID,
                MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT,
                VK_SPACE.0 as u32,
            )
            .is_ok()
            {
                return Ok("Ctrl+Shift+Space");
            }
        }
        Err("could not register a search hotkey".into())
    }

    pub fn spawn_hotkey(app: AppHandle) {
        std::thread::spawn(move || {
            match register_hotkey() {
                Ok(chord) => log::info!("search hotkey {chord}"),
                Err(err) => {
                    log::warn!("{err}");
                    return;
                }
            }
            let mut msg = MSG::default();
            loop {
                let got = unsafe { GetMessageW(&mut msg, None, 0, 0) };
                if got.0 == 0 || got.0 == -1 {
                    break;
                }
                if msg.message == WM_HOTKEY && msg.wParam.0 == SEARCH_HOTKEY_ID as usize {
                    toggle(&app);
                }
                unsafe {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            }
        });
    }
}

#[cfg(not(windows))]
mod win {
    use super::*;

    pub fn show(_app: &AppHandle) -> Result<(), String> {
        Err("search overlay is Windows-only".into())
    }

    pub fn hide(_app: &AppHandle) -> Result<(), String> {
        Ok(())
    }

    pub fn spawn_hotkey(_app: AppHandle) {}
}

pub fn show(app: &AppHandle) -> Result<(), String> {
    win::show(app)
}

pub fn hide(app: &AppHandle) -> Result<(), String> {
    win::hide(app)
}

pub fn spawn_hotkey(app: AppHandle) {
    win::spawn_hotkey(app)
}
