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

/// Pure decision behind the 2s owner re-check: only true when we know which
/// window should own the desk (a host) and the desk's current owner is not
/// that window. With no known host there is nothing to compare against, so a
/// desk with no owner yet is left alone rather than armed against a guess.
fn owner_needs_rearm(current: Option<isize>, host: Option<isize>) -> bool {
    match host {
        Some(host) => current != Some(host),
        None => false,
    }
}

#[cfg(windows)]
mod win {
    use super::*;
    use windows::core::{w, BOOL, PCWSTR};
    use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT, WPARAM};
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, ScreenToClient, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, FindWindowExW, FindWindowW, GetClassNameW, GetCursorPos, GetParent,
        GetAncestor, GetWindowLongPtrW, GetWindowRect, IsIconic, IsWindow, IsWindowVisible,
        SendMessageTimeoutW, SetWindowLongPtrW, SetWindowPos, ShowWindow, WindowFromPoint,
        GA_ROOT, GWLP_HWNDPARENT, HWND_TOP, SMTO_ABORTIFHUNG, SWP_NOACTIVATE, SWP_NOMOVE,
        SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE, SW_RESTORE, SW_SHOW,
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

    /// GWLP_HWNDPARENT sets a top-level window's OWNER, despite the name --
    /// there is no separate "set the owner" call in Win32. Windows keeps an
    /// owned window above its owner in z-order for as long as the owner
    /// lives (design.md M2), which is what removes the need to re-raise the
    /// desk when Explorer raises its icon host for Show Desktop.
    fn own_desktop(hwnd: HWND, host: HWND) {
        unsafe {
            let _ = SetWindowLongPtrW(hwnd, GWLP_HWNDPARENT, hwnd_ptr(host));
        }
    }

    /// Clears GWLP_HWNDPARENT, releasing the owner relationship `own_desktop`
    /// set. Same "owner, not parent" caveat applies: this does not reparent
    /// anything, it just stops Explorer's icon host from carrying the desk
    /// above it in z-order.
    fn disown_desktop(hwnd: HWND) {
        unsafe {
            let _ = SetWindowLongPtrW(hwnd, GWLP_HWNDPARENT, 0);
        }
    }

    /// Reads back the owner Windows currently has recorded for `hwnd`. A
    /// cross-process owner that gets destroyed (an Explorer restart) leaves
    /// this at 0 rather than tearing the owned window down (design.md M4),
    /// so `None` here means "needs re-arming", not "something broke".
    fn current_owner(hwnd: HWND) -> Option<isize> {
        let raw = unsafe { GetWindowLongPtrW(hwnd, GWLP_HWNDPARENT) };
        if raw == 0 {
            None
        } else {
            Some(raw)
        }
    }

    /// True while Windows still knows this handle. Desk handles are raw
    /// `isize` we stored earlier, and Windows recycles handles, so every
    /// owner write goes through this first.
    fn alive(hwnd: HWND) -> bool {
        valid(hwnd) && unsafe { IsWindow(Some(hwnd)) }.as_bool()
    }

    /// Arms a single desk window against `host`, when a host is already
    /// known. Silently does nothing before `prepare()` has found the shell --
    /// there is nothing yet to own the desk.
    ///
    /// Writes only when the owner is actually wrong. `sync_desks` runs every
    /// two seconds for the life of the session, and re-stamping the same
    /// owner on a window hosting a full-screen WebView2 surface is exactly
    /// the kind of needless z-order work this change exists to remove.
    fn arm_one_desk(host: Option<isize>, hwnd: HWND) {
        let Some(host) = host else {
            return;
        };
        if !alive(hwnd) {
            return;
        }
        if owner_needs_rearm(current_owner(hwnd), Some(host)) {
            own_desktop(hwnd, hwnd_from(host));
        }
    }

    /// True when one of Explorer's desktop windows is painted over the middle
    /// of the desk. One hit test, consulted only when Explorer has just
    /// rebuilt the desktop -- the per-tick version of this probe is what used
    /// to burn a core, so it must never move back onto the sweep.
    ///
    /// Checking for a *desktop* window specifically is the point: an ordinary
    /// application covering the desk is correct and must not provoke a raise.
    fn desktop_is_covering(hwnd: HWND) -> bool {
        let Ok(area) = (unsafe { work_area_for(hwnd) }) else {
            return false;
        };
        let point = POINT {
            x: (area.left + area.right) / 2,
            y: (area.top + area.bottom) / 2,
        };
        let at = unsafe { WindowFromPoint(point) };
        if !valid(at) {
            return false;
        }
        let root = unsafe { GetAncestor(at, GA_ROOT) };
        let probe = if valid(root) { root } else { at };
        if probe.0 == hwnd.0 {
            return false;
        }
        matches!(class_name(probe).as_str(), "Progman" | "WorkerW")
    }

    /// Lift the desk to the top of the non-topmost band, once.
    ///
    /// Ownership decides where we land the *next* time Windows orders us
    /// against the icon host; it does not move a window that is already
    /// underneath one. After an Explorer restart the fresh WorkerW is created
    /// above us, so re-arming alone would leave the desk alive but buried
    /// under bare wallpaper. This runs only when the owner was genuinely
    /// lost, never on the Show Desktop path, so it cannot bring back the
    /// per-tick pulse this change deleted.
    fn raise_once(hwnd: HWND) {
        unsafe {
            let _ = SetWindowPos(
                hwnd,
                Some(HWND_TOP),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
        }
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

    /// Ask Explorer to split the desktop, so the icon list lives in a WorkerW
    /// with a second WorkerW painting the wallpaper behind it.
    ///
    /// This is what makes Show Desktop safe for us. While the icons sit in
    /// Progman, the shell builds a *new* wallpaper window above everything
    /// each time, and no owner we hold can put us above a window that did not
    /// exist when we armed -- the desk shows the desktop for a moment before
    /// we can react. Split, the shell raises the very window we are owned by,
    /// and the desk rides up with it.
    ///
    /// Measured over six Show Desktop runs each way: unsplit, four runs showed
    /// the desktop through the desk; split, none did.
    ///
    /// 0x052C is undocumented, and is the message wallpaper apps have sent for
    /// years. It is best effort: `find_shell` reads both layouts, so if a
    /// future Explorer ignores this we are no worse off than before.
    fn ensure_wallpaper_split() {
        unsafe {
            let Ok(progman) = FindWindowW(w!("Progman"), PCWSTR::null()) else {
                return;
            };
            if !valid(progman) {
                return;
            }
            let mut result = 0usize;
            // ABORTIFHUNG so a wedged Explorer cannot stall the caller.
            let _ = SendMessageTimeoutW(
                progman,
                0x052C,
                WPARAM(0),
                LPARAM(0),
                SMTO_ABORTIFHUNG,
                1000,
                Some(&mut result),
            );
        }
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
        log::info!("desktop icon host class={}", class_name(found.host));
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

    fn needs_restore(hwnd: HWND) -> bool {
        unsafe {
            let mut rect = RECT::default();
            let _ = GetWindowRect(hwnd, &mut rect);
            IsIconic(hwnd).as_bool()
                || !IsWindowVisible(hwnd).as_bool()
                || rect.left <= -10_000
                || is_cloaked(hwnd)
        }
    }

    /// Re-point at the live SHELLDLL_DefView and hide it if we own the
    /// desktop. Also re-points the recorded owner target: an Explorer
    /// restart hands us a new icon host, and re-arming against the stale one
    /// would be a no-op that leaves the desk unowned.
    fn refresh_def_view(state: &super::DesktopState) {
        let mut found = match unsafe { find_shell() } {
            Ok(found) => found,
            Err(_) => return,
        };
        // An Explorer restart rebuilds the desktop unsplit, which puts the
        // icons back in Progman and re-opens the Show Desktop gap. Ask again.
        if class_name(found.host) == "Progman" {
            ensure_wallpaper_split();
            if let Ok(again) = unsafe { find_shell() } {
                found = again;
            }
        }
        let def_view = hwnd_ptr(found.def_view);
        let host = valid(found.host).then(|| hwnd_ptr(found.host));
        let Ok(mut inner) = state.inner.lock() else {
            return;
        };
        if !inner.attached {
            return;
        }
        if host.is_some() {
            inner.host = host;
        }
        if inner.def_view == Some(def_view) {
            return;
        }
        log::info!("desktop icon list changed; re-hiding the new one");
        inner.def_view = Some(def_view);
        drop(inner);
        hide_def_view(Some(def_view));
    }

    /// Re-checks each desk window's owner against the recorded host and
    /// repairs it if Explorer reset it -- a shell restart clears
    /// GWLP_HWNDPARENT without rebuilding the desk window (design.md M4).
    /// Only logs when a window actually needed fixing, so a quiet steady
    /// state produces no output.
    fn rearm_desks(state: &super::DesktopState) {
        let (host, desks) = match state.inner.lock() {
            Ok(inner) => (inner.host, inner.desks.clone()),
            Err(_) => return,
        };
        let Some(host) = host else {
            return;
        };
        for (label, raw) in desks {
            let hwnd = hwnd_from(raw);
            if !alive(hwnd) {
                continue;
            }
            if owner_needs_rearm(current_owner(hwnd), Some(host)) {
                own_desktop(hwnd, hwnd_from(host));
                // The restart that cleared our owner also built a new
                // wallpaper window above us. Ownership governs the next
                // ordering, not this one, so lift the desk back out from
                // under it here.
                raise_once(hwnd);
                log::info!("re-armed desk window {label} against the icon host");
            }
        }
    }

    /// Raise any desk the desktop has just been drawn over. Pairs with
    /// `rearm_desks`: that fixes *who* we sit above, this fixes the one case
    /// where the ordering was already wrong before we got there.
    fn lift_covered_desks(state: &super::DesktopState) {
        let desks = match state.inner.lock() {
            Ok(inner) => inner.desks.clone(),
            Err(_) => return,
        };
        for (label, raw) in desks {
            let hwnd = hwnd_from(raw);
            if alive(hwnd) && desktop_is_covering(hwnd) {
                raise_once(hwnd);
                log::info!("lifted desk window {label} back over the desktop");
            }
        }
    }

    fn hide_def_view(def_view: Option<isize>) {
        if let Some(raw) = def_view {
            unsafe {
                let _ = ShowWindow(hwnd_from(raw), SW_HIDE);
            }
        }
    }

    /// Call Win32 here, not Tauri — this runs off the UI thread.
    ///
    /// Win+D is handled by ownership now (design.md M2): an owned desk window
    /// stays above the icon host with no raise of ours needed. This is now
    /// only a safety net for software that genuinely minimizes or hides the
    /// desk — an RDP session change, some fullscreen games.
    fn restore_to_desktop(hwnd: HWND, def_view: Option<isize>) {
        unsafe {
            // SW_SHOW leaves a minimized window minimized; SW_RESTORE pops it.
            if IsIconic(hwnd).as_bool() {
                let _ = ShowWindow(hwnd, SW_RESTORE);
            } else if !IsWindowVisible(hwnd).as_bool() {
                let _ = ShowWindow(hwnd, SW_SHOW);
            }
        }
        hide_def_view(def_view);
    }

    fn apply_desktop_chrome(window: &WebviewWindow) -> Result<(), String> {
        window
            .set_decorations(false)
            .map_err(|err| err.to_string())?;
        window
            .set_skip_taskbar(true)
            .map_err(|err| err.to_string())?;
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

    /// Drop a desk we no longer own a window for, so nothing writes through
    /// its recycled handle later.
    fn forget_desk(state: &super::DesktopState, label: &str) {
        let Ok(mut inner) = state.inner.lock() else {
            return;
        };
        inner.desks.retain(|(name, _)| name != label);
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
        let host = state.inner.lock().map_err(|err| err.to_string())?.host;
        let monitors = app.available_monitors().map_err(|err| err.to_string())?;
        let primary = app.primary_monitor().ok().flatten();
        let mut wanted: Vec<String> = Vec::new();

        if let Some(main) = app.get_webview_window("main") {
            if let Ok(hwnd) = window_hwnd(&main) {
                remember_desk(state, "main", hwnd);
                arm_one_desk(host, hwnd);
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
                    arm_one_desk(host, hwnd);
                }
                continue;
            }
            // WebView2 deadlocks if we build a window inside a sync command.
            let built =
                WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
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
                arm_one_desk(host, hwnd);
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
            // Forget the handle too. Windows recycles HWNDs, and the owner
            // calls below write through these raw values -- a stale entry
            // would eventually point at some other process's window and we
            // would set its owner to Explorer's icon host every two seconds.
            forget_desk(state, &label);
        }
        Ok(())
    }

    /// Size the (still hidden) window to the work area. Explorer icons stay
    /// until `reveal` so the user never sees a blank wallpaper gap.
    pub fn prepare(window: &WebviewWindow, state: &super::DesktopState) -> Result<(), String> {
        let inner = state.inner.lock().map_err(|err| err.to_string())?;
        if inner.prepared {
            return Ok(());
        }
        drop(inner);
        let hwnd = window_hwnd(window)?;
        ensure_wallpaper_split();
        let shell = unsafe { find_shell()? };
        apply_desktop_chrome(window)?;
        if let Ok(Some(primary)) = window.primary_monitor() {
            let pos = *primary.position();
            let _ = window.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
        }
        cover_work_area(window, hwnd, false)?;
        let mut inner = state.inner.lock().map_err(|err| err.to_string())?;
        inner.prepared = true;
        inner.def_view = Some(hwnd_ptr(shell.def_view));
        // A null host would compare unequal to every real owner and make
        // rearm_desks write owner 0 forever, so record it only when valid.
        inner.host = valid(shell.host).then(|| hwnd_ptr(shell.host));
        inner.desks.clear();
        inner
            .desks
            .push((window.label().to_string(), hwnd_ptr(hwnd)));
        log::info!("Alcove sized to the work area (still hidden)");
        Ok(())
    }

    fn reveal(window: &WebviewWindow, state: &super::DesktopState) -> Result<(), String> {
        let def_view = state.inner.lock().map_err(|err| err.to_string())?.def_view;
        hide_def_view(def_view);
        crate::persist::mark_desktop_hidden(window.app_handle(), true);
        // `prepare` runs once and short-circuits ever after, so on a re-attach
        // its recorded host can be hours old and belong to an Explorer that
        // has since restarted. Ask the shell again before arming against it.
        let fresh_host = unsafe { find_shell() }
            .ok()
            .map(|shell| shell.host)
            .filter(|host| valid(*host))
            .map(hwnd_ptr);
        let (host, desks) = {
            let mut inner = state.inner.lock().map_err(|err| err.to_string())?;
            inner.attached = true;
            if fresh_host.is_some() {
                inner.host = fresh_host;
            }
            (inner.host, inner.desks.clone())
        };
        // Arm every desk window we already know about before anything is
        // shown. A desk that gets shown unowned, even briefly, is a desk
        // Win+D can cover until the next sweep notices.
        for (_, raw) in &desks {
            arm_one_desk(host, hwnd_from(*raw));
        }
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
        // Read the desk list before close_extra_desks destroys the desk-*
        // windows below: disowning after that would be calling
        // SetWindowLongPtrW on a dead handle instead of actually releasing
        // it, and a desk window we leave owned is a reference to a shell
        // window Alcove has no business holding once it detaches.
        let desks = state
            .inner
            .lock()
            .map_err(|err| err.to_string())?
            .desks
            .clone();
        for (_, raw) in &desks {
            let hwnd = hwnd_from(*raw);
            if alive(hwnd) {
                disown_desktop(hwnd);
            }
        }
        close_extra_desks(&app);
        let mut inner = state.inner.lock().map_err(|err| err.to_string())?;
        let shown_def_view = inner.def_view.take();
        inner.host.take();
        if let Some(def_view) = shown_def_view {
            unsafe {
                let _ = ShowWindow(hwnd_from(def_view), SW_SHOW);
            }
        }
        crate::persist::mark_desktop_hidden(&app, false);
        inner.desks.clear();
        let was_attached = inner.attached;
        inner.attached = false;
        inner.prepared = false;
        drop(inner);
        // The poller samples (attached, def_view) and hides the icon list a few
        // instructions later. If it sampled just before this ran, its SW_HIDE
        // lands after ours and the desktop stays empty with nothing left to fix
        // it. Showing once more, after that tick can only have finished, closes
        // the window.
        if let Some(def_view) = shown_def_view {
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(120));
                unsafe {
                    let _ = ShowWindow(hwnd_from(def_view), SW_SHOW);
                }
            });
        }
        if was_attached {
            let main = app
                .get_webview_window("main")
                .unwrap_or_else(|| window.clone());
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
                crate::desktop_events::listen(std::thread::current());
                let mut next_sync = std::time::Instant::now();
                loop {
                    std::thread::park_timeout(Duration::from_millis(250));
                    // A shell event unparks us early (desktop_events::listen).
                    crate::desktop_events::take_notification();
                    // Explorer rebuilt part of the desktop. Show Desktop moves
                    // SHELLDLL_DefView into a WorkerW it creates on the spot, and that
                    // new window sits above a desk still owned by the old host --
                    // measured at ~400ms of visible cover while the slow sweep waited
                    // its turn. Re-point and re-arm now instead. Only shell window
                    // show/hide sets this, so an alt-tab does not drag the shell scan
                    // along with it.
                    let shell_changed = crate::desktop_events::take_shell_notification();
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
                        continue;
                    }
                    if crate::harvest::desktop_restore_paused() {
                        continue;
                    }
                    if shell_changed {
                        // Cheap half only: find the live icon host and re-arm.
                        // sync_desks enumerates monitors and can build windows,
                        // so it stays on the timer below.
                        let state = app.state::<super::DesktopState>();
                        // Lift first. Explorer can raise a fresh wallpaper
                        // window over the desk without our owner changing at
                        // all, and ownership alone cannot undo an order that
                        // was already wrong. This is one hit test; putting the
                        // shell rescan ahead of it spent ~100ms of visible
                        // cover walking every top-level window first.
                        lift_covered_desks(&state);
                        refresh_def_view(&state);
                        rearm_desks(&state);
                    }
                    if std::time::Instant::now() >= next_sync {
                        next_sync = std::time::Instant::now() + Duration::from_secs(2);
                        let state = app.state::<super::DesktopState>();
                        if let Err(err) = sync_desks(&app, &state) {
                            log::warn!("desk sync: {err}");
                        }
                        // Explorer can restart under us. The old SHELLDLL_DefView
                        // handle is then dead, and Windows reuses handles — so
                        // every later SW_HIDE could be hiding some other
                        // process's window while the real icon list sits visible
                        // on top of us. Re-find it.
                        refresh_def_view(&state);
                        // Same restart clears GWLP_HWNDPARENT on every desk
                        // window Windows reset the owner attribute on. Put it
                        // back rather than waiting for the next attach.
                        rearm_desks(&state);
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
                        if needs_restore(hwnd) {
                            restore_to_desktop(hwnd, def_view);
                        }
                    }
                }
            }
        });

        crate::desktop_events::emergency_hotkey(app);
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
    /// Sized and hooked up to the shell. Says nothing about who owns the screen.
    prepared: bool,
    /// We are covering the desktop and Explorer's icon list is hidden. Only
    /// `reveal` sets this, so the poller and `desktop_attached` cannot mistake
    /// "ready to cover" for "covering".
    attached: bool,
    def_view: Option<isize>,
    /// The desktop icon host each desk window should be owned by. `None`
    /// until `prepare()` has found the shell once.
    host: Option<isize>,
    desks: Vec<(String, isize)>,
}

impl DesktopState {
    pub fn attached(&self) -> bool {
        self.inner
            .lock()
            .map(|inner| inner.attached)
            .unwrap_or(false)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn already_armed_needs_no_rearm() {
        assert!(!owner_needs_rearm(Some(7), Some(7)));
    }

    #[test]
    fn owner_cleared_by_explorer_restart_needs_rearm() {
        assert!(owner_needs_rearm(None, Some(7)));
    }

    #[test]
    fn host_changed_needs_rearm() {
        assert!(owner_needs_rearm(Some(7), Some(9)));
    }

    #[test]
    fn no_host_known_needs_no_rearm() {
        assert!(!owner_needs_rearm(Some(7), None));
    }

    #[test]
    fn no_host_known_and_no_owner_needs_no_rearm() {
        assert!(!owner_needs_rearm(None, None));
    }
}
