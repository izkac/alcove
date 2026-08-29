use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewWindow};

#[cfg(windows)]
mod win {
    use super::*;
    use windows::core::{w, BOOL, PCWSTR};
    use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT};
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_CONTROL, VK_F12, VK_LWIN, VK_RWIN, VK_SHIFT,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, FindWindowExW, FindWindowW, GetAncestor, GetClassNameW, GetForegroundWindow,
        GetParent, GetWindowRect, IsIconic, IsWindowVisible, SetWindowPos, ShowWindow, WindowFromPoint,
        GA_ROOT, HWND_NOTOPMOST, HWND_TOP, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        SWP_SHOWWINDOW, SW_HIDE, SW_RESTORE, SW_SHOW,
    };

    struct ShellWindows {
        def_view: HWND,
        host: HWND,
    }

    impl Default for ShellWindows {
        fn default() -> Self {
            Self {
                def_view: HWND::default(),
                host: HWND::default(),
            }
        }
    }

    fn hwnd_ptr(hwnd: HWND) -> isize {
        hwnd.0 as isize
    }

    fn hwnd_from(raw: isize) -> HWND {
        HWND(raw as *mut core::ffi::c_void)
    }

    fn valid(hwnd: HWND) -> bool {
        !hwnd.0.is_null()
    }

    pub fn window_hwnd(window: &WebviewWindow) -> Result<HWND, String> {
        window
            .hwnd()
            .map(|h| HWND(h.0 as *mut core::ffi::c_void))
            .map_err(|err| err.to_string())
    }

    fn class_name(hwnd: HWND) -> String {
        let mut buf = [0u16; 64];
        let n = unsafe { GetClassNameW(hwnd, &mut buf) };
        if n <= 0 {
            return String::new();
        }
        String::from_utf16_lossy(&buf[..n as usize])
    }

    fn is_large(hwnd: HWND) -> bool {
        let mut rect = RECT::default();
        unsafe {
            let _ = GetWindowRect(hwnd, &mut rect);
        }
        (rect.right - rect.left) >= 800 && (rect.bottom - rect.top) >= 600
    }

    unsafe fn take_def_view(parent: HWND, found: &mut ShellWindows) {
        if let Ok(def_view) =
            FindWindowExW(Some(parent), None, w!("SHELLDLL_DefView"), PCWSTR::null())
        {
            if valid(def_view) && is_large(parent) {
                found.def_view = def_view;
                found.host = parent;
            }
        }
    }

    unsafe extern "system" fn enum_shell(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let found = &mut *(lparam.0 as *mut ShellWindows);
        let class = class_name(hwnd);
        if class == "WorkerW" || class == "Progman" {
            take_def_view(hwnd, found);
        }
        BOOL(1)
    }

    unsafe fn find_shell() -> Result<ShellWindows, String> {
        let mut found = ShellWindows::default();
        if let Ok(progman) = FindWindowW(w!("Progman"), PCWSTR::null()) {
            take_def_view(progman, &mut found);
        }
        let _ = EnumWindows(Some(enum_shell), LPARAM(&mut found as *mut _ as isize));

        if valid(found.def_view) && !valid(found.host) {
            if let Ok(parent) = GetParent(found.def_view) {
                found.host = parent;
            }
        }
        if !valid(found.def_view) {
            return Err("could not find the desktop icon list".into());
        }
        log::info!(
            "desktop icon host class={}",
            class_name(found.host)
        );
        Ok(found)
    }

    unsafe fn work_area_for(hwnd: HWND) -> Result<RECT, String> {
        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        GetMonitorInfoW(monitor, &mut info)
            .ok()
            .map_err(|err| err.to_string())?;
        Ok(info.rcWork)
    }

    fn cover_work_area(window: &WebviewWindow, hwnd: HWND) -> Result<(), String> {
        let area = unsafe { work_area_for(hwnd)? };
        let width = (area.right - area.left).max(800) as u32;
        let height = (area.bottom - area.top).max(500) as u32;
        window
            .set_position(tauri::PhysicalPosition::new(area.left, area.top))
            .map_err(|err| err.to_string())?;
        window
            .set_size(tauri::PhysicalSize::new(width, height))
            .map_err(|err| err.to_string())?;
        unsafe {
            let _ = SetWindowPos(
                hwnd,
                Some(HWND_TOP),
                area.left,
                area.top,
                area.right - area.left,
                area.bottom - area.top,
                SWP_SHOWWINDOW | SWP_NOACTIVATE,
            );
        }
        Ok(())
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

    fn is_desktop_class(class: &str) -> bool {
        class == "Progman" || class == "WorkerW"
    }

    fn desktop_is_in_front() -> bool {
        let fg = unsafe { GetForegroundWindow() };
        if !valid(fg) {
            return false;
        }
        is_desktop_class(&class_name(fg)) && is_large(fg)
    }

    fn belongs_to(root: HWND, at: HWND) -> bool {
        if !valid(at) {
            return false;
        }
        if at.0 == root.0 {
            return true;
        }
        let ancestor = unsafe { GetAncestor(at, GA_ROOT) };
        valid(ancestor) && ancestor.0 == root.0
    }

    fn wallpaper_is_covering(hwnd: HWND) -> bool {
        let Ok(area) = (unsafe { work_area_for(hwnd) }) else {
            return false;
        };
        let point = POINT {
            x: (area.left + area.right) / 2,
            y: (area.top + area.bottom) / 2,
        };
        let at = unsafe { WindowFromPoint(point) };
        if belongs_to(hwnd, at) {
            return false;
        }
        let root = unsafe { GetAncestor(at, GA_ROOT) };
        let probe = if valid(root) { root } else { at };
        is_desktop_class(&class_name(probe)) && is_large(probe)
    }

    fn win_d_pressed() -> bool {
        unsafe {
            let win = GetAsyncKeyState(VK_LWIN.0 as i32) < 0
                || GetAsyncKeyState(VK_RWIN.0 as i32) < 0;
            win && GetAsyncKeyState(0x44) < 0
        }
    }

    fn needs_restore(hwnd: HWND) -> bool {
        unsafe {
            let mut rect = RECT::default();
            let _ = GetWindowRect(hwnd, &mut rect);
            IsIconic(hwnd).as_bool()
                || !IsWindowVisible(hwnd).as_bool()
                || rect.left <= -10_000
                || is_cloaked(hwnd)
                || desktop_is_in_front()
                || wallpaper_is_covering(hwnd)
        }
    }

    fn hide_def_view(def_view: Option<isize>) {
        if let Some(raw) = def_view {
            unsafe {
                let _ = ShowWindow(hwnd_from(raw), SW_HIDE);
            }
        }
    }

    fn raise_over_wallpaper(hwnd: HWND) {
        // Win+D raises a wallpaper WorkerW above normal windows. A brief
        // topmost pulse jumps over it, then we drop back so apps can cover us.
        let flags = SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW | SWP_NOACTIVATE;
        unsafe {
            let _ = SetWindowPos(hwnd, Some(HWND_TOPMOST), 0, 0, 0, 0, flags);
            let _ = SetWindowPos(hwnd, Some(HWND_NOTOPMOST), 0, 0, 0, 0, flags);
            let _ = SetWindowPos(hwnd, Some(HWND_TOP), 0, 0, 0, 0, flags);
        }
    }

    fn restore_to_desktop(hwnd: HWND, def_view: Option<isize>) {
        // Call Win32 here, not Tauri — this runs off the UI thread.
        // SW_SHOW leaves a minimized window minimized; SW_RESTORE actually pops it.
        unsafe {
            if IsIconic(hwnd).as_bool() {
                let _ = ShowWindow(hwnd, SW_RESTORE);
            } else {
                let _ = ShowWindow(hwnd, SW_SHOW);
            }
        }
        hide_def_view(def_view);
        raise_over_wallpaper(hwnd);
    }

    pub fn attach(window: &WebviewWindow, state: &super::DesktopState) -> Result<(), String> {
        let mut inner = state.inner.lock().map_err(|err| err.to_string())?;
        if inner.attached {
            return Ok(());
        }

        let hwnd = window_hwnd(window)?;
        let shell = unsafe { find_shell()? };

        window.set_decorations(false).map_err(|err| err.to_string())?;
        window.set_skip_taskbar(true).map_err(|err| err.to_string())?;
        let _ = window.set_shadow(false);
        let _ = window.set_resizable(false);

        // Stay a normal top-level window so WebView2 can paint. Cover the
        // work area (screen minus the taskbar) and hide Explorer's icons.
        // Size through Tauri so the webview controller tracks the HWND.
        // Do not parent into WorkerW — that sits behind the wallpaper.
        cover_work_area(window, hwnd)?;
        unsafe {
            let _ = ShowWindow(shell.def_view, SW_HIDE);
        }
        let _ = window.show();

        inner.attached = true;
        inner.def_view = Some(hwnd_ptr(shell.def_view));
        inner.hwnd = Some(hwnd_ptr(hwnd));
        log::info!("Alcove covering the desktop work area");
        Ok(())
    }

    pub fn recover(window: &WebviewWindow, state: &super::DesktopState) -> Result<(), String> {
        let attached = state.inner.lock().map_err(|err| err.to_string())?.attached;
        if !attached {
            return Ok(());
        }
        let hwnd = window_hwnd(window)?;
        cover_work_area(window, hwnd)
    }

    pub fn detach(window: &WebviewWindow, state: &super::DesktopState) -> Result<(), String> {
        let mut inner = state.inner.lock().map_err(|err| err.to_string())?;
        if let Some(def_view) = inner.def_view.take() {
            unsafe {
                let _ = ShowWindow(hwnd_from(def_view), SW_SHOW);
            }
        }
        inner.hwnd = None;
        if inner.attached {
            let _ = window.set_skip_taskbar(false);
            let _ = window.set_decorations(true);
            let _ = window.set_resizable(true);
            let _ = window.set_shadow(true);
            let _ = window.unmaximize();
            let _ = window.set_size(tauri::LogicalSize::new(1440.0, 900.0));
            let _ = window.center();
            let _ = window.show();
        }
        inner.attached = false;
        log::info!("Alcove detached from the desktop");
        Ok(())
    }

    pub fn spawn_desktop_threads(app: AppHandle) {
        std::thread::spawn({
            let app = app.clone();
            move || {
                let mut win_d_was_down = false;
                let mut burst_left = 0u8;
                loop {
                    std::thread::sleep(Duration::from_millis(30));
                    let (attached, def_view) = match app.state::<super::DesktopState>().inner.lock()
                    {
                        Ok(inner) => (inner.attached, inner.def_view),
                        _ => continue,
                    };
                    if !attached {
                        win_d_was_down = false;
                        burst_left = 0;
                        continue;
                    }
                    let Some(window) = app.get_webview_window("main") else {
                        continue;
                    };
                    let Ok(hwnd) = window_hwnd(&window) else {
                        continue;
                    };
                    let win_d = win_d_pressed();
                    let just_pressed = win_d && !win_d_was_down;
                    win_d_was_down = win_d;
                    if just_pressed {
                        // Explorer finishes Show Desktop a beat after the key.
                        burst_left = 12;
                    }
                    if burst_left > 0 || needs_restore(hwnd) {
                        restore_to_desktop(hwnd, def_view);
                        burst_left = burst_left.saturating_sub(1);
                    }
                }
            }
        });

        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_millis(100));
            let pressed = unsafe {
                GetAsyncKeyState(VK_CONTROL.0 as i32) < 0
                    && GetAsyncKeyState(VK_SHIFT.0 as i32) < 0
                    && GetAsyncKeyState(VK_F12.0 as i32) < 0
            };
            if !pressed {
                continue;
            }
            if let Some(window) = app.get_webview_window("main") {
                let state = app.state::<super::DesktopState>();
                let _ = detach(&window, &state);
            }
            std::thread::sleep(Duration::from_secs(1));
        });
    }
}

