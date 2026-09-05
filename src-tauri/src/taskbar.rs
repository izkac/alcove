use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningApp {
    pub hwnd: isize,
    pub title: String,
    pub exe_path: String,
    pub icon_url: Option<String>,
    pub foreground: bool,
}

#[cfg(windows)]
mod win {
    use super::RunningApp;
    use crate::icon_cache::{Fingerprint, IconCache};
    use std::collections::HashMap;
    use std::path::Path;
    use std::sync::{Mutex, OnceLock};
    use std::time::{Duration, Instant};

    fn cached_icon(exe: &str) -> Option<String> {
        static CACHE: OnceLock<Mutex<IconCache>> = OnceLock::new();
        let path = Path::new(exe);
        let fingerprint = std::fs::metadata(path).ok().and_then(|metadata| {
            Some(Fingerprint {
                path: exe.into(),
                size: metadata.len(),
                modified: metadata.modified().ok()?,
            })
        });
        let Some(key) = fingerprint else {
            return crate::harvest::icon_data_url(path).ok();
        };
        CACHE
            .get_or_init(|| Mutex::new(IconCache::new(8 * 1024 * 1024, 128)))
            .lock()
            .ok()?
            .get_or_load(key, Instant::now(), || {
                crate::harvest::icon_data_url(path).ok()
            })
    }

