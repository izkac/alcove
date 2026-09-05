//! Windows notifications wake desktop recovery; a watchdog covers missed events.
#[cfg(windows)]
mod win {
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        OnceLock,
    };
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
    use windows::Win32::UI::WindowsAndMessaging::*;

    static WORKER: OnceLock<std::thread::Thread> = OnceLock::new();
    static DIRTY: AtomicBool = AtomicBool::new(false);
    /// Set only when one of Explorer's own desktop windows appeared or went
    /// away. Kept apart from `DIRTY` because that one also fires on every
    /// foreground change, and re-scanning the shell on each alt-tab is the
    /// per-tick cost this module exists to avoid.
    static SHELL_DIRTY: AtomicBool = AtomicBool::new(false);

    pub fn take_notification() -> bool {
        DIRTY.swap(false, Ordering::Relaxed)
    }

    /// True when Explorer has rebuilt part of the desktop since the last call.
    /// Show Desktop moves `SHELLDLL_DefView` into a freshly created `WorkerW`,
    /// so the window a desk must be owned by changes mid-gesture; waiting for
    /// the slow sweep to notice leaves the desk covered in the meantime.
    pub fn take_shell_notification() -> bool {
        SHELL_DIRTY.swap(false, Ordering::Relaxed)
    }

    unsafe extern "system" fn changed(
        _hook: HWINEVENTHOOK,
        event: u32,
        hwnd: HWND,
        object: i32,
        _child: i32,
        _thread: u32,
        _time: u32,
    ) {
        if hwnd.0.is_null() || object != OBJID_WINDOW.0 {
            return;
        }
        if event == EVENT_OBJECT_SHOW || event == EVENT_OBJECT_HIDE {
            // Ignore menus/tooltips and child controls. Shell visibility is the
            // useful signal here; minimize/foreground events cover application windows.
            let mut name = [0u16; 64];
            let len = GetClassNameW(hwnd, &mut name);
            let name = String::from_utf16_lossy(&name[..len.max(0) as usize]);
            if !matches!(name.as_str(), "Progman" | "WorkerW" | "SHELLDLL_DefView") {
                return;
            }
            SHELL_DIRTY.store(true, Ordering::Relaxed);
        }
        DIRTY.store(true, Ordering::Relaxed);
        if let Some(worker) = WORKER.get() {
            worker.unpark();
        }
    }

    pub fn listen(worker: std::thread::Thread) {
        let _ = WORKER.set(worker);
        std::thread::spawn(|| unsafe {
            let hooks = [
                SetWinEventHook(
                    EVENT_SYSTEM_FOREGROUND,
                    EVENT_SYSTEM_FOREGROUND,
                    None,
                    Some(changed),
                    0,
                    0,
                    WINEVENT_OUTOFCONTEXT,
                ),
                SetWinEventHook(
                    EVENT_SYSTEM_MINIMIZESTART,
                    EVENT_SYSTEM_MINIMIZEEND,
                    None,
                    Some(changed),
                    0,
                    0,
                    WINEVENT_OUTOFCONTEXT,
                ),
                SetWinEventHook(
                    EVENT_OBJECT_SHOW,
                    EVENT_OBJECT_HIDE,
                    None,
                    Some(changed),
                    0,
                    0,
                    WINEVENT_OUTOFCONTEXT,
                ),
            ];
            if hooks.iter().any(|hook| hook.0.is_null()) {
                log::warn!("some desktop notifications unavailable; watchdog remains active");
            }
            let mut message = MSG::default();
            while GetMessageW(&mut message, None, 0, 0).0 > 0 {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }
            for hook in hooks {
                if !hook.0.is_null() {
                    let _ = UnhookWinEvent(hook);
                }
            }
        });
    }

    pub fn emergency_hotkey(app: tauri::AppHandle) {
        use tauri::Manager;
        use windows::Win32::UI::Input::KeyboardAndMouse::*;
        std::thread::spawn(move || {
            let detach = || {
                if let Some(window) = app.get_webview_window("main") {
                    let state = app.state::<crate::desktop::DesktopState>();
                    let _ = crate::desktop::detach(&window, &state);
                }
            };
            const ID: i32 = 0xA10D;
            if unsafe {
                RegisterHotKey(
                    None,
                    ID,
                    MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT,
                    VK_F12.0 as u32,
                )
            }
            .is_err()
            {
                // Keep the escape hatch if another application owns the chord.
                log::warn!("emergency hotkey registration failed; using fallback polling");
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    if unsafe {
                        GetAsyncKeyState(VK_CONTROL.0 as i32) < 0
                            && GetAsyncKeyState(VK_SHIFT.0 as i32) < 0
                            && GetAsyncKeyState(VK_F12.0 as i32) < 0
                    } {
                        detach();
                        std::thread::sleep(std::time::Duration::from_secs(1));
                    }
                }
            }
            let mut message = MSG::default();
            while unsafe { GetMessageW(&mut message, None, 0, 0) }.0 > 0 {
                if message.message == WM_HOTKEY && message.wParam.0 == ID as usize {
                    detach();
                }
            }
            let _ = unsafe { UnregisterHotKey(None, ID) };
        });
    }
}

#[cfg(windows)]
pub use win::*;
