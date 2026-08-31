use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager, Monitor, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeskInfo {
    pub id: String,
    pub name: String,
    pub primary: bool,
}

#[derive(Clone, serde::Serialize)]
pub struct DeskHit {
    pub id: String,
    pub x: f64,
    pub y: f64,
}

fn desk_id(monitor: &Monitor) -> String {
    monitor
        .name()
        .cloned()
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| {
            let pos = monitor.position();
            format!("x{}y{}", pos.x, pos.y)
        })
}

fn desk_name(monitor: &Monitor) -> String {
    let id = desk_id(monitor);
    id.strip_prefix(r"\\.\")
        .map(|rest| rest.replace("DISPLAY", "Display "))
        .unwrap_or(id)
}

fn desk_label(id: &str) -> String {
    let mut label = String::from("desk-");
    for ch in id.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            label.push(ch);
        }
    }
    if label.len() == 5 {
        label.push('x');
    }
    label
}

fn is_desk_label(label: &str) -> bool {
    label == "main" || label.starts_with("desk-")
}

fn same_monitor(a: &Monitor, b: &Monitor) -> bool {
    a.position() == b.position() && a.size() == b.size()
}

#[cfg(windows)]
mod win {
    use super::*;
    use windows::core::{w, BOOL, PCWSTR};
    use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT};
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, ScreenToClient, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_CONTROL, VK_F12, VK_LWIN, VK_RWIN, VK_SHIFT,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, FindWindowExW, FindWindowW, GetAncestor, GetClassNameW, GetCursorPos,
        GetForegroundWindow, GetParent, GetWindowRect, IsIconic, IsWindowVisible, SetWindowPos,
        ShowWindow, WindowFromPoint, GA_ROOT, HWND_NOTOPMOST, HWND_TOP, HWND_TOPMOST, SWP_NOACTIVATE,
        SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE, SW_RESTORE, SW_SHOW,
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

    fn cover_work_area(window: &WebviewWindow, hwnd: HWND, show: bool) -> Result<(), String> {
        let area = unsafe { work_area_for(hwnd)? };
        let width = (area.right - area.left).max(800) as u32;
        let height = (area.bottom - area.top).max(500) as u32;
        window
            .set_position(tauri::PhysicalPosition::new(area.left, area.top))
            .map_err(|err| err.to_string())?;
        window
            .set_size(tauri::PhysicalSize::new(width, height))
            .map_err(|err| err.to_string())?;
        let mut flags = SWP_NOACTIVATE;
        if show {
            flags |= SWP_SHOWWINDOW;
        }
        unsafe {
            let _ = SetWindowPos(
                hwnd,
                Some(HWND_TOP),
                area.left,
                area.top,
                area.right - area.left,
                area.bottom - area.top,
                flags,
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

    fn apply_desktop_chrome(window: &WebviewWindow) -> Result<(), String> {
        window.set_decorations(false).map_err(|err| err.to_string())?;
        window.set_skip_taskbar(true).map_err(|err| err.to_string())?;
        let _ = window.set_shadow(false);
        let _ = window.set_resizable(false);
        Ok(())
    }

    fn remember_desk(state: &super::DesktopState, label: &str, hwnd: HWND) {
        let Ok(mut inner) = state.inner.lock() else {
            return;
        };
        inner.desks.retain(|(name, _)| name != label);
        inner.desks.push((label.to_string(), hwnd_ptr(hwnd)));
    }

    fn place_on_monitor(window: &WebviewWindow, monitor: &Monitor) -> Result<(), String> {
        let pos = *monitor.position();
        window
            .set_position(tauri::PhysicalPosition::new(pos.x, pos.y))
            .map_err(|err| err.to_string())?;
        let hwnd = window_hwnd(window)?;
        cover_work_area(window, hwnd, true)
    }

    fn close_extra_desks(app: &AppHandle) {
        let labels: Vec<String> = app
            .webview_windows()
            .into_iter()
            .map(|(label, _)| label)
            .filter(|label| label.starts_with("desk-"))
            .collect();
        for label in labels {
            if let Some(window) = app.get_webview_window(&label) {
                let _ = window.close();
            }
        }
    }

    fn decorate_as_window(window: &WebviewWindow) {
        let _ = window.set_skip_taskbar(false);
        let _ = window.set_decorations(true);
        let _ = window.set_resizable(true);
        let _ = window.set_shadow(true);
        let _ = window.unmaximize();
        let _ = window.set_size(tauri::LogicalSize::new(1440.0, 900.0));
        let _ = window.center();
        let _ = window.show();
    }

    pub fn sync_desks(app: &AppHandle, state: &super::DesktopState) -> Result<(), String> {
        if !state.attached() {
            return Ok(());
        }
        let monitors = app.available_monitors().map_err(|err| err.to_string())?;
        let primary = app.primary_monitor().ok().flatten();
        let mut wanted: Vec<String> = Vec::new();

        if let Some(main) = app.get_webview_window("main") {
            if let Ok(hwnd) = window_hwnd(&main) {
                remember_desk(state, "main", hwnd);
            }
        }

        for monitor in &monitors {
            if let Some(primary) = &primary {
                if same_monitor(primary, monitor) {
                    continue;
                }
            }
            let id = desk_id(monitor);
            let label = desk_label(&id);
            wanted.push(label.clone());
            if let Some(existing) = app.get_webview_window(&label) {
                if let Ok(hwnd) = window_hwnd(&existing) {
                    remember_desk(state, &label, hwnd);
                }
                continue;
            }
            // WebView2 deadlocks if we build a window inside a sync command.
            let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
                .title("Alcove")
                .decorations(false)
                .shadow(false)
                .resizable(false)
                .skip_taskbar(true)
                .visible(false)
                .focused(false)
                .background_color(tauri::window::Color(25, 25, 25, 255))
                .initialization_script(format!(
                    "window.__ALCOVE_DESK_ID__='{}';",
                    id.replace('\\', "\\\\").replace('\'', "\\'")
                ))
                .build()
                .map_err(|err| err.to_string())?;
            apply_desktop_chrome(&built)?;
            place_on_monitor(&built, monitor)?;
            let _ = built.show();
            if let Ok(hwnd) = window_hwnd(&built) {
                remember_desk(state, &label, hwnd);
            }
            log::info!("desk window {label} covering {id}");
        }

        let stale: Vec<String> = app
            .webview_windows()
            .into_iter()
            .map(|(label, _)| label)
            .filter(|label| label.starts_with("desk-") && !wanted.iter().any(|want| want == label))
            .collect();
        for label in stale {
            if let Some(window) = app.get_webview_window(&label) {
                let _ = window.close();
            }
        }
        Ok(())
    }

    /// Size the (still hidden) window to the work area. Explorer icons stay
    /// until `reveal` so the user never sees a blank wallpaper gap.
    pub fn prepare(window: &WebviewWindow, state: &super::DesktopState) -> Result<(), String> {
        let inner = state.inner.lock().map_err(|err| err.to_string())?;
        if inner.attached {
            return Ok(());
        }
        drop(inner);
        let hwnd = window_hwnd(window)?;
        let shell = unsafe { find_shell()? };
        apply_desktop_chrome(window)?;
        if let Ok(Some(primary)) = window.primary_monitor() {
            let pos = *primary.position();
            let _ = window.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
        }
        cover_work_area(window, hwnd, false)?;
        let mut inner = state.inner.lock().map_err(|err| err.to_string())?;
        inner.attached = true;
        inner.def_view = Some(hwnd_ptr(shell.def_view));
        inner.desks.clear();
        inner.desks.push((window.label().to_string(), hwnd_ptr(hwnd)));
        log::info!("Alcove sized to the work area (still hidden)");
        Ok(())
    }

    fn reveal(window: &WebviewWindow, state: &super::DesktopState) -> Result<(), String> {
        let def_view = state.inner.lock().map_err(|err| err.to_string())?.def_view;
        hide_def_view(def_view);
        crate::persist::mark_desktop_hidden(window.app_handle(), true);
        let hwnd = window_hwnd(window)?;
        cover_work_area(window, hwnd, true)?;
        window.show().map_err(|err| err.to_string())?;
        Ok(())
    }

    /// Show Explorer's icon list again, without needing the state that recorded
    /// hiding it. TerminateProcess cannot be intercepted, so a killed run leaves
    /// the desktop empty with nothing running to explain it; this is the repair
    /// the next start performs before touching anything else.
    pub fn repair_hidden_desktop() {
        unsafe {
            if let Ok(shell) = find_shell() {
                let _ = ShowWindow(shell.def_view, SW_SHOW);
            }
        }
    }

    pub fn attach(window: &WebviewWindow, state: &super::DesktopState) -> Result<(), String> {
        let mut last = "could not find the desktop icon list".to_string();
        for attempt in 0..25 {
            match prepare(window, state) {
                Ok(()) => {
                    reveal(window, state)?;
                    log::info!("Alcove covering the desktop work area");
                    let app = window.app_handle().clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_millis(80));
                        let state = app.state::<super::DesktopState>();
                        if let Err(err) = sync_desks(&app, &state) {
                            log::warn!("desk sync: {err}");
                        }
                    });
                    return Ok(());
                }
                Err(err) => {
                    last = err;
                    if attempt == 24 {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
            }
        }
        Err(last)
    }

    fn recover_one(window: &WebviewWindow, state: &super::DesktopState) -> Result<(), String> {
        let attached = state.inner.lock().map_err(|err| err.to_string())?.attached;
        if !attached {
            return Ok(());
        }
        let hwnd = window_hwnd(window)?;
        cover_work_area(window, hwnd, true)
    }

    #[allow(dead_code)]
    pub fn recover(window: &WebviewWindow, state: &super::DesktopState) -> Result<(), String> {
        recover_one(window, state)
    }

    pub fn recover_all(app: &AppHandle, state: &super::DesktopState) -> Result<(), String> {
        if !state.attached() {
            return Ok(());
        }
        for (label, window) in app.webview_windows() {
            if is_desk_label(&label) {
                let _ = recover_one(&window, state);
            }
        }
        let app = app.clone();
        std::thread::spawn(move || {
            let state = app.state::<super::DesktopState>();
            if let Err(err) = sync_desks(&app, &state) {
                log::warn!("desk sync: {err}");
            }
        });
        Ok(())
    }

    pub fn detach(window: &WebviewWindow, state: &super::DesktopState) -> Result<(), String> {
        let app = window.app_handle().clone();
        close_extra_desks(&app);
        let mut inner = state.inner.lock().map_err(|err| err.to_string())?;
        if let Some(def_view) = inner.def_view.take() {
            unsafe {
                let _ = ShowWindow(hwnd_from(def_view), SW_SHOW);
            }
        }
        crate::persist::mark_desktop_hidden(&app, false);
        inner.desks.clear();
        let was_attached = inner.attached;
        inner.attached = false;
        drop(inner);
        if was_attached {
            let main = app.get_webview_window("main").unwrap_or_else(|| window.clone());
            decorate_as_window(&main);
        }
        log::info!("Alcove detached from the desktop");
        Ok(())
    }

    pub fn desk_hit(app: &AppHandle) -> Option<super::DeskHit> {
        let mut point = POINT::default();
        unsafe {
            GetCursorPos(&mut point).ok()?;
        }
        for (label, window) in app.webview_windows() {
            if !is_desk_label(&label) {
                continue;
            }
            let Ok(hwnd) = window_hwnd(&window) else {
                continue;
            };
            let mut rect = RECT::default();
            unsafe {
                let _ = GetWindowRect(hwnd, &mut rect);
            }
            if point.x < rect.left
                || point.x >= rect.right
                || point.y < rect.top
                || point.y >= rect.bottom
            {
                continue;
            }
            let mut client = point;
            unsafe {
                let _ = ScreenToClient(hwnd, &mut client);
            }
            let scale = window.scale_factor().unwrap_or(1.0);
            let id = window
                .current_monitor()
                .ok()
                .flatten()
                .map(|monitor| desk_id(&monitor))?;
            return Some(super::DeskHit {
                id,
                x: client.x as f64 / scale,
                y: client.y as f64 / scale,
            });
        }
        None
    }

    pub fn spawn_desktop_threads(app: AppHandle) {
        std::thread::spawn({
            let app = app.clone();
            move || {
                let mut win_d_was_down = false;
                let mut burst_left = 0u8;
                let mut ticks = 0u32;
                loop {
                    std::thread::sleep(Duration::from_millis(30));
                    ticks = ticks.saturating_add(1);
                    let (attached, def_view, labels) =
                        match app.state::<super::DesktopState>().inner.lock() {
                            Ok(inner) => (
                                inner.attached,
                                inner.def_view,
                                inner
                                    .desks
                                    .iter()
                                    .map(|(label, _)| label.clone())
                                    .collect::<Vec<_>>(),
                            ),
                            _ => continue,
                        };
                    if !attached {
                        win_d_was_down = false;
                        burst_left = 0;
                        continue;
                    }
                    if ticks % 67 == 0 {
                        let state = app.state::<super::DesktopState>();
                        if let Err(err) = sync_desks(&app, &state) {
                            log::warn!("desk sync: {err}");
                        }
                    }
                    let win_d = win_d_pressed();
                    let just_pressed = win_d && !win_d_was_down;
                    win_d_was_down = win_d;
                    if just_pressed {
                        // Explorer finishes Show Desktop a beat after the key.
                        burst_left = 12;
                    }
                    let labels = if labels.is_empty() {
                        vec!["main".to_string()]
                    } else {
                        labels
                    };
                    for label in labels {
                        let Some(window) = app.get_webview_window(&label) else {
                            continue;
                        };
                        let Ok(hwnd) = window_hwnd(&window) else {
                            continue;
                        };
                        if burst_left > 0 || needs_restore(hwnd) {
                            restore_to_desktop(hwnd, def_view);
                        }
                    }
                    burst_left = burst_left.saturating_sub(1);
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

    pub fn prepare(_window: &WebviewWindow, _state: &super::DesktopState) -> Result<(), String> {
        Ok(())
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

    pub fn recover_all(_app: &AppHandle, _state: &super::DesktopState) -> Result<(), String> {
        Ok(())
    }

    pub fn sync_desks(_app: &AppHandle, _state: &super::DesktopState) -> Result<(), String> {
        Ok(())
    }

    pub fn desk_hit(_app: &AppHandle) -> Option<super::DeskHit> {
        None
    }

    pub fn spawn_desktop_threads(_app: AppHandle) {}

    pub fn repair_hidden_desktop() {}
}

#[derive(Default)]
pub struct DesktopState {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    attached: bool,
    def_view: Option<isize>,
    desks: Vec<(String, isize)>,
}

impl DesktopState {
    pub fn attached(&self) -> bool {
        self.inner.lock().map(|inner| inner.attached).unwrap_or(false)
    }
}

pub fn attach(window: &WebviewWindow, state: &DesktopState) -> Result<(), String> {
    win::attach(window, state)?;
    crate::autostart::enable_unless_opted_out();
    Ok(())
}

pub fn prepare(window: &WebviewWindow, state: &DesktopState) -> Result<(), String> {
    win::prepare(window, state)
}

pub fn detach(window: &WebviewWindow, state: &DesktopState) -> Result<(), String> {
    win::detach(window, state)
}

pub fn repair_hidden_desktop() {
    win::repair_hidden_desktop()
}

#[allow(dead_code)]
pub fn recover(window: &WebviewWindow, state: &DesktopState) -> Result<(), String> {
    win::recover(window, state)
}

pub fn recover_all(app: &AppHandle, state: &DesktopState) -> Result<(), String> {
    win::recover_all(app, state)
}

pub fn list_desks(app: &AppHandle) -> Result<Vec<DeskInfo>, String> {
    let monitors = app.available_monitors().map_err(|err| err.to_string())?;
    let primary = app.primary_monitor().ok().flatten();
    Ok(monitors
        .iter()
        .map(|monitor| DeskInfo {
            id: desk_id(monitor),
            name: desk_name(monitor),
            primary: primary
                .as_ref()
                .map(|item| same_monitor(item, monitor))
                .unwrap_or(false),
        })
        .collect())
}

pub fn this_desk(window: &WebviewWindow) -> Result<DeskInfo, String> {
    let monitor = window
        .current_monitor()
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "no monitor".to_string())?;
    let primary = window.primary_monitor().ok().flatten();
    Ok(DeskInfo {
        id: desk_id(&monitor),
        name: desk_name(&monitor),
        primary: primary
            .as_ref()
            .map(|item| same_monitor(item, &monitor))
            .unwrap_or(false),
    })
}

pub fn desk_hit(app: &AppHandle) -> Option<DeskHit> {
    win::desk_hit(app)
}

pub fn spawn_emergency_hotkey(app: AppHandle) {
    win::spawn_desktop_threads(app);
}