#[cfg(not(windows))]
mod win {
    use super::*;

    pub fn attach(_window: &WebviewWindow, _state: &super::DesktopState) -> Result<(), String> {
        Err("desktop attach is Windows-only".into())
    }

    pub fn detach(window: &WebviewWindow, state: &super::DesktopState) -> Result<(), String> {
        let mut inner = state.inner.lock().map_err(|err| err.to_string())?;
        inner.attached = false;
        let _ = window;
        Ok(())
    }

    pub fn recover(_window: &WebviewWindow, _state: &super::DesktopState) -> Result<(), String> {
        Ok(())
    }

    pub fn spawn_desktop_threads(_app: AppHandle) {}
}

#[derive(Default)]
pub struct DesktopState {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    attached: bool,
    def_view: Option<isize>,
    hwnd: Option<isize>,
}

impl DesktopState {
    pub fn attached(&self) -> bool {
        self.inner.lock().map(|inner| inner.attached).unwrap_or(false)
    }
}

pub fn attach(window: &WebviewWindow, state: &DesktopState) -> Result<(), String> {
    win::attach(window, state)
}

pub fn detach(window: &WebviewWindow, state: &DesktopState) -> Result<(), String> {
    win::detach(window, state)
}

pub fn recover(window: &WebviewWindow, state: &DesktopState) -> Result<(), String> {
    win::recover(window, state)
}

pub fn spawn_emergency_hotkey(app: AppHandle) {
    win::spawn_desktop_threads(app);
}
