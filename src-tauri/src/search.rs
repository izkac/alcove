use tauri::{AppHandle, Manager, WebviewWindow};

const SEARCH_HOTKEY_ID: i32 = 0xA10C;
// Two-line rows and a hint bar: a file now says its type, size and time under
// its name, which is the only way to tell five downloads apart at a glance.
const SEARCH_WIDTH: f64 = 600.0;
const SEARCH_HEIGHT: f64 = 512.0;

#[cfg(windows)]
mod win {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::{mpsc, Mutex};
    use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS, MOD_ALT, MOD_CONTROL, MOD_NOREPEAT,
        MOD_SHIFT, VK_SPACE,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, GetMessageW, PeekMessageW, PostThreadMessageW, SetForegroundWindow,
        SetWindowPos, TranslateMessage, HWND_TOPMOST, MSG, PM_NOREMOVE, SWP_NOMOVE, SWP_NOSIZE,
        SWP_SHOWWINDOW, WM_APP, WM_HOTKEY,
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

    /// The hotkey belongs to the thread that registered it, so a change of
    /// shortcut is posted to that thread rather than done from the command.
    static THREAD: AtomicU32 = AtomicU32::new(0);
    static REPLY: Mutex<Option<mpsc::Sender<()>>> = Mutex::new(None);
    const WM_REREGISTER: u32 = WM_APP + 0xA1;

    /// Ctrl+Space is also autocomplete in most editors, so it is a choice,
    /// not a given. The default keeps the old fallback to Ctrl+Shift+Space.
    fn register(choice: &str) -> Option<&'static str> {
        let tries: &[(HOT_KEY_MODIFIERS, &'static str)] = match choice {
            "off" => &[],
            "ctrl-alt-space" => &[(MOD_CONTROL | MOD_ALT, "Ctrl+Alt+Space")],
            _ => &[
                (MOD_CONTROL, "Ctrl+Space"),
                (MOD_CONTROL | MOD_SHIFT, "Ctrl+Shift+Space"),
            ],
        };
        unsafe {
            let _ = UnregisterHotKey(None, SEARCH_HOTKEY_ID);
        }
        tries.iter().find_map(|(mods, label)| {
            unsafe {
                RegisterHotKey(None, SEARCH_HOTKEY_ID, *mods | MOD_NOREPEAT, VK_SPACE.0 as u32)
            }
            .is_ok()
            .then_some(*label)
        })
    }

    fn apply_saved() {
        let choice = super::saved_choice();
        let got = register(&choice);
        log::info!("search hotkey {choice}: {}", got.unwrap_or("none"));
        if let Ok(mut active) = super::ACTIVE.lock() {
            *active = got.unwrap_or_default().to_string();
        }
    }

    pub fn reregister() -> Result<(), String> {
        let thread = THREAD.load(Ordering::SeqCst);
        if thread == 0 {
            return Err("search hotkey is not running".into());
        }
        let (tx, rx) = mpsc::channel();
        *REPLY.lock().map_err(|err| err.to_string())? = Some(tx);
        unsafe { PostThreadMessageW(thread, WM_REREGISTER, WPARAM(0), LPARAM(0)) }
            .map_err(|err| err.to_string())?;
        rx.recv_timeout(std::time::Duration::from_secs(1))
            .map_err(|_| "search hotkey did not answer".to_string())
    }

    pub fn spawn_hotkey(app: AppHandle) {
        std::thread::spawn(move || {
            let mut msg = MSG::default();
            // Create this thread's queue before anyone can post to it.
            unsafe {
                let _ = PeekMessageW(&mut msg, None, 0, 0, PM_NOREMOVE);
            }
            THREAD.store(unsafe { GetCurrentThreadId() }, Ordering::SeqCst);
            apply_saved();
            loop {
                let got = unsafe { GetMessageW(&mut msg, None, 0, 0) };
                if got.0 == 0 || got.0 == -1 {
                    break;
                }
                if msg.message == WM_HOTKEY && msg.wParam.0 == SEARCH_HOTKEY_ID as usize {
                    toggle(&app);
                }
                if msg.message == WM_REREGISTER {
                    apply_saved();
                    if let Some(reply) = REPLY.lock().ok().and_then(|mut slot| slot.take()) {
                        let _ = reply.send(());
                    }
                    continue;
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

    pub fn reregister() -> Result<(), String> {
        Err("search hotkey is Windows-only".into())
    }
}

const CHOICES: [&str; 3] = ["ctrl-space", "ctrl-alt-space", "off"];

/// The chord actually registered right now, "" when none.
static ACTIVE: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());

fn choice_path() -> std::path::PathBuf {
    std::path::PathBuf::from(std::env::var_os("APPDATA").unwrap_or_default())
        .join("com.alcove.desktop")
        .join("search-hotkey")
}

fn saved_choice() -> String {
    std::fs::read_to_string(choice_path())
        .ok()
        .map(|text| text.trim().to_string())
        .filter(|text| CHOICES.contains(&text.as_str()))
        .unwrap_or_else(|| CHOICES[0].to_string())
}

#[derive(serde::Serialize)]
pub struct SearchHotkey {
    pub choice: String,
    pub active: String,
}

pub fn hotkey() -> SearchHotkey {
    SearchHotkey {
        choice: saved_choice(),
        active: ACTIVE.lock().map(|active| active.clone()).unwrap_or_default(),
    }
}

pub fn set_hotkey(choice: &str) -> Result<SearchHotkey, String> {
    if !CHOICES.contains(&choice) {
        return Err(format!("unknown shortcut: {choice}"));
    }
    let path = choice_path();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|err| err.to_string())?;
    }
    std::fs::write(&path, choice).map_err(|err| err.to_string())?;
    win::reregister()?;
    let now = hotkey();
    if choice != "off" && now.active.is_empty() {
        return Err("Another program already uses that shortcut".into());
    }
    Ok(now)
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