    use windows::core::{w, BOOL, PCWSTR};
    use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, POINT};
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
    use windows::Win32::System::Threading::{
        GetCurrentProcessId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::Shell::{
        SHAppBarMessage, ABM_GETSTATE, ABM_SETSTATE, ABS_ALWAYSONTOP, ABS_AUTOHIDE, APPBARDATA,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, FindWindowW, GetClassNameW, GetCursorPos, GetForegroundWindow,
        GetSystemMetrics, GetWindow, GetWindowLongW, GetWindowTextW, GetWindowThreadProcessId,
        IsIconic, IsWindowVisible, SetForegroundWindow, SetWindowPos, ShowWindow, GWL_EXSTYLE,
        GW_OWNER, HWND_TOPMOST, SM_CXSCREEN, SM_CYSCREEN, SWP_NOACTIVATE, SWP_SHOWWINDOW, SW_HIDE,
        SW_RESTORE, SW_SHOWNOACTIVATE, WS_EX_TOOLWINDOW,
    };

    fn appbar_data() -> APPBARDATA {
        APPBARDATA {
            cbSize: std::mem::size_of::<APPBARDATA>() as u32,
            ..Default::default()
        }
    }

    pub fn set_taskbar_autohide(hide: bool) -> Result<bool, String> {
        let mut data = appbar_data();
        if let Ok(tray) = unsafe { FindWindowW(w!("Shell_TrayWnd"), PCWSTR::null()) } {
            data.hWnd = tray;
        }
        data.lParam = LPARAM(if hide { ABS_AUTOHIDE } else { ABS_ALWAYSONTOP } as isize);
        unsafe {
            SHAppBarMessage(ABM_SETSTATE, &mut data);
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
        let now = taskbar_autohidden();
        if now != hide {
            return Err("Windows did not apply the taskbar change".into());
        }
        Ok(now)
    }

    pub fn taskbar_autohidden() -> bool {
        let mut data = appbar_data();
        let state = unsafe { SHAppBarMessage(ABM_GETSTATE, &mut data) };
        (state as u32) & ABS_AUTOHIDE != 0
    }

    fn is_cloaked(hwnd: HWND) -> bool {
        let mut cloaked: u32 = 0;
        let result = unsafe {
            DwmGetWindowAttribute(
                hwnd,
                DWMWA_CLOAKED,
                &mut cloaked as *mut u32 as *mut core::ffi::c_void,
                std::mem::size_of::<u32>() as u32,
            )
        };
        result.is_ok() && cloaked != 0
    }

    fn window_title(hwnd: HWND) -> String {
        let mut buf = [0u16; 256];
        let n = unsafe { GetWindowTextW(hwnd, &mut buf) };
        if n <= 0 {
            return String::new();
        }
        String::from_utf16_lossy(&buf[..n as usize])
    }

    fn class_name(hwnd: HWND) -> String {
        let mut buf = [0u16; 64];
        let n = unsafe { GetClassNameW(hwnd, &mut buf) };
        if n <= 0 {
            return String::new();
        }
        String::from_utf16_lossy(&buf[..n as usize])
    }

    fn exe_path(hwnd: HWND) -> Option<String> {
        let mut pid: u32 = 0;
        unsafe {
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
        }
        if pid == 0 || pid == unsafe { GetCurrentProcessId() } {
            return None;
        }
        let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let result = unsafe {
            QueryFullProcessImageNameW(
                handle,
                PROCESS_NAME_WIN32,
                windows::core::PWSTR(buf.as_mut_ptr()),
                &mut len,
            )
        };
        unsafe {
            let _ = CloseHandle(handle);
        }
        result.ok()?;
        Some(String::from_utf16_lossy(&buf[..len as usize]))
    }

    unsafe extern "system" fn enum_windows(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let out = &mut *(lparam.0 as *mut Vec<isize>);
        out.push(hwnd.0 as isize);
        BOOL(1)
    }

    pub fn list_running() -> Result<Vec<RunningApp>, String> {
        let mut hwnds: Vec<isize> = Vec::new();
        unsafe {
            EnumWindows(Some(enum_windows), LPARAM(&mut hwnds as *mut _ as isize))
                .map_err(|err| err.to_string())?;
        }
        let foreground = unsafe { GetForegroundWindow() }.0 as isize;

        let com_initialized = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }.is_ok();
        // ponytail: icon per unique exe, cached for this call; UWP hosts show
        // ApplicationFrameHost's icon — per-package icons if it ever matters.
        let mut icon_cache: HashMap<String, Option<String>> = HashMap::new();
        let mut apps = Vec::new();
        for raw in hwnds {
            let hwnd = HWND(raw as *mut core::ffi::c_void);
            if !unsafe { IsWindowVisible(hwnd) }.as_bool() || is_cloaked(hwnd) {
                continue;
            }
            if unsafe { GetWindow(hwnd, GW_OWNER) }.is_ok_and(|owner| !owner.0.is_null()) {
                continue;
            }
            let exstyle = unsafe { GetWindowLongW(hwnd, GWL_EXSTYLE) } as u32;
            if exstyle & WS_EX_TOOLWINDOW.0 != 0 {
                continue;
            }
            let title = window_title(hwnd);
            if title.is_empty() {
                continue;
            }
            let class = class_name(hwnd);
            if matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd") {
                continue;
            }
            let Some(exe) = exe_path(hwnd) else { continue };
            let icon_url = icon_cache
                .entry(exe.clone())
                .or_insert_with(|| cached_icon(&exe))
                .clone();
            apps.push(RunningApp {
                hwnd: raw,
                title,
                exe_path: exe,
                icon_url,
                foreground: raw == foreground,
            });
        }
        if com_initialized {
            unsafe {
                CoUninitialize();
            }
        }
        Ok(apps)
    }

    pub fn activate(raw: isize) -> Result<(), String> {
        let hwnd = HWND(raw as *mut core::ffi::c_void);
        unsafe {
            if IsIconic(hwnd).as_bool() {
                let _ = ShowWindow(hwnd, SW_RESTORE);
            }
            let _ = SetForegroundWindow(hwnd);
        }
        Ok(())
    }

    // Edge peek: while the Windows taskbar is auto-hidden, pushing the mouse
    // to the bottom screen edge summons the "bar" strip window over any app;
    // moving away hides it again. Primary monitor only. Cursor sampling remains
    // lightweight; shell configuration and window geometry are read less often.
    pub fn spawn_bar_peek(app: tauri::AppHandle) {
        use tauri::Manager;
        std::thread::spawn(move || {
            let mut visible = false;
            let mut autohidden = false;
            let mut next_shell_check = Instant::now();
            let mut geometry = (0, 0, 0);
            let mut next_geometry_check = Instant::now();
            loop {
                std::thread::sleep(Duration::from_millis(if autohidden { 120 } else { 500 }));
                let Some(bar) = app.get_webview_window("bar") else {
                    std::thread::sleep(std::time::Duration::from_secs(1));
                    continue;
                };
                if Instant::now() >= next_shell_check {
                    autohidden = taskbar_autohidden();
                    next_shell_check = Instant::now() + Duration::from_secs(1);
                }
                if !autohidden {
                    if visible {
                        let _ = bar.hide();
                        crate::auxiliary::visibility(&bar, false);
                        visible = false;
                    }
                    continue;
                }
                let mut point = POINT::default();
                if unsafe { GetCursorPos(&mut point) }.is_err() {
                    continue;
                }
                if Instant::now() >= next_geometry_check {
                    let next = (
                        unsafe { GetSystemMetrics(SM_CXSCREEN) },
                        unsafe { GetSystemMetrics(SM_CYSCREEN) },
                        (52.0 * bar.scale_factor().unwrap_or(1.0)).round() as i32,
                    );
                    if visible && next != geometry {
                        let _ =
                            bar.set_size(tauri::PhysicalSize::new(next.0 as u32, next.2 as u32));
                        let _ = bar.set_position(tauri::PhysicalPosition::new(0, next.1 - next.2));
                    }
                    geometry = next;
                    next_geometry_check = Instant::now() + Duration::from_secs(1);
                }
                let (screen_w, screen_h, bar_px) = geometry;
                if !visible && point.y >= screen_h - 2 {
                    let _ = bar.set_size(tauri::PhysicalSize::new(screen_w as u32, bar_px as u32));
                    let _ = bar.set_position(tauri::PhysicalPosition::new(0, screen_h - bar_px));
                    if let Ok(handle) = bar.hwnd() {
                        let hwnd = HWND(handle.0 as *mut core::ffi::c_void);
                        unsafe {
                            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
                            let _ = SetWindowPos(
                                hwnd,
                                Some(HWND_TOPMOST),
                                0,
                                screen_h - bar_px,
                                screen_w,
                                bar_px,
                                SWP_SHOWWINDOW | SWP_NOACTIVATE,
                            );
                        }
                    }
                    visible = true;
                    crate::auxiliary::visibility(&bar, true);
                } else if visible && point.y < screen_h - bar_px - 8 {
                    if let Ok(handle) = bar.hwnd() {
                        let hwnd = HWND(handle.0 as *mut core::ffi::c_void);
                        unsafe {
                            let _ = ShowWindow(hwnd, SW_HIDE);
                        }
                    }
                    visible = false;
                    crate::auxiliary::visibility(&bar, false);
                }
            }
        });
    }
}

#[cfg(not(windows))]
mod win {
    use super::RunningApp;

    pub fn set_taskbar_autohide(_hide: bool) -> Result<bool, String> {
        Err("taskbar control is Windows-only".into())
    }

    pub fn taskbar_autohidden() -> bool {
        false
    }

    pub fn list_running() -> Result<Vec<RunningApp>, String> {
        Err("window list is Windows-only".into())
    }

    pub fn activate(_hwnd: isize) -> Result<(), String> {
        Err("activate is Windows-only".into())
    }

    pub fn spawn_bar_peek(_app: tauri::AppHandle) {}
}

pub fn set_taskbar_autohide(hide: bool) -> Result<bool, String> {
    win::set_taskbar_autohide(hide)
}

pub fn taskbar_autohidden() -> bool {
    win::taskbar_autohidden()
}

pub fn list_running() -> Result<Vec<RunningApp>, String> {
    win::list_running()
}

pub fn activate(hwnd: isize) -> Result<(), String> {
    win::activate(hwnd)
}

pub fn spawn_bar_peek(app: tauri::AppHandle) {
    win::spawn_bar_peek(app)
}
