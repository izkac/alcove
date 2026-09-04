use std::sync::atomic::{AtomicU32, Ordering};

use serde::Serialize;

/// While this is above zero the desktop poller must not raise Alcove. A shell
/// file dialog AVs if it disables the WebView, and a TOPMOST pulse over that
/// dialog does the same.
static RESTORE_PAUSE: AtomicU32 = AtomicU32::new(0);

pub fn desktop_restore_paused() -> bool {
    RESTORE_PAUSE.load(Ordering::Relaxed) > 0
}

pub fn pause_desktop_restore() -> RestorePause {
    RestorePause::enter()
}

pub const PICK_IMAGE_FLAG: &str = "--alcove-pick-image";
pub const PICK_FOLDER_FLAG: &str = "--alcove-pick-folder";

/// A file dialog inside the Alcove process access-violates in comdlg32. The
/// helper is the same exe, started with a flag, and never creates a WebView.
pub fn maybe_run_cli_picker() {
    let image = std::env::args().any(|arg| arg == PICK_IMAGE_FLAG);
    let folder = std::env::args().any(|arg| arg == PICK_FOLDER_FLAG);
    if !image && !folder {
        return;
    }
    #[cfg(windows)]
    {
        use std::io::Write;
        let result = if image {
            win::pick_image_in_process()
        } else {
            win::pick_folder_in_process()
        };
        match result {
            Ok(Some(path)) => {
                print!("{path}");
                let _ = std::io::stdout().flush();
            }
            Ok(None) => {}
            Err(err) => {
                eprint!("{err}");
                let _ = std::io::stderr().flush();
                std::process::exit(1);
            }
        }
        std::process::exit(0);
    }
    #[cfg(not(windows))]
    std::process::exit(1);
}

pub struct RestorePause;

impl RestorePause {
    fn enter() -> Self {
        RESTORE_PAUSE.fetch_add(1, Ordering::SeqCst);
        Self
    }
}

impl Drop for RestorePause {
    fn drop(&mut self) {
        RESTORE_PAUSE.fetch_sub(1, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod restore_pause_tests {
    #[test]
    fn pause_guard_is_visible_then_clears() {
        assert!(!super::desktop_restore_paused());
        {
            let _guard = super::RestorePause::enter();
            assert!(super::desktop_restore_paused());
        }
        assert!(!super::desktop_restore_paused());
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarvestedIcon {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub extension: Option<String>,
    pub group_hint: String,
    pub path: String,
    pub image_url: String,
    pub byte_size: Option<u64>,
    pub modified_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownFolder {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecycleBin {
    pub name: String,
    pub path: String,
    pub image_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopBackground {
    pub color: String,
    pub image_url: Option<String>,
}

/// Scale so the picture covers the desk. Never upscales: CSS `cover` can do that
/// on a small file, and a 9504×6336 wallpaper must not be decoded at full size
/// in the WebView.
pub fn fit_cover(src_w: u32, src_h: u32, dest_w: u32, dest_h: u32) -> (u32, u32) {
    if src_w == 0 || src_h == 0 {
        return (dest_w.max(1), dest_h.max(1));
    }
    let dest_w = dest_w.max(1);
    let dest_h = dest_h.max(1);
    if src_w <= dest_w && src_h <= dest_h {
        return (src_w, src_h);
    }
    // max(dest_w/src_w, dest_h/src_h) without floats: dest_w*src_h vs dest_h*src_w.
    let by_w = dest_w as u64 * src_h as u64;
    let by_h = dest_h as u64 * src_w as u64;
    if by_w >= by_h {
        let height = (src_h as u64 * dest_w as u64 + src_w as u64 / 2) / src_w as u64;
        let height = height.max(1) as u32;
        if dest_w >= src_w {
            return (src_w, src_h);
        }
        (dest_w, height)
    } else {
        let width = (src_w as u64 * dest_h as u64 + src_h as u64 / 2) / src_h as u64;
        let width = width.max(1) as u32;
        if dest_h >= src_h {
            return (src_w, src_h);
        }
        (width, dest_h)
    }
}

#[cfg(windows)]
mod win {
    use super::HarvestedIcon;
    use std::os::windows::ffi::OsStrExt;
    use std::path::{Path, PathBuf};

    use base64::Engine;
    use windows::core::{HSTRING, PCWSTR, PWSTR};
    use windows::Win32::Foundation::{HINSTANCE, SIZE};
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, GetDIBits, GetObjectW,
        ReleaseDC, SelectObject, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
        HBITMAP, HGDIOBJ,
    };
    use windows::Win32::System::Com::{
        CoInitializeEx, CoTaskMemFree, CoUninitialize, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Controls::IImageList;
    use windows::Win32::UI::Shell::{
        DesktopWallpaper, ExtractIconExW, FOLDERID_Desktop, FOLDERID_Documents, FOLDERID_Downloads,
        FOLDERID_Pictures, FOLDERID_PublicDesktop, FOLDERID_Screenshots, IDesktopWallpaper,
        IShellItem2, IShellItemImageFactory, SHCreateItemFromParsingName, SHDefExtractIconW,
        SHGetFileInfoW, SHGetKnownFolderPath, SHGetStockIconInfo, ShellExecuteW, KF_FLAG_DEFAULT,
        SHFILEINFOW, SHGFI_DISPLAYNAME, SHGFI_SYSICONINDEX, SHGSI_SYSICONINDEX, SHIL_EXTRALARGE,
        SHIL_JUMBO, SHSTOCKICONINFO, SIID_RECYCLER, SIID_RECYCLERFULL, SIIGBF, SIIGBF_BIGGERSIZEOK,
        SIIGBF_ICONONLY, SIIGBF_THUMBNAILONLY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreatePopupMenu, DestroyIcon, DestroyMenu, DrawIconEx, GetIconInfo, TrackPopupMenu,
        DI_NORMAL, ICONINFO, SW_SHOWNORMAL, TPM_LEFTALIGN, TPM_RETURNCMD, TPM_RIGHTBUTTON,
    };

    /// Only CoUninitialize if this thread's CoInitializeEx succeeded (S_OK / S_FALSE).
    /// RPC_E_CHANGED_MODE means someone else already owns COM here — tearing it down AVs.
    struct ComGuard {
        active: bool,
    }

    impl ComGuard {
        fn new() -> Self {
            Self {
                active: unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }.is_ok(),
            }
        }
    }

    impl Drop for ComGuard {
        fn drop(&mut self) {
            if self.active {
                unsafe { CoUninitialize() };
            }
        }
    }

    pub fn list_icons() -> Result<Vec<HarvestedIcon>, String> {
        let mut cache = harvest_memo().lock().map_err(|err| err.to_string())?;
        if let Some((at, icons)) = cache.as_ref() {
            if at.elapsed() < HARVEST_MEMO_TTL {
                return Ok(icons.clone());
            }
        }
        let _com = ComGuard::new();
        let started = std::time::Instant::now();
        let result = list_icons_inner();
        if let Ok(icons) = &result {
            log::info!(
                "harvested {} desktop icons in {}ms",
                icons.len(),
                started.elapsed().as_millis()
            );
            *cache = Some((std::time::Instant::now(), icons.clone()));
        }
        result
    }

    fn list_icons_inner() -> Result<Vec<HarvestedIcon>, String> {
        let mut paths = Vec::new();
        collect_folder(&known_folder(&FOLDERID_Desktop)?, &mut paths);
        if let Ok(public) = known_folder(&FOLDERID_PublicDesktop) {
            collect_folder(&public, &mut paths);
        }
        paths.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
        paths.dedup_by(|a, b| a.file_name() == b.file_name());

        let jumbo = jumbo_list().ok();
        let mut icons = Vec::new();
        for path in paths {
            if skip_dead_shortcut(&path) {
                continue;
            }
            match harvest_one(&path, jumbo.as_ref(), true) {
                Ok(icon) => icons.push(icon),
                Err(err) => log::warn!("skip {}: {err}", path.display()),
            }
        }
        Ok(icons)
    }

    fn known_folder(id: &windows::core::GUID) -> Result<PathBuf, String> {
        unsafe {
            let pwstr: PWSTR =
                SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None).map_err(|err| err.to_string())?;
            let os = pwstr.to_string().map_err(|err| err.to_string())?;
            CoTaskMemFree(Some(pwstr.0 as *const _ as *const std::ffi::c_void));
            Ok(PathBuf::from(os))
        }
    }

    fn collect_folder(dir: &Path, out: &mut Vec<PathBuf>) {
        let entries = match std::fs::read_dir(dir) {
            Ok(entries) => entries,
            Err(err) => {
                log::warn!("could not read {}: {err}", dir.display());
                return;
            }
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.eq_ignore_ascii_case("desktop.ini")
                || name.eq_ignore_ascii_case("thumbs.db")
                || name.starts_with('.')
                || is_hidden(&entry)
            {
                continue;
            }
            out.push(path);
        }
    }

    /// Explorer hides these; so should we. Office lock files (`~$report.docx`)
    /// are the ones users actually notice.
    fn is_hidden(entry: &std::fs::DirEntry) -> bool {
        use std::os::windows::fs::MetadataExt;
        const HIDDEN_OR_SYSTEM: u32 = 0x2 | 0x4;
        entry
            .metadata()
            .map(|meta| meta.file_attributes() & HIDDEN_OR_SYSTEM != 0)
            .unwrap_or(false)
    }

    fn unix_ms(time: std::time::SystemTime) -> Option<i64> {
        time.duration_since(std::time::UNIX_EPOCH)
            .ok()
            .and_then(|span| i64::try_from(span.as_millis()).ok())
    }

    fn harvest_one(
        path: &Path,
        jumbo: Option<&IImageList>,
        extract_icon: bool,
    ) -> Result<HarvestedIcon, String> {
        let display = display_name(path);
        let ext = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_ascii_lowercase());
        let is_dir = path.is_dir();
        let (kind, group_hint) = classify(is_dir, ext.as_deref());
        let image_url = if extract_icon {
            match icon_png(path, jumbo) {
                Ok(png) => format!(
                    "data:image/png;base64,{}",
                    base64::engine::general_purpose::STANDARD.encode(png)
                ),
                Err(err) => {
                    log::warn!("icon {}: {err}", path.display());
                    String::new()
                }
            }
        } else {
            String::new()
        };
        let path_str = path.to_string_lossy().to_string();
        let meta = std::fs::metadata(path).ok();
        let byte_size = if is_dir {
            None
        } else {
            meta.as_ref().map(|m| m.len())
        };
        let modified_at = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(unix_ms);
        Ok(HarvestedIcon {
            id: path_str.clone(),
            name: display,
            kind: kind.to_string(),
            extension: ext,
            group_hint: group_hint.to_string(),
            path: path_str,
            image_url,
            byte_size,
            modified_at,
        })
    }

    fn display_name(path: &Path) -> String {
        let wide: Vec<u16> = path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let mut info = SHFILEINFOW::default();
        let ok = unsafe {
            SHGetFileInfoW(
                PCWSTR(wide.as_ptr()),
                Default::default(),
                Some(&mut info),
                std::mem::size_of::<SHFILEINFOW>() as u32,
                SHGFI_DISPLAYNAME,
            )
        };
        if ok != 0 {
            let end = info
                .szDisplayName
                .iter()
                .position(|&c| c == 0)
                .unwrap_or(info.szDisplayName.len());
            let name = String::from_utf16_lossy(&info.szDisplayName[..end]);
            if !name.is_empty() {
                return name;
            }
        }
        path.file_stem()
            .or_else(|| path.file_name())
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.to_string_lossy().into_owned())
    }

    fn classify(is_dir: bool, ext: Option<&str>) -> (&'static str, &'static str) {
        if is_dir {
            return ("folder", "folders");
        }
        match ext {
            Some("lnk") | Some("url") => ("shortcut", "apps"),
            Some("exe") | Some("msc") => ("app", "apps"),
            Some("msi") | Some("msix") | Some("appx") | Some("msixbundle") => {
                ("installer", "installers")
            }
            Some("zip") | Some("7z") | Some("rar") | Some("iso") => ("installer", "installers"),
            Some("png") | Some("jpg") | Some("jpeg") | Some("jfif") | Some("gif") | Some("webp")
            | Some("bmp") | Some("tif") | Some("tiff") | Some("heic") => ("image", "photos"),
            _ => ("document", "documents"),
        }
    }

    // Ask Windows for a 256px resource. Encode at most 128px, and never stretch a
    // smaller HICON up to that size (that was the blurry-tile bug).
    const ICON_PX: i32 = 128;
    const EXTRACT_PX: i32 = 256;
    const MIN_ICON_EDGE: u32 = 40;
    const CACHE_TAG: &str = "q6";
    /// Preview edge. Big enough to read a page of a PDF, small enough to cache.
    const THUMB_PX: i32 = 512;
    const PKEY_APPUSERMODEL_ID: windows::Win32::Foundation::PROPERTYKEY =
        windows::Win32::Foundation::PROPERTYKEY {
            fmtid: windows::core::GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3),
            pid: 5,
        };

    /// Long enough to absorb the startup stampede - every desk window harvests
    /// at once - and short enough that any later call sees the real folder. A
    /// permanent memo means a file added in Explorer never appears at all.
    const HARVEST_MEMO_TTL: std::time::Duration = std::time::Duration::from_secs(2);

    type HarvestMemo = Option<(std::time::Instant, Vec<HarvestedIcon>)>;

    fn harvest_memo() -> &'static std::sync::Mutex<HarvestMemo> {
        static CACHE: std::sync::OnceLock<std::sync::Mutex<HarvestMemo>> =
            std::sync::OnceLock::new();
        CACHE.get_or_init(|| std::sync::Mutex::new(None))
    }

    fn jumbo_list() -> Result<IImageList, String> {
        use windows::Win32::UI::Shell::SHGetImageList;
        unsafe { SHGetImageList(SHIL_JUMBO as i32) }.map_err(|err| err.to_string())
    }

    /// Real Windows icon for a launcher target: an `exe`/`dll`/`cpl` path with
    /// an optional `,index`, a folder, or a `shell:` namespace name.
    pub fn shell_icon(target: &str) -> Result<String, String> {
        let _com = ComGuard::new();
        shell_icon_inner(target)
    }

    fn shell_icon_inner(target: &str) -> Result<String, String> {
        let (raw, index) = split_icon_index(target);
        let path = expand_env_path(raw);
        let png = if !path.exists() {
            shell_item_png(
                raw,
                EXTRACT_PX,
                MIN_ICON_EDGE,
                SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK,
            )?
        } else if index > 0 {
            // Cache is keyed by path alone, so non-zero indices skip it.
            private_extract_png(&path, index, EXTRACT_PX, MIN_ICON_EDGE)?
        } else {
            icon_png(&path, None)?
        };
        Ok(format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(png)
        ))
    }

    fn split_icon_index(target: &str) -> (&str, i32) {
        match target.rsplit_once(',') {
            Some((file, index)) => match index.trim().parse() {
                Ok(index) => (file, index),
                Err(_) => (target, 0),
            },
            None => (target, 0),
        }
    }

    pub fn icon_data_url(path: &Path) -> Result<String, String> {
        Ok(png_data_url(&icon_png(path, None)?))
    }

    /// The document's own thumbnail — page one of a PDF, the first frame of a
    /// video, the photo itself — the same bitmap Explorer shows in Large Icons
    /// view. `Ok(None)` when the type has no thumbnail provider (exes,
    /// shortcuts, most folders); the caller keeps the icon it already has.
    pub fn thumb_data_url(path: &Path) -> Result<Option<String>, String> {
        let _com = ComGuard::new();
        if let Some(cached) = read_icon_cache(path, THUMB_PX) {
            return Ok(Some(png_data_url(&cached)));
        }
        // THUMBNAILONLY means "no icon fallback" — a miss is the answer, not an
        // error, so we can tell "here is the document" from "there is nothing
        // to show" instead of caching a blown-up 48px icon as a preview.
        let Ok(png) = shell_item_png_raw(
            &path.to_string_lossy(),
            THUMB_PX,
            0,
            SIIGBF_THUMBNAILONLY | SIIGBF_BIGGERSIZEOK,
            true,
        ) else {
            return Ok(None);
        };
        write_icon_cache(path, THUMB_PX, &png);
        Ok(Some(png_data_url(&png)))
    }

    fn png_data_url(png: &[u8]) -> String {
        format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(png)
        )
    }

    fn icon_png(path: &Path, jumbo: Option<&IImageList>) -> Result<Vec<u8>, String> {
        if let Some(cached) = read_icon_cache(path, ICON_PX) {
            return Ok(cached);
        }
        let png = extract_fresh(path, jumbo)?;
        write_icon_cache(path, ICON_PX, &png);
        Ok(png)
    }

    fn extract_fresh(path: &Path, jumbo: Option<&IImageList>) -> Result<Vec<u8>, String> {
        for (file, index) in extract_targets(path) {
            if let Ok(png) = private_extract_png(&file, index, EXTRACT_PX, MIN_ICON_EDGE) {
                return Ok(png);
            }
        }
        if let Some(aumid) = app_user_model_id(path) {
            if let Some(exe) = packaged_app_exe(&aumid) {
                if let Ok(png) = private_extract_png(&exe, 0, EXTRACT_PX, MIN_ICON_EDGE) {
                    return Ok(png);
                }
            }
        }
        if let Ok(png) = imagelist_png(path, jumbo, SHIL_JUMBO as i32, MIN_ICON_EDGE) {
            return Ok(png);
        }
        if let Ok(png) = imagelist_png(path, None, SHIL_EXTRALARGE as i32, MIN_ICON_EDGE) {
            return Ok(png);
        }
        if let Ok(png) = shell_item_png(
            &path.to_string_lossy(),
            EXTRACT_PX,
            MIN_ICON_EDGE,
            SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK,
        ) {
            return Ok(png);
        }
        if let Some(aumid) = app_user_model_id(path) {
            let parsing = format!("shell:AppsFolder\\{aumid}");
            if let Ok(png) = shell_item_png(
                &parsing,
                EXTRACT_PX,
                MIN_ICON_EDGE,
                SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK,
            ) {
                return Ok(png);
            }
        }
        for (file, index) in extract_targets(path) {
            if let Ok(png) = private_extract_png(&file, index, EXTRACT_PX, 0) {
                return Ok(png);
            }
        }
        extract_icon_at(path, 0, 0)
    }

    fn icon_cache_dir() -> Option<std::path::PathBuf> {
        let base = std::env::var_os("LOCALAPPDATA")?;
        let dir = std::path::PathBuf::from(base)
            .join("alcove")
            .join("icon-cache");
        std::fs::create_dir_all(&dir).ok()?;
        Some(dir)
    }

    fn icon_cache_path(path: &Path, px: i32) -> Option<std::path::PathBuf> {
        use std::time::UNIX_EPOCH;
        let meta = std::fs::metadata(path).ok()?;
        let mtime = meta
            .modified()
            .ok()?
            .duration_since(UNIX_EPOCH)
            .ok()?
            .as_secs();
        let mut hash: u64 = 0xcbf29ce484222325;
        for byte in path.to_string_lossy().as_bytes() {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x100000001b3);
        }
        Some(icon_cache_dir()?.join(format!(
            "{hash:016x}-{mtime}-{}-{px}-{CACHE_TAG}.png",
            meta.len()
        )))
    }

    fn read_icon_cache(path: &Path, px: i32) -> Option<Vec<u8>> {
        let file = icon_cache_path(path, px)?;
        let bytes = std::fs::read(file).ok()?;
        (bytes.len() > 32).then_some(bytes)
    }

    fn write_icon_cache(path: &Path, px: i32, png: &[u8]) {
        let Some(file) = icon_cache_path(path, px) else {
            return;
        };
        let _ = std::fs::write(file, png);
    }

    fn wide_path(path: &Path) -> Vec<u16> {
        path.as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    fn extract_targets(path: &Path) -> Vec<(PathBuf, i32)> {
        let mut out = Vec::new();
        let is_lnk = path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("lnk"));
        if is_lnk {
            out.extend(shortcut_icon_files(path));
        }
        push_extract_target(&mut out, path.to_path_buf(), 0);
        out
    }

    fn push_extract_target(out: &mut Vec<(PathBuf, i32)>, file: PathBuf, index: i32) {
        if file.as_os_str().is_empty() {
            return;
        }
        if !file.exists() {
            return;
        }
        if out
            .iter()
            .any(|(existing, i)| existing == &file && *i == index)
        {
            return;
        }
        out.push((file, index));
    }

    fn shortcut_icon_files(path: &Path) -> Vec<(PathBuf, i32)> {
        use windows::core::Interface;
        use windows::Win32::System::Com::{
            CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER, STGM_READ,
        };
        use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};
        let link: IShellLinkW =
            match unsafe { CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER) } {
                Ok(link) => link,
                Err(_) => return Vec::new(),
            };
        let persist: IPersistFile = match link.cast() {
            Ok(persist) => persist,
            Err(_) => return Vec::new(),
        };
        if unsafe { persist.Load(&HSTRING::from(path.to_string_lossy().as_ref()), STGM_READ) }
            .is_err()
        {
            return Vec::new();
        }
        let mut out = Vec::new();
        let mut icon_path = [0u16; 260];
        let mut icon_index = 0i32;
        if unsafe { link.GetIconLocation(&mut icon_path, &mut icon_index) }.is_ok() {
            push_extract_target(&mut out, expand_env_path(&utf16_z(&icon_path)), icon_index);
        }
        let mut target = [0u16; 260];
        if unsafe { link.GetPath(&mut target, std::ptr::null_mut(), 0) }.is_ok() {
            push_extract_target(&mut out, expand_env_path(&utf16_z(&target)), 0);
        }
        out
    }

    fn app_user_model_id(path: &Path) -> Option<String> {
        let hstring = HSTRING::from(path.to_string_lossy().as_ref());
        let item: IShellItem2 = unsafe { SHCreateItemFromParsingName(&hstring, None) }.ok()?;
        let pwstr = unsafe { item.GetString(&PKEY_APPUSERMODEL_ID) }.ok()?;
        let name = unsafe { pwstr.to_string() }.ok();
        unsafe {
            CoTaskMemFree(Some(pwstr.0 as *const _ as *const std::ffi::c_void));
        }
        name.filter(|s| !s.is_empty())
            .or_else(|| aumid_from_lnk_file(path))
    }

    /// Scan a shortcut's own bytes for the AppUserModelID the shell would not
    /// give us. Only ever a `.lnk`, and only a small one: this is reached for
    /// every file whose icon needs extracting, so without the guard a 4 GB ISO
    /// on the Desktop is read into memory - twice - on the main thread.
    fn aumid_from_lnk_file(path: &Path) -> Option<String> {
        const LNK_MAX: u64 = 1 << 20;
        if !path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("lnk"))
        {
            return None;
        }
        if std::fs::metadata(path).ok()?.len() > LNK_MAX {
            return None;
        }
        let bytes = std::fs::read(path).ok()?;
        find_aumid_utf16(&bytes).or_else(|| find_aumid_utf16(bytes.get(1..)?))
    }

    fn find_aumid_utf16(bytes: &[u8]) -> Option<String> {
        let units: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect();
        for (i, &unit) in units.iter().enumerate() {
            if unit != b'!' as u16 {
                continue;
            }
            let start = units[..i]
                .iter()
                .rposition(|&c| !(32..=126).contains(&c))
                .map(|p| p + 1)
                .unwrap_or(0);
            let end = units[i + 1..]
                .iter()
                .position(|&c| !(32..=126).contains(&c))
                .map(|p| i + 1 + p)
                .unwrap_or(units.len());
            let text = String::from_utf16_lossy(&units[start..end]);
            if text.contains('_') && text.len() > 10 && text.len() < 256 {
                return Some(text);
            }
        }
        None
    }

    fn skip_dead_shortcut(path: &Path) -> bool {
        path.extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("lnk"))
            && shortcut_target_is_missing(path)
    }

    fn shortcut_target_is_missing(path: &Path) -> bool {
        let Some(target) = shortcut_target_file(path) else {
            return false;
        };
        let text = target.to_string_lossy();
        if text.starts_with("\\\\") {
            return false;
        }
        !target.exists()
    }

    fn shortcut_target_file(path: &Path) -> Option<PathBuf> {
        let link = load_shell_link(path)?;
        let mut target = [0u16; 260];
        unsafe { link.GetPath(&mut target, std::ptr::null_mut(), 0) }.ok()?;
        let file = expand_env_path(&utf16_z(&target));
        (!file.as_os_str().is_empty()).then_some(file)
    }

    fn load_shell_link(path: &Path) -> Option<windows::Win32::UI::Shell::IShellLinkW> {
        use windows::core::Interface;
        use windows::Win32::System::Com::{
            CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER, STGM_READ,
        };
        use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};
        let link: IShellLinkW =
            unsafe { CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER) }.ok()?;
        let persist: IPersistFile = link.cast().ok()?;
        unsafe { persist.Load(&HSTRING::from(path.to_string_lossy().as_ref()), STGM_READ) }.ok()?;
        Some(link)
    }

    fn packaged_app_exe(aumid: &str) -> Option<PathBuf> {
        if let Some(path) = apps_folder_filesystem(aumid) {
            if path
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("exe"))
            {
                return Some(path);
            }
        }
        let app_id = aumid.split('!').nth(1).unwrap_or("");
        let dir = package_install_dir(aumid)?;
        if app_id.is_empty() {
            return None;
        }
        Some(dir.join("app").join(format!("{app_id}.exe")))
    }

    fn apps_folder_filesystem(aumid: &str) -> Option<PathBuf> {
        use windows::Win32::UI::Shell::{IShellItem, SIGDN_FILESYSPATH};
        let parsing = format!("shell:AppsFolder\\{aumid}");
        let item: IShellItem =
            unsafe { SHCreateItemFromParsingName(&HSTRING::from(parsing.as_str()), None) }.ok()?;
        let pwstr = unsafe { item.GetDisplayName(SIGDN_FILESYSPATH) }.ok()?;
        let text = unsafe { pwstr.to_string() }.ok();
        unsafe {
            CoTaskMemFree(Some(pwstr.0 as *const _ as *const std::ffi::c_void));
        }
        text.filter(|s| !s.is_empty()).map(PathBuf::from)
    }

    fn package_install_dir(aumid: &str) -> Option<PathBuf> {
        use windows::Win32::Foundation::{ERROR_INSUFFICIENT_BUFFER, ERROR_SUCCESS};
        use windows::Win32::Storage::Packaging::Appx::{
            GetPackagePathByFullName, GetPackagesByPackageFamily,
        };
        let family = aumid.split('!').next()?.trim();
        if family.is_empty() {
            return None;
        }
        let family_h = HSTRING::from(family);
        let mut count = 0u32;
        let mut buffer_length = 0u32;
        let first = unsafe {
            GetPackagesByPackageFamily(&family_h, &mut count, None, &mut buffer_length, None)
        };
        if first != ERROR_INSUFFICIENT_BUFFER && first != ERROR_SUCCESS {
            return None;
        }
        if count == 0 || buffer_length == 0 {
            return None;
        }
        let mut names = vec![PWSTR::null(); count as usize];
        let mut buffer = vec![0u16; buffer_length as usize];
        let status = unsafe {
            GetPackagesByPackageFamily(
                &family_h,
                &mut count,
                Some(names.as_mut_ptr()),
                &mut buffer_length,
                Some(PWSTR(buffer.as_mut_ptr())),
            )
        };
        if status != ERROR_SUCCESS || names.is_empty() || names[0].is_null() {
            return None;
        }
        let full_name = unsafe { names[0].to_string() }.ok()?;
        let full_h = HSTRING::from(full_name.as_str());
        let mut path_len = 0u32;
        let _ = unsafe { GetPackagePathByFullName(&full_h, &mut path_len, None) };
        if path_len == 0 {
            return None;
        }
        let mut path_buf = vec![0u16; path_len as usize];
        let status = unsafe {
            GetPackagePathByFullName(&full_h, &mut path_len, Some(PWSTR(path_buf.as_mut_ptr())))
        };
        if status != ERROR_SUCCESS {
            return None;
        }
        let end = path_buf
            .iter()
            .position(|&c| c == 0)
            .unwrap_or(path_buf.len());
        Some(PathBuf::from(String::from_utf16_lossy(&path_buf[..end])))
    }

    fn expand_env_path(raw: &str) -> PathBuf {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return PathBuf::new();
        }
        let mut out = String::new();
        let mut rest = trimmed;
        while let Some(start) = rest.find('%') {
            out.push_str(&rest[..start]);
            rest = &rest[start + 1..];
            match rest.find('%') {
                Some(0) => {
                    out.push('%');
                    rest = &rest[1..];
                }
                Some(end) => {
                    let name = &rest[..end];
                    match std::env::var(name) {
                        Ok(value) => out.push_str(&value),
                        Err(_) => {
                            out.push('%');
                            out.push_str(name);
                            out.push('%');
                        }
                    }
                    rest = &rest[end + 1..];
                }
                None => {
                    out.push('%');
                    out.push_str(rest);
                    rest = "";
                }
            }
        }
        out.push_str(rest);
        PathBuf::from(out)
    }

    fn utf16_z(buf: &[u16]) -> String {
        String::from_utf16_lossy(&buf[..buf.iter().position(|&c| c == 0).unwrap_or(buf.len())])
    }

    fn imagelist_png(
        path: &Path,
        list: Option<&IImageList>,
        shil: i32,
        min_edge: u32,
    ) -> Result<Vec<u8>, String> {
        use windows::Win32::UI::Controls::ILD_TRANSPARENT;
        use windows::Win32::UI::Shell::SHGetImageList;
        let wide = wide_path(path);
        let mut info = SHFILEINFOW::default();
        let ok = unsafe {
            SHGetFileInfoW(
                PCWSTR(wide.as_ptr()),
                Default::default(),
                Some(&mut info),
                std::mem::size_of::<SHFILEINFOW>() as u32,
                SHGFI_SYSICONINDEX,
            )
        };
        if ok == 0 {
            return Err("no system icon index".into());
        }
        let owned = match list {
            Some(_) => None,
            None => Some(unsafe { SHGetImageList(shil) }.map_err(|err| err.to_string())?),
        };
        let list = list.or(owned.as_ref()).ok_or("no image list")?;
        let icon = unsafe { list.GetIcon(info.iIcon, ILD_TRANSPARENT.0 as u32) }
            .map_err(|err| err.to_string())?;
        let png = unsafe { hicon_to_png(icon, min_edge) };
        unsafe {
            let _ = DestroyIcon(icon);
        }
        png
    }

    fn private_extract_png(
        path: &Path,
        index: i32,
        ask: i32,
        min_edge: u32,
    ) -> Result<Vec<u8>, String> {
        let mut icon = windows::Win32::UI::WindowsAndMessaging::HICON::default();
        let hr = unsafe {
            SHDefExtractIconW(
                &HSTRING::from(path.to_string_lossy().as_ref()),
                index,
                0,
                Some(&mut icon as *mut _),
                None,
                ask as u32,
            )
        };
        if hr.is_err() || icon.0.is_null() {
            return Err("SHDefExtractIcon found nothing".into());
        }
        let png = unsafe { hicon_to_png(icon, min_edge) };
        unsafe {
            let _ = DestroyIcon(icon);
        }
        png
    }

    fn extract_icon_at(path: &Path, index: i32, min_edge: u32) -> Result<Vec<u8>, String> {
        let wide = wide_path(path);
        let mut large = windows::Win32::UI::WindowsAndMessaging::HICON::default();
        let count =
            unsafe { ExtractIconExW(PCWSTR(wide.as_ptr()), index, Some(&mut large), None, 1) };
        if count == 0 || large.0.is_null() {
            return Err("ExtractIconEx found nothing".into());
        }
        let png = unsafe { hicon_to_png(large, min_edge) };
        unsafe {
            let _ = DestroyIcon(large);
        }
        png
    }

    /// `raw` keeps the bitmap exactly as the shell drew it. The icon path runs
    /// heuristics that reject blank or washed-out results, which is right for a
    /// placeholder icon and wrong for a document thumbnail: page one of most
    /// documents is a white page with a little ink, i.e. exactly "washed out".
    fn shell_item_png(
        parsing: &str,
        size: i32,
        min_edge: u32,
        flags: SIIGBF,
    ) -> Result<Vec<u8>, String> {
        shell_item_png_raw(parsing, size, min_edge, flags, false)
    }

    fn shell_item_png_raw(
        parsing: &str,
        size: i32,
        min_edge: u32,
        flags: SIIGBF,
        raw: bool,
    ) -> Result<Vec<u8>, String> {
        let hstring = HSTRING::from(parsing);
        let factory: IShellItemImageFactory =
            unsafe { SHCreateItemFromParsingName(&hstring, None) }
                .map_err(|err| err.to_string())?;
        let hbmp = unsafe { factory.GetImage(SIZE { cx: size, cy: size }, flags) }
            .map_err(|err| err.to_string())?;
        let png = unsafe { hbitmap_to_png(hbmp, min_edge, raw) };
        unsafe {
            let _ = DeleteObject(HGDIOBJ(hbmp.0));
        }
        png
    }

    fn shell_display_name(parsing: &str) -> Option<String> {
        use windows::Win32::UI::Shell::{IShellItem, SIGDN_NORMALDISPLAY};
        let hstring = HSTRING::from(parsing);
        let item: IShellItem = unsafe { SHCreateItemFromParsingName(&hstring, None) }.ok()?;
        let pwstr = unsafe { item.GetDisplayName(SIGDN_NORMALDISPLAY) }.ok()?;
        let name = unsafe { pwstr.to_string() }.ok();
        unsafe {
            CoTaskMemFree(Some(pwstr.0 as *const _ as *const std::ffi::c_void));
        }
        name.filter(|s| !s.is_empty())
    }

    pub fn recycle_bin() -> Result<super::RecycleBin, String> {
        let _com = ComGuard::new();
        recycle_bin_inner()
    }

    fn recycle_bin_inner() -> Result<super::RecycleBin, String> {
        const PARSING: &str = "shell:RecycleBinFolder";
        let png = recycle_bin_png().or_else(|_| {
            shell_item_png(
                PARSING,
                EXTRACT_PX,
                0,
                SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK,
            )
        })?;
        let image_url = format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(png)
        );
        Ok(super::RecycleBin {
            name: shell_display_name(PARSING).unwrap_or_else(|| "Recycle Bin".into()),
            path: PARSING.into(),
            image_url,
        })
    }

    fn recycle_bin_png() -> Result<Vec<u8>, String> {
        use windows::Win32::UI::Controls::{IImageList, ILD_TRANSPARENT};
        use windows::Win32::UI::Shell::{
            SHGetImageList, SHQueryRecycleBinW, SHIL_JUMBO, SHQUERYRBINFO,
        };
        let mut query = SHQUERYRBINFO {
            cbSize: std::mem::size_of::<SHQUERYRBINFO>() as u32,
            ..Default::default()
        };
        let full = unsafe { SHQueryRecycleBinW(None, &mut query) }.is_ok() && query.i64NumItems > 0;
        let mut info = SHSTOCKICONINFO {
            cbSize: std::mem::size_of::<SHSTOCKICONINFO>() as u32,
            ..Default::default()
        };
        unsafe {
            SHGetStockIconInfo(
                if full {
                    SIID_RECYCLERFULL
                } else {
                    SIID_RECYCLER
                },
                SHGSI_SYSICONINDEX,
                &mut info,
            )
            .map_err(|err| err.to_string())?;
        }
        let list: IImageList =
            unsafe { SHGetImageList(SHIL_JUMBO as i32) }.map_err(|err| err.to_string())?;
        let icon = unsafe { list.GetIcon(info.iSysImageIndex, ILD_TRANSPARENT.0 as u32) }
            .map_err(|err| err.to_string())?;
        let png = unsafe { hicon_to_png(icon, 0) };
        unsafe {
            let _ = DestroyIcon(icon);
        }
        png
    }

    unsafe fn hicon_px(icon: windows::Win32::UI::WindowsAndMessaging::HICON) -> i32 {
        let mut info = ICONINFO::default();
        if GetIconInfo(icon, &mut info).is_err() {
            return 32;
        }
        let color = !info.hbmColor.0.is_null();
        let handle = if color { info.hbmColor } else { info.hbmMask };
        let mut bm = BITMAP::default();
        let ok = GetObjectW(
            HGDIOBJ(handle.0),
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bm as *mut BITMAP as *mut core::ffi::c_void),
        );
        if !info.hbmColor.0.is_null() {
            let _ = DeleteObject(HGDIOBJ(info.hbmColor.0));
        }
        if !info.hbmMask.0.is_null() {
            let _ = DeleteObject(HGDIOBJ(info.hbmMask.0));
        }
        if ok == 0 || bm.bmWidth <= 0 {
            return 32;
        }
        let height = bm.bmHeight.abs();
        let height = if color { height } else { (height / 2).max(1) };
        bm.bmWidth.max(height)
    }

    unsafe fn hicon_to_png(
        icon: windows::Win32::UI::WindowsAndMessaging::HICON,
        min_edge: u32,
    ) -> Result<Vec<u8>, String> {
        use windows::Win32::Foundation::HWND;
        let native = hicon_px(icon);
        let size = native.min(ICON_PX).max(1);
        let hdc_screen = GetDC(Some(HWND::default()));
        let hdc = CreateCompatibleDC(Some(hdc_screen));
        let info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: size,
                biHeight: -size,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
        let dib = CreateDIBSection(Some(hdc), &info, DIB_RGB_COLORS, &mut bits, None, 0)
            .map_err(|err| err.to_string())?;
        let old = SelectObject(hdc, HGDIOBJ(dib.0));
        let len = (size * size * 4) as usize;
        if !bits.is_null() {
            std::ptr::write_bytes(bits, 0, len);
        }
        let _ = DrawIconEx(hdc, 0, 0, icon, size, size, 0, None, DI_NORMAL);
        let bgra = if bits.is_null() {
            vec![0u8; len]
        } else {
            std::slice::from_raw_parts(bits as *const u8, len).to_vec()
        };
        SelectObject(hdc, old);
        let _ = DeleteObject(HGDIOBJ(dib.0));
        let _ = DeleteDC(hdc);
        let _ = ReleaseDC(Some(HWND::default()), hdc_screen);
        encode_icon_rgba(bgra_to_rgba(&bgra), size as u32, size as u32, min_edge)
    }

    pub fn popup_recycle_bin_menu(hwnd: isize, x: i32, y: i32) -> Result<(), String> {
        use windows::core::PCSTR;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::Shell::{
            BHID_SFUIObject, IContextMenu, IShellItem, CMF_NORMAL, CMINVOKECOMMANDINFO,
        };
        let _com = ComGuard::new();
        let result = (|| {
            let item: IShellItem = unsafe {
                SHCreateItemFromParsingName(&HSTRING::from("shell:RecycleBinFolder"), None)
            }
            .map_err(|err| err.to_string())?;
            let ctx: IContextMenu = unsafe { item.BindToHandler(None, &BHID_SFUIObject) }
                .map_err(|err| err.to_string())?;
            let menu = unsafe { CreatePopupMenu() }.map_err(|err| err.to_string())?;
            let owner = HWND(hwnd as *mut core::ffi::c_void);
            // Every early return past this point has to free the menu, so the
            // body is its own closure and DestroyMenu runs on the way out.
            let picked = (|| {
                unsafe { ctx.QueryContextMenu(menu, 0, 1, 0x7FFF, CMF_NORMAL) }
                    .ok()
                    .map_err(|err| err.to_string())?;
                // Without this the menu does not close when the user clicks
                // away from it - it just sits there until something is picked.
                unsafe {
                    let _ = windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow(owner);
                }
                let cmd = unsafe {
                    TrackPopupMenu(
                        menu,
                        TPM_RETURNCMD | TPM_RIGHTBUTTON | TPM_LEFTALIGN,
                        x,
                        y,
                        Some(0),
                        owner,
                        None,
                    )
                };
                let code = cmd.0 as u32;
                if code > 0 {
                    let invoke = CMINVOKECOMMANDINFO {
                        cbSize: std::mem::size_of::<CMINVOKECOMMANDINFO>() as u32,
                        hwnd: owner,
                        lpVerb: PCSTR((code as usize - 1) as *const u8),
                        nShow: SW_SHOWNORMAL.0,
                        ..Default::default()
                    };
                    unsafe { ctx.InvokeCommand(&invoke) }.map_err(|err| err.to_string())?;
                }
                Ok(())
            })();
            unsafe {
                let _ = DestroyMenu(menu);
            }
            picked
        })();
        result
    }

    pub fn empty_recycle_bin() -> Result<(), String> {
        use windows::Win32::UI::Shell::SHEmptyRecycleBinW;
        unsafe { SHEmptyRecycleBinW(None, None, 0) }.map_err(|err| err.to_string())
    }

    pub fn recycle_bin_properties() -> Result<(), String> {
        let hstring = HSTRING::from("shell:RecycleBinFolder");
        let verb = windows::core::w!("properties");
        let result = unsafe {
            ShellExecuteW(
                None,
                verb,
                &hstring,
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };
        if result.0 as isize <= 32 {
            return Err("could not open Recycle Bin properties".into());
        }
        Ok(())
    }

    /// The folders that make up "the Desktop". Public Desktop is where
    /// installers drop shortcuts for every user, so it is the one that changes
    /// behind the user's back most often.
    pub fn desktop_dirs() -> Vec<PathBuf> {
        let _com = ComGuard::new();
        let mut dirs = Vec::new();
        if let Ok(dir) = known_folder(&FOLDERID_Desktop) {
            dirs.push(dir);
        }
        if let Ok(dir) = known_folder(&FOLDERID_PublicDesktop) {
            dirs.push(dir);
        }
        dirs
    }

    /// Drop the harvest memo so the very next listing re-reads the folder.
    pub fn forget_icons() {
        invalidate_icon_cache();
    }

    fn invalidate_icon_cache() {
        if let Ok(mut cache) = harvest_memo().lock() {
            *cache = None;
        }
    }

    fn owner_hwnd(raw: isize) -> windows::Win32::Foundation::HWND {
        windows::Win32::Foundation::HWND(raw as *mut core::ffi::c_void)
    }

    fn file_op() -> Result<windows::Win32::UI::Shell::IFileOperation, String> {
        use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
        use windows::Win32::UI::Shell::FileOperation;
        unsafe { CoCreateInstance(&FileOperation, None, CLSCTX_INPROC_SERVER) }
            .map_err(|err| err.to_string())
    }

    pub fn paste_into(hwnd: isize, dest: Option<&str>) -> Result<(), String> {
        use windows::Win32::System::Ole::OleGetClipboard;
        use windows::Win32::UI::Shell::{
            IFileOperation, IShellItem, FILEOPERATION_FLAGS, FOF_ALLOWUNDO, FOF_NOCONFIRMATION,
            FOF_NOCONFIRMMKDIR, FOF_RENAMEONCOLLISION,
        };
        let dest_path = match dest {
            Some(path) if !path.trim().is_empty() => PathBuf::from(path.trim()),
            _ => known_folder(&FOLDERID_Desktop)?,
        };
        if !dest_path.is_dir() {
            return Err(format!("not a folder: {}", dest_path.display()));
        }
        let _com = ComGuard::new();
        let result = (|| -> Result<(), String> {
            let op: IFileOperation = file_op()?;
            let flags = FILEOPERATION_FLAGS(
                FOF_ALLOWUNDO.0
                    | FOF_NOCONFIRMATION.0
                    | FOF_NOCONFIRMMKDIR.0
                    | FOF_RENAMEONCOLLISION.0,
            );
            unsafe {
                op.SetOperationFlags(flags).map_err(|err| err.to_string())?;
                op.SetOwnerWindow(owner_hwnd(hwnd))
                    .map_err(|err| err.to_string())?;
                let dest_item: IShellItem = SHCreateItemFromParsingName(
                    &HSTRING::from(dest_path.to_string_lossy().as_ref()),
                    None,
                )
                .map_err(|err| err.to_string())?;
                let data = OleGetClipboard().map_err(|err| err.to_string())?;
                op.CopyItems(&data, &dest_item)
                    .map_err(|_| "clipboard has no files to paste".to_string())?;
                op.PerformOperations()
                    .map_err(|_| "clipboard has no files to paste".to_string())?;
            }
            Ok(())
        })();
        invalidate_icon_cache();
        result
    }

    pub fn recycle_paths(hwnd: isize, paths: &[String]) -> Result<(), String> {
        use windows::Win32::UI::Shell::{
            SHFileOperationW, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_SILENT, FOF_WANTNUKEWARNING,
            FO_DELETE, SHFILEOPSTRUCTW,
        };
        if paths.is_empty() {
            return Ok(());
        }
        let mut from: Vec<u16> = Vec::new();
        for path in paths {
            let trimmed = path.trim();
            if trimmed.is_empty() {
                continue;
            }
            from.extend(std::path::Path::new(trimmed).as_os_str().encode_wide());
            from.push(0);
        }
        from.push(0);
        if from.len() < 2 {
            return Ok(());
        }
        let mut op = SHFILEOPSTRUCTW {
            hwnd: owner_hwnd(hwnd),
            wFunc: FO_DELETE,
            pFrom: PCWSTR(from.as_ptr()),
            pTo: PCWSTR::null(),
            // Alcove asks before calling this, and Windows' own prompt is off
            // by default anyway, so asking here would be a second dialog most
            // people never see. ALLOWUNDO keeps the Recycle Bin as the net.
            // WANTNUKEWARNING deliberately overrides NOCONFIRMATION for the one
            // case that is not a recycle at all: a network share, a stick with
            // no bin, or a file over the bin's size limit deletes for good.
            // Alcove's menu says "Delete" and its docs promise the Recycle Bin,
            // so that prompt is the user's only warning.
            fFlags: (FOF_ALLOWUNDO.0 | FOF_NOCONFIRMATION.0 | FOF_WANTNUKEWARNING.0 | FOF_SILENT.0)
                as u16,
            fAnyOperationsAborted: windows::core::BOOL(0),
            hNameMappings: std::ptr::null_mut(),
            lpszProgressTitle: PCWSTR::null(),
        };
        let code = unsafe { SHFileOperationW(&mut op) };
        invalidate_icon_cache();
        if code != 0 && !op.fAnyOperationsAborted.as_bool() {
            return Err(format!("could not delete ({code})"));
        }
        Ok(())
    }

    pub fn desktop_background(max_w: u32, max_h: u32) -> Result<super::DesktopBackground, String> {
        Ok(super::DesktopBackground {
            color: desktop_color(),
            image_url: wallpaper_data_url(max_w, max_h),
        })
    }

    fn desktop_color() -> String {
        use windows::Win32::Graphics::Gdi::{GetSysColor, COLOR_BACKGROUND};
        let color = unsafe { GetSysColor(COLOR_BACKGROUND) };
        let r = color & 0xFF;
        let g = (color >> 8) & 0xFF;
        let b = (color >> 16) & 0xFF;
        format!("#{r:02X}{g:02X}{b:02X}")
    }

    fn wallpaper_data_url(max_w: u32, max_h: u32) -> Option<String> {
        let path = wallpaper_path()?;
        let meta = std::fs::metadata(&path).ok()?;
        // File size is only a DoS guard. A 3 MB JPEG can still be 60 megapixels;
        // the WebView must never see those pixels.
        if meta.len() == 0 || meta.len() > 32_000_000 {
            return None;
        }
        let (max_w, max_h) = clamp_desk(max_w, max_h);
        let img = image::open(&path).ok()?;
        let (tw, th) = super::fit_cover(img.width(), img.height(), max_w, max_h);
        let rgb = if img.width() != tw || img.height() != th {
            img.resize_exact(tw, th, image::imageops::FilterType::Triangle)
                .to_rgb8()
        } else {
            img.to_rgb8()
        };
        let mut out = Vec::new();
        let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 82);
        encoder
            .encode(
                rgb.as_raw(),
                rgb.width(),
                rgb.height(),
                image::ExtendedColorType::Rgb8,
            )
            .ok()?;
        Some(format!(
            "data:image/jpeg;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(out)
        ))
    }

    fn clamp_desk(width: u32, height: u32) -> (u32, u32) {
        (
            if width == 0 { 1920 } else { width.clamp(320, 3840) },
            if height == 0 { 1080 } else { height.clamp(240, 2160) },
        )
    }

    fn wallpaper_path() -> Option<std::path::PathBuf> {
        use windows::Win32::UI::WindowsAndMessaging::{
            SystemParametersInfoW, SPI_GETDESKWALLPAPER,
        };
        let mut buf = [0u16; 2048];
        let ok = unsafe {
            SystemParametersInfoW(
                SPI_GETDESKWALLPAPER,
                buf.len() as u32,
                Some(buf.as_mut_ptr() as *mut core::ffi::c_void),
                Default::default(),
            )
        };
        if ok.is_ok() {
            let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
            let text = String::from_utf16_lossy(&buf[..end]);
            if !text.is_empty() {
                let path = std::path::PathBuf::from(text);
                if path.is_file() {
                    return Some(path);
                }
            }
        }
        let local = std::env::var_os("LOCALAPPDATA")?;
        let transcoded = std::path::PathBuf::from(local)
            .join("Microsoft")
            .join("Windows")
            .join("Themes")
            .join("TranscodedWallpaper");
        transcoded.is_file().then_some(transcoded)
    }

    unsafe fn hbitmap_to_png(hbmp: HBITMAP, min_edge: u32, raw: bool) -> Result<Vec<u8>, String> {
        let mut bm = BITMAP::default();
        if GetObjectW(
            HGDIOBJ(hbmp.0),
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bm as *mut BITMAP as *mut core::ffi::c_void),
        ) == 0
        {
            return Err("could not read icon bitmap".into());
        }
        let width = bm.bmWidth;
        let height = bm.bmHeight.abs();
        if width <= 0 || height <= 0 {
            return Err("empty icon".into());
        }
        let hdc = GetDC(None);
        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut bgra = vec![0u8; (width * height * 4) as usize];
        let rows = GetDIBits(
            hdc,
            hbmp,
            0,
            height as u32,
            Some(bgra.as_mut_ptr() as *mut core::ffi::c_void),
            &mut info,
            DIB_RGB_COLORS,
        );
        let _ = ReleaseDC(None, hdc);
        if rows == 0 {
            return Err("could not copy icon pixels".into());
        }
        let mut rgba = bgra_to_rgba(&bgra);
        if raw {
            // A thumbnail is opaque; GetDIBits often hands back an all-zero
            // alpha channel for one, which would read as fully transparent.
            for pixel in rgba.chunks_exact_mut(4) {
                pixel[3] = 255;
            }
            return encode_png(width as u32, height as u32, &rgba);
        }
        encode_icon_rgba(
            std::mem::take(&mut rgba),
            width as u32,
            height as u32,
            min_edge,
        )
    }

    fn bgra_to_rgba(bgra: &[u8]) -> Vec<u8> {
        let mut rgba = Vec::with_capacity(bgra.len());
        for pixel in bgra.chunks_exact(4) {
            rgba.extend_from_slice(&[pixel[2], pixel[1], pixel[0], pixel[3]]);
        }
        rgba
    }

    fn repair_alpha(rgba: &mut [u8]) {
        if !rgba.chunks_exact(4).all(|p| p[3] == 0) {
            return;
        }
        for pixel in rgba.chunks_exact_mut(4) {
            if pixel[0] != 0 || pixel[1] != 0 || pixel[2] != 0 {
                pixel[3] = 255;
            }
        }
    }

    fn encode_icon_rgba(
        mut rgba: Vec<u8>,
        width: u32,
        height: u32,
        min_edge: u32,
    ) -> Result<Vec<u8>, String> {
        repair_alpha(&mut rgba);
        let orig_w = width;
        let orig_h = height;
        let (width, height, rgba) = crop_to_opaque(&rgba, width, height);
        let ink = rgba.chunks_exact(4).filter(|p| p[3] > 40).count();
        if ink < 16 {
            return Err("blank icon".into());
        }
        if is_washed_out(&rgba) {
            return Err("washed-out icon".into());
        }
        let cropped_in = width * 2 < orig_w || height * 2 < orig_h;
        if min_edge > 0 && width.min(height) < min_edge && !cropped_in {
            return Err(format!("icon too small ({width}x{height})"));
        }
        encode_png(width, height, &rgba)
    }

    fn pixel_at(rgba: &[u8], width: u32, x: u32, y: u32) -> [u8; 4] {
        let i = ((y * width + x) * 4) as usize;
        [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]]
    }

    fn color_dist(a: [u8; 4], b: [u8; 4]) -> u32 {
        let dr = a[0] as i32 - b[0] as i32;
        let dg = a[1] as i32 - b[1] as i32;
        let db = a[2] as i32 - b[2] as i32;
        let da = a[3] as i32 - b[3] as i32;
        (dr * dr + dg * dg + db * db + da * da / 2) as u32
    }

    fn dominant_plate(rgba: &[u8], width: u32, height: u32) -> Option<[u8; 4]> {
        if width < 8 || height < 8 {
            return None;
        }
        let mut buckets: std::collections::HashMap<u16, (u32, [u32; 4])> =
            std::collections::HashMap::new();
        let mut opaque = 0u32;
        for pixel in rgba.chunks_exact(4) {
            if pixel[3] < 40 {
                continue;
            }
            opaque += 1;
            let key = (u16::from(pixel[0] >> 4) << 8)
                | (u16::from(pixel[1] >> 4) << 4)
                | u16::from(pixel[2] >> 4);
            let entry = buckets.entry(key).or_insert((0, [0; 4]));
            entry.0 += 1;
            entry.1[0] += u32::from(pixel[0]);
            entry.1[1] += u32::from(pixel[1]);
            entry.1[2] += u32::from(pixel[2]);
            entry.1[3] += u32::from(pixel[3]);
        }
        if opaque < 32 {
            return None;
        }
        let (count, sums) = buckets.into_values().max_by_key(|(count, _)| *count)?;
        if count * 100 / opaque < 40 {
            return None;
        }
        Some([
            (sums[0] / count) as u8,
            (sums[1] / count) as u8,
            (sums[2] / count) as u8,
            (sums[3] / count) as u8,
        ])
    }

    fn padding_swatch(rgba: &[u8], width: u32, height: u32) -> Option<[u8; 4]> {
        if width < 8 || height < 8 {
            return None;
        }
        let similar = |samples: [[u8; 4]; 4]| {
            let first = samples[0];
            let n = samples
                .iter()
                .filter(|sample| color_dist(**sample, first) < 400)
                .count();
            (n >= 3).then_some(first)
        };
        let outer = [
            pixel_at(rgba, width, 0, 0),
            pixel_at(rgba, width, width - 1, 0),
            pixel_at(rgba, width, 0, height - 1),
            pixel_at(rgba, width, width - 1, height - 1),
        ];
        if let Some(pad) = similar(outer) {
            if pad[3] >= 40 {
                return Some(pad);
            }
        }
        let inset = (width.min(height) / 8).max(3);
        let inner = [
            pixel_at(rgba, width, inset, inset),
            pixel_at(rgba, width, width - 1 - inset, inset),
            pixel_at(rgba, width, inset, height - 1 - inset),
            pixel_at(rgba, width, width - 1 - inset, height - 1 - inset),
        ];
        similar(inner).filter(|pad| pad[3] >= 40)
    }

    fn is_content_pixel(pixel: [u8; 4], pad: Option<[u8; 4]>) -> bool {
        if pixel[3] < 40 {
            return false;
        }
        match pad {
            Some(pad) if pad[3] >= 40 => color_dist(pixel, pad) > 900,
            _ => pixel[3] > 48,
        }
    }

    fn is_washed_out(rgba: &[u8]) -> bool {
        let mut n = 0u32;
        let mut luma = 0u64;
        let mut chroma = 0u64;
        for pixel in rgba.chunks_exact(4) {
            if pixel[3] < 40 {
                continue;
            }
            n += 1;
            let max = pixel[0].max(pixel[1]).max(pixel[2]) as u64;
            let min = pixel[0].min(pixel[1]).min(pixel[2]) as u64;
            luma += (pixel[0] as u64 + pixel[1] as u64 + pixel[2] as u64) / 3;
            chroma += max - min;
        }
        n >= 16 && luma / u64::from(n) > 210 && chroma / u64::from(n) < 18
    }

    fn crop_to_opaque(rgba: &[u8], width: u32, height: u32) -> (u32, u32, Vec<u8>) {
        if width == 0 || height == 0 || rgba.len() < 4 {
            return (width, height, rgba.to_vec());
        }
        let pad =
            dominant_plate(rgba, width, height).or_else(|| padding_swatch(rgba, width, height));
        let mut min_x = width;
        let mut min_y = height;
        let mut max_x = 0u32;
        let mut max_y = 0u32;
        for y in 0..height {
            for x in 0..width {
                if is_content_pixel(pixel_at(rgba, width, x, y), pad) {
                    min_x = min_x.min(x);
                    min_y = min_y.min(y);
                    max_x = max_x.max(x);
                    max_y = max_y.max(y);
                }
            }
        }
        if min_x > max_x {
            return (width, height, rgba.to_vec());
        }
        let margin = if pad.is_some() {
            1
        } else {
            ((max_x - min_x + 1).max(max_y - min_y + 1) / 16).max(2)
        };
        min_x = min_x.saturating_sub(margin);
        min_y = min_y.saturating_sub(margin);
        max_x = (max_x + margin).min(width - 1);
        max_y = (max_y + margin).min(height - 1);
        let crop_w = max_x - min_x + 1;
        let crop_h = max_y - min_y + 1;
        if crop_w * 8 > width * 7 && crop_h * 8 > height * 7 {
            return (width, height, rgba.to_vec());
        }
        let mut out = Vec::with_capacity((crop_w * crop_h * 4) as usize);
        for y in min_y..=max_y {
            let start = ((y * width + min_x) * 4) as usize;
            out.extend_from_slice(&rgba[start..start + (crop_w * 4) as usize]);
        }
        (crop_w, crop_h, out)
    }

    fn encode_png(width: u32, height: u32, rgba: &[u8]) -> Result<Vec<u8>, String> {
        let mut buf = Vec::new();
        let mut encoder = png::Encoder::new(&mut buf, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().map_err(|err| err.to_string())?;
        writer
            .write_image_data(rgba)
            .map_err(|err| err.to_string())?;
        writer.finish().map_err(|err| err.to_string())?;
        Ok(buf)
    }

    const FOLDER_LIST_CAP: usize = 400;

    pub fn list_folder(path: &str) -> Result<Vec<HarvestedIcon>, String> {
        let root = PathBuf::from(path.trim());
        if !root.is_dir() {
            return Err(format!("not a folder: {path}"));
        }
        let _com = ComGuard::new();
        let started = std::time::Instant::now();
        let result = list_folder_inner(&root);
        if let Ok(icons) = &result {
            log::info!(
                "listed {} items in {} ({}ms)",
                icons.len(),
                root.display(),
                started.elapsed().as_millis()
            );
        }
        result
    }

    fn list_folder_inner(root: &Path) -> Result<Vec<HarvestedIcon>, String> {
        let mut paths = Vec::new();
        collect_folder(root, &mut paths);
        // Cache the stat: a comparator that calls metadata() runs it O(n log n)
        // times, which is ~60k syscalls for a 5,000-file Downloads folder.
        paths.sort_by_cached_key(|path| {
            let modified = path.metadata().and_then(|meta| meta.modified()).ok();
            (
                std::cmp::Reverse(modified),
                path.file_name().map(|name| name.to_owned()),
            )
        });
        if paths.len() > FOLDER_LIST_CAP {
            log::warn!(
                "{} has {} items; showing the {} newest",
                root.display(),
                paths.len(),
                FOLDER_LIST_CAP
            );
            paths.truncate(FOLDER_LIST_CAP);
        }
        let jumbo = jumbo_list().ok();
        let mut icons = Vec::new();
        for path in paths {
            let ext = path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.to_ascii_lowercase());
            let extract = path.is_dir()
                || matches!(
                    ext.as_deref(),
                    Some("lnk") | Some("url") | Some("exe") | Some("msc") | Some("ico")
                );
            if skip_dead_shortcut(&path) {
                continue;
            }
            match harvest_one(&path, jumbo.as_ref(), extract) {
                Ok(icon) => icons.push(icon),
                Err(err) => log::warn!("skip {}: {err}", path.display()),
            }
        }
        Ok(icons)
    }

    /// Ceilings for the launcher's "search inside my drawers" walk. A folder tree
    /// is unbounded and the user is holding a key down, so the walk stops at
    /// whichever ceiling it reaches first and answers with what it has. A partial
    /// answer in 600ms is worth more here than a complete one in twenty seconds.
    const DEEP_DEPTH: usize = 5;
    const DEEP_ENTRIES: usize = 40_000;
    const DEEP_BUDGET_MS: u128 = 600;

    /// Never worth walking from a launcher: either machine noise, or a tree so
    /// deep it would eat the whole budget before reaching anything a person named.
    fn deep_skip(lower_name: &str) -> bool {
        // Only names that are unambiguously machine noise. `bin`, `obj` and
        // `target` are tempting to add and were left out on purpose: they are
        // also perfectly ordinary folder names, and silently refusing to search
        // someone's folder is worse than spending a few milliseconds in it.
        matches!(
            lower_name,
            "node_modules" | "$recycle.bin" | "system volume information" | "appdata" | "__pycache__"
        )
    }

    /// Breadth-first so shallow matches — the ones a person can picture — are
    /// found before the budget runs out, and so a single bottomless branch cannot
    /// starve its siblings.
    ///
    /// Best effort by design. It answers with what it had when a ceiling was
    /// reached, so on a large tree the same query can return slightly different
    /// rows twice. That is the price of answering while someone is still typing.
    pub fn search_folder(roots: &[String], query: &str, limit: usize) -> Vec<HarvestedIcon> {
        let terms: Vec<String> = query
            .split_whitespace()
            .map(|term| term.to_ascii_lowercase())
            .collect();
        if terms.is_empty() || limit == 0 {
            return Vec::new();
        }
        let started = std::time::Instant::now();
        let mut queue: std::collections::VecDeque<(PathBuf, usize)> = std::collections::VecDeque::new();
        let mut roots_seen = std::collections::HashSet::new();
        for root in roots {
            let path = PathBuf::from(root.trim());
            if path.is_dir() && roots_seen.insert(path.clone()) {
                queue.push_back((path, 0));
            }
        }
        let mut walked = 0usize;
        let mut hits: Vec<(usize, PathBuf)> = Vec::new();
        // Gather more than asked for, then rank — the first matches off a
        // breadth-first walk are the shallowest, not the most recent.
        let gather = limit.saturating_mul(4).max(limit);
        while let Some((dir, depth)) = queue.pop_front() {
            if walked >= DEEP_ENTRIES
                || hits.len() >= gather
                || started.elapsed().as_millis() >= DEEP_BUDGET_MS
            {
                break;
            }
            let mut children = Vec::new();
            collect_folder(&dir, &mut children);
            for path in children {
                walked += 1;
                let Some(name) = path.file_name().map(|raw| raw.to_string_lossy().to_ascii_lowercase())
                else {
                    continue;
                };
                if terms.iter().all(|term| name.contains(term.as_str())) {
                    hits.push((depth + 1, path.clone()));
                }
                if depth + 1 < DEEP_DEPTH && !deep_skip(&name) && path.is_dir() {
                    queue.push_back((path, depth + 1));
                }
            }
        }
        log::info!(
            "deep search {:?} walked {walked} found {} ({}ms)",
            query,
            hits.len(),
            started.elapsed().as_millis()
        );
        // Shallow first, then newest: "the invoice I saved last week" is much more
        // often wanted than a same-named file six folders down from 2019.
        hits.sort_by_cached_key(|(depth, path)| {
            let modified = path.metadata().and_then(|meta| meta.modified()).ok();
            (*depth, std::cmp::Reverse(modified), path.clone())
        });
        hits.truncate(limit);
        let _com = ComGuard::new();
        hits.into_iter()
            .filter_map(|(_, path)| {
                // No icon extraction: it is COM per file and this list is rebuilt on
                // every keystroke. The glyph fallback draws these rows instead.
                harvest_one(&path, None, false).ok()
            })
            .collect()
    }

    /// Opens the containing folder with the item already selected. Its own command
    /// rather than open_item_with, because that expands %VAR% in its arguments and
    /// a file named `100% done.txt` would come out mangled.
    pub fn reveal_item(path: &str) -> Result<(), String> {
        let target = PathBuf::from(path.trim());
        if target.as_os_str().is_empty() {
            return Err("empty path".into());
        }
        let file = HSTRING::from("explorer.exe");
        let args = HSTRING::from(format!("/select,\"{}\"", target.to_string_lossy()));
        let result = unsafe { shell_open(&file, Some(&args)) };
        if result.0 as isize <= 32 {
            return Err(format!("could not reveal {path}"));
        }
        Ok(())
    }

    pub fn known_folders() -> Vec<super::KnownFolder> {
        let _com = ComGuard::new();
        let mut out = Vec::new();
        push_known(&mut out, "downloads", "Downloads", &FOLDERID_Downloads);
        if let Some(path) = screenshot_folder() {
            out.push(super::KnownFolder {
                id: "screenshots".into(),
                name: "Screenshots".into(),
                path,
            });
        }
        push_known(&mut out, "documents", "Documents", &FOLDERID_Documents);
        push_known(&mut out, "pictures", "Pictures", &FOLDERID_Pictures);
        push_known(&mut out, "desktop", "Desktop", &FOLDERID_Desktop);
        out
    }

    fn push_known(
        out: &mut Vec<super::KnownFolder>,
        id: &str,
        name: &str,
        guid: &windows::core::GUID,
    ) {
        if let Ok(path) = known_folder(guid) {
            if path.is_dir() {
                out.push(super::KnownFolder {
                    id: id.into(),
                    name: name.into(),
                    path: path.to_string_lossy().into_owned(),
                });
            }
        }
    }

    fn screenshot_folder() -> Option<String> {
        if let Ok(path) = known_folder(&FOLDERID_Screenshots) {
            if path.is_dir() {
                return Some(path.to_string_lossy().into_owned());
            }
        }
        let pictures = known_folder(&FOLDERID_Pictures).ok()?;
        let fallback = pictures.join("Screenshots");
        fallback
            .is_dir()
            .then(|| fallback.to_string_lossy().into_owned())
    }

    pub fn pick_folder(_hwnd: isize) -> Result<Option<String>, String> {
        pick_via_helper(super::PICK_FOLDER_FLAG)
    }

    pub fn pick_folder_in_process() -> Result<Option<String>, String> {
        pick_folder_sta()
    }

    fn pick_folder_sta() -> Result<Option<String>, String> {
        use windows::core::Interface;
        use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
        use windows::Win32::System::Ole::{OleInitialize, OleUninitialize};
        use windows::Win32::UI::Shell::{
            FileOpenDialog, IFileDialog, IFileOpenDialog, IShellItem, FOS_FORCEFILESYSTEM,
            FOS_PICKFOLDERS, SIGDN_FILESYSPATH,
        };
        let _pause = super::pause_desktop_restore();
        let ole_ok = unsafe { OleInitialize(None) }.is_ok();
        log::info!("folder picker open");
        let result = (|| -> Result<Option<String>, String> {
            unsafe {
                let dialog: IFileOpenDialog =
                    CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)
                        .map_err(|err| err.to_string())?;
                let file_dialog: IFileDialog = dialog.cast().map_err(|err| err.to_string())?;
                let mut options = file_dialog.GetOptions().map_err(|err| err.to_string())?;
                options |= FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM;
                file_dialog
                    .SetOptions(options)
                    .map_err(|err| err.to_string())?;
                if !show_file_dialog(&dialog)? {
                    return Ok(None);
                }
                let item: IShellItem = file_dialog.GetResult().map_err(|err| err.to_string())?;
                let pwstr = item
                    .GetDisplayName(SIGDN_FILESYSPATH)
                    .map_err(|err| err.to_string())?;
                let path = pwstr.to_string().map_err(|err| err.to_string())?;
                CoTaskMemFree(Some(pwstr.0 as *const _ as *const std::ffi::c_void));
                Ok(Some(path))
            }
        })();
        if ole_ok {
            unsafe { OleUninitialize() };
        }
        log::info!(
            "folder picker closed: {}",
            match &result {
                Ok(Some(path)) => path.as_str(),
                Ok(None) => "cancelled",
                Err(_) => "error",
            }
        );
        result
    }

    /// Spawns a helper process. IFileOpenDialog::Show access-violates in
    /// comdlg32 inside the Alcove/WebView process, on any thread.
    pub fn pick_image(_hwnd: isize) -> Result<Option<String>, String> {
        pick_via_helper(super::PICK_IMAGE_FLAG)
    }

    pub fn pick_image_in_process() -> Result<Option<String>, String> {
        pick_image_sta()
    }

    fn pick_via_helper(flag: &str) -> Result<Option<String>, String> {
        let _pause = super::pause_desktop_restore();
        let exe = std::env::current_exe().map_err(|err| err.to_string())?;
        crate::crash::breadcrumb(&format!("picker: helper {exe:?} {flag}"));
        let output = std::process::Command::new(&exe)
            .arg(flag)
            .output()
            .map_err(|err| err.to_string())?;
        let stderr = String::from_utf8_lossy(&output.stderr);
        if !stderr.trim().is_empty() {
            log::info!("picker helper: {}", stderr.trim());
        }
        if !output.status.success() {
            return Err(if stderr.trim().is_empty() {
                format!("picture picker failed ({})", output.status)
            } else {
                stderr.trim().to_string()
            });
        }
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(if path.is_empty() { None } else { Some(path) })
    }

    fn pick_image_sta() -> Result<Option<String>, String> {
        use windows::core::Interface;
        use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
        use windows::Win32::System::Ole::{OleInitialize, OleUninitialize};
        use windows::Win32::UI::Shell::{
            FileOpenDialog, IFileDialog, IFileOpenDialog, IShellItem, FOS_FILEMUSTEXIST,
            FOS_FORCEFILESYSTEM, SIGDN_FILESYSPATH,
        };
        let _pause = super::pause_desktop_restore();
        let ole_ok = unsafe { OleInitialize(None) }.is_ok();
        log::info!("wallpaper picker open (helper)");
        let result = (|| -> Result<Option<String>, String> {
            unsafe {
                crate::crash::breadcrumb("wallpaper picker: CoCreateInstance");
                let dialog: IFileOpenDialog =
                    CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)
                        .map_err(|err| err.to_string())?;
                crate::crash::breadcrumb("wallpaper picker: SetFileTypes");
                let file_dialog: IFileDialog = dialog.cast().map_err(|err| err.to_string())?;
                file_dialog
                    .SetFileTypes(&picture_filters())
                    .map_err(|err| err.to_string())?;
                crate::crash::breadcrumb("wallpaper picker: SetOptions");
                let mut options = file_dialog.GetOptions().map_err(|err| err.to_string())?;
                options |= FOS_FORCEFILESYSTEM | FOS_FILEMUSTEXIST;
                file_dialog
                    .SetOptions(options)
                    .map_err(|err| err.to_string())?;
                crate::crash::breadcrumb("wallpaper picker: SetDefaultFolder");
                if let Ok(dir) = known_folder(&FOLDERID_Pictures) {
                    let hstring = HSTRING::from(dir.as_os_str());
                    if let Ok(item) =
                        SHCreateItemFromParsingName::<_, _, IShellItem>(&hstring, None)
                    {
                        let _ = file_dialog.SetDefaultFolder(&item);
                    }
                }
                crate::crash::breadcrumb("wallpaper picker: Show");
                if !show_file_dialog(&dialog)? {
                    return Ok(None);
                }
                crate::crash::breadcrumb("wallpaper picker: GetResult");
                let item: IShellItem = file_dialog.GetResult().map_err(|err| err.to_string())?;
                let pwstr = item
                    .GetDisplayName(SIGDN_FILESYSPATH)
                    .map_err(|err| err.to_string())?;
                let path = pwstr.to_string().map_err(|err| err.to_string())?;
                CoTaskMemFree(Some(pwstr.0 as *const _ as *const std::ffi::c_void));
                Ok(Some(path))
            }
        })();
        if ole_ok {
            unsafe { OleUninitialize() };
        }
        log::info!(
            "wallpaper picker closed: {}",
            match &result {
                Ok(Some(path)) => path.as_str(),
                Ok(None) => "cancelled",
                Err(_) => "error",
            }
        );
        result
    }

    fn picture_filters() -> [windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC; 1] {
        use windows::core::w;
        [windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC {
            pszName: w!("Pictures"),
            pszSpec: w!("*.jpg;*.jpeg;*.jfif;*.png;*.bmp;*.gif;*.tif;*.tiff;*.webp"),
        }]
    }

    fn show_file_dialog(
        dialog: &windows::Win32::UI::Shell::IFileOpenDialog,
    ) -> Result<bool, String> {
        use windows::core::Interface;
        use windows::Win32::UI::Shell::IModalWindow;
        let modal: IModalWindow = dialog.cast().map_err(|err| err.to_string())?;
        Ok(unsafe { modal.Show(None) }.is_ok())
    }

    /// The shell's own wallpaper object. Windows 8 and later; it handles the
    /// registry, the per-monitor cases and the refresh, which is why this does
    /// not touch SystemParametersInfo.
    fn wallpaper_api() -> Result<IDesktopWallpaper, String> {
        use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};
        unsafe { CoCreateInstance(&DesktopWallpaper, None, CLSCTX_ALL) }
            .map_err(|err| err.to_string())
    }

    /// Put a picture on the desktop, on every monitor.
    pub fn set_wallpaper(path: &str) -> Result<(), String> {
        let _pause = super::pause_desktop_restore();
        let file = expand_env_path(path);
        if !file.is_file() {
            return Err(format!("no such picture: {path}"));
        }
        let _com = ComGuard::new();
        let api = wallpaper_api()?;
        unsafe {
            // Enable first: a desktop showing a solid colour has the wallpaper
            // switched off, and setting a path alone would not bring it back.
            let _ = api.Enable(true);
            api.SetWallpaper(PCWSTR::null(), &HSTRING::from(file.as_os_str()))
                .map_err(|err| err.to_string())?;
        }
        log::info!("wallpaper set to {}", file.display());
        Ok(())
    }

    /// Clear the picture and leave a plain colour behind it. `rgb` is 0xRRGGBB.
    pub fn set_wallpaper_color(rgb: u32) -> Result<(), String> {
        use windows::core::w;
        use windows::Win32::Foundation::COLORREF;
        let _pause = super::pause_desktop_restore();
        let _com = ComGuard::new();
        let api = wallpaper_api()?;
        // COLORREF is 0x00BBGGRR, the other way round from CSS.
        let bgr = ((rgb & 0xFF) << 16) | (rgb & 0xFF00) | ((rgb >> 16) & 0xFF);
        unsafe {
            api.SetBackgroundColor(COLORREF(bgr))
                .map_err(|err| err.to_string())?;
            // Clear the path as well as disabling, or Windows puts the old
            // picture back the next time anything enables the wallpaper.
            let _ = api.SetWallpaper(PCWSTR::null(), w!(""));
            let _ = api.Enable(false);
        }
        log::info!("wallpaper cleared to #{rgb:06X}");
        Ok(())
    }

    pub fn open_item_with(path: &str, args: Option<&str>) -> Result<(), String> {
        let file = expand_env_path(path);
        let file_text = file.to_string_lossy();
        if file_text.is_empty() {
            return Err("empty path".into());
        }
        let file_h = HSTRING::from(file_text.as_ref());
        let args_text = args
            .filter(|value| !value.is_empty())
            .map(|value| expand_env_path(value).to_string_lossy().into_owned());
        let args_h = args_text
            .as_ref()
            .map(|value| HSTRING::from(value.as_str()));
        let result = unsafe { shell_open(&file_h, args_h.as_ref()) };
        if result.0 as isize <= 32 {
            return Err(format!("could not open {path}"));
        }
        Ok(())
    }

    unsafe fn shell_open(file: &HSTRING, params: Option<&HSTRING>) -> HINSTANCE {
        match params {
            Some(args) => ShellExecuteW(
                None,
                PCWSTR::null(),
                file,
                args,
                PCWSTR::null(),
                SW_SHOWNORMAL,
            ),
            None => ShellExecuteW(
                None,
                PCWSTR::null(),
                file,
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            ),
        }
    }

    #[cfg(test)]
    mod icon_crop_tests {
        use super::{crop_to_opaque, is_washed_out};

        fn fill(width: u32, height: u32, pixel: [u8; 4]) -> Vec<u8> {
            pixel
                .into_iter()
                .cycle()
                .take((width * height * 4) as usize)
                .collect()
        }

        fn put(buf: &mut [u8], width: u32, x: u32, y: u32, pixel: [u8; 4]) {
            let i = ((y * width + x) * 4) as usize;
            buf[i..i + 4].copy_from_slice(&pixel);
        }

        #[test]
        fn icon_target_splits_a_trailing_index() {
            use super::split_icon_index;
            assert_eq!(
                split_icon_index("%SystemRoot%\\System32\\mycomput.dll,2"),
                ("%SystemRoot%\\System32\\mycomput.dll", 2)
            );
            assert_eq!(
                split_icon_index("%SystemRoot%\\System32\\cmd.exe"),
                ("%SystemRoot%\\System32\\cmd.exe", 0)
            );
            // A comma that is part of the name, not an index.
            assert_eq!(
                split_icon_index("shell:::{ED7BA470-8E54-465E-825C-99712043E01C}"),
                ("shell:::{ED7BA470-8E54-465E-825C-99712043E01C}", 0)
            );
        }

        #[test]
        fn crop_strips_colored_start_tile() {
            let width = 32;
            let height = 32;
            let mut rgba = fill(width, height, [0, 0, 0, 0]);
            for y in 2..30 {
                for x in 2..30 {
                    put(&mut rgba, width, x, y, [0, 120, 215, 255]);
                }
            }
            for y in 12..20 {
                for x in 12..20 {
                    put(&mut rgba, width, x, y, [255, 255, 255, 255]);
                }
            }
            let (crop_w, crop_h, _) = crop_to_opaque(&rgba, width, height);
            assert!(crop_w < 16, "cropped width {crop_w}");
            assert!(crop_h < 16, "cropped height {crop_h}");
        }

        #[test]
        fn crop_strips_opaque_black_jumbo_padding() {
            let width = 32;
            let height = 32;
            let mut rgba = fill(width, height, [0, 0, 0, 255]);
            for y in 10..22 {
                for x in 10..22 {
                    put(&mut rgba, width, x, y, [48, 48, 52, 255]);
                }
            }
            let (crop_w, crop_h, _) = crop_to_opaque(&rgba, width, height);
            assert!(crop_w < 20, "cropped width {crop_w}");
            assert!(crop_h < 20, "cropped height {crop_h}");
        }

        #[test]
        fn white_document_is_washed_out() {
            let rgba = fill(16, 16, [245, 245, 245, 255]);
            assert!(is_washed_out(&rgba));
        }

        #[test]
        fn red_logo_is_not_washed_out() {
            let mut rgba = fill(16, 16, [0, 0, 0, 0]);
            for y in 4..12 {
                for x in 4..12 {
                    put(&mut rgba, 16, x, y, [226, 45, 64, 255]);
                }
            }
            assert!(!is_washed_out(&rgba));
        }

        #[test]
        fn problem_desktop_shortcuts_have_real_icons() {
            use super::{
                is_washed_out, known_folder, shortcut_target_is_missing, CoInitializeEx,
                CoUninitialize, FOLDERID_Desktop, COINIT_APARTMENTTHREADED,
            };
            unsafe {
                let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            }
            let Ok(desktop) = known_folder(&FOLDERID_Desktop) else {
                return;
            };
            let opera = desktop.join("Opera Browser.lnk");
            if opera.exists() {
                assert!(
                    shortcut_target_is_missing(&opera),
                    "Opera Browser.lnk should be treated as a dead shortcut"
                );
            }
            let claude = desktop.join("Claude.lnk");
            if claude.exists() {
                let aumid = super::app_user_model_id(&claude);
                let exe = aumid.as_ref().and_then(|id| super::packaged_app_exe(id));
                let png = super::extract_fresh(&claude, None).unwrap_or_else(|err| {
                    panic!("Claude icon (aumid={aumid:?} exe={exe:?}): {err}")
                });
                let decoder = png::Decoder::new(std::io::Cursor::new(&png));
                let mut reader = decoder.read_info().expect("Claude png");
                let mut buf = vec![0; reader.output_buffer_size()];
                let frame = reader.next_frame(&mut buf).expect("Claude frame");
                assert!(
                    frame.width.min(frame.height) >= 32,
                    "Claude is {}x{}",
                    frame.width,
                    frame.height
                );
                let rgba = &buf[..frame.buffer_size()];
                assert!(
                    !is_washed_out(rgba),
                    "Claude decoded to a washed-out bitmap"
                );
                let whites = rgba
                    .chunks_exact(4)
                    .filter(|pixel| {
                        pixel[3] > 40 && pixel[0] > 200 && pixel[1] > 200 && pixel[2] > 200
                    })
                    .count();
                assert!(whites > 50, "Claude glyph has no light pixels ({whites})");
            }
            unsafe {
                CoUninitialize();
            }
        }
    }

    #[cfg(test)]
    mod picker_tests {
        #[test]
        fn helper_picker_flag_is_distinct() {
            assert_eq!(super::super::PICK_IMAGE_FLAG, "--alcove-pick-image");
            assert_ne!(
                super::super::PICK_IMAGE_FLAG,
                super::super::PICK_FOLDER_FLAG
            );
        }

        #[test]
        fn picture_dialog_accepts_the_filter() {
            use super::picture_filters;
            use windows::core::Interface;
            use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
            use windows::Win32::System::Ole::{OleInitialize, OleUninitialize};
            use windows::Win32::UI::Shell::{FileOpenDialog, IFileDialog, IFileOpenDialog};
            let ole_ok = unsafe { OleInitialize(None) }.is_ok();
            let result = (|| -> Result<(), String> {
                unsafe {
                    let dialog: IFileOpenDialog =
                        CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)
                            .map_err(|err| err.to_string())?;
                    let file_dialog: IFileDialog = dialog.cast().map_err(|err| err.to_string())?;
                    file_dialog
                        .SetFileTypes(&picture_filters())
                        .map_err(|err| err.to_string())?;
                }
                Ok(())
            })();
            if ole_ok {
                unsafe { OleUninitialize() };
            }
            result.expect("file dialog should accept the picture filter");
        }
    }
}

#[cfg(not(windows))]
mod win {
    use super::HarvestedIcon;

    pub fn list_icons() -> Result<Vec<HarvestedIcon>, String> {
        Err("desktop harvest is Windows-only".into())
    }

    pub fn list_folder(_path: &str) -> Result<Vec<HarvestedIcon>, String> {
        Err("folder listing is Windows-only".into())
    }

    pub fn search_folder(_roots: &[String], _query: &str, _limit: usize) -> Vec<HarvestedIcon> {
        Vec::new()
    }

    pub fn reveal_item(_path: &str) -> Result<(), String> {
        Err("reveal is Windows-only".into())
    }

    pub fn known_folders() -> Vec<super::KnownFolder> {
        Vec::new()
    }

    pub fn pick_folder(_hwnd: isize) -> Result<Option<String>, String> {
        Err("folder picker is Windows-only".into())
    }

    pub fn open_item_with(_path: &str, _args: Option<&str>) -> Result<(), String> {
        Err("open is Windows-only".into())
    }

    pub fn shell_icon(_target: &str) -> Result<String, String> {
        Err("icons are Windows-only".into())
    }

    pub fn icon_data_url(_path: &std::path::Path) -> Result<String, String> {
        Err("icons are Windows-only".into())
    }

    pub fn thumb_data_url(_path: &std::path::Path) -> Result<Option<String>, String> {
        Ok(None)
    }

    pub fn recycle_bin() -> Result<super::RecycleBin, String> {
        Err("recycle bin is Windows-only".into())
    }

    pub fn desktop_background(_max_w: u32, _max_h: u32) -> Result<super::DesktopBackground, String> {
        Ok(super::DesktopBackground {
            color: "#191919".into(),
            image_url: None,
        })
    }

    pub fn popup_recycle_bin_menu(_hwnd: isize, _x: i32, _y: i32) -> Result<(), String> {
        Err("recycle bin menu is Windows-only".into())
    }

    pub fn empty_recycle_bin() -> Result<(), String> {
        Err("recycle bin is Windows-only".into())
    }

    pub fn recycle_bin_properties() -> Result<(), String> {
        Err("recycle bin is Windows-only".into())
    }

    pub fn paste_into(_hwnd: isize, _dest: Option<&str>) -> Result<(), String> {
        Err("paste is Windows-only".into())
    }

    pub fn recycle_paths(_hwnd: isize, _paths: &[String]) -> Result<(), String> {
        Err("delete is Windows-only".into())
    }

    pub fn desktop_dirs() -> Vec<std::path::PathBuf> {
        Vec::new()
    }

    pub fn pick_image(_hwnd: isize) -> Result<Option<String>, String> {
        Err("picture picker is Windows-only".into())
    }

    pub fn set_wallpaper(_path: &str) -> Result<(), String> {
        Err("wallpaper is Windows-only".into())
    }

    pub fn set_wallpaper_color(_rgb: u32) -> Result<(), String> {
        Err("wallpaper is Windows-only".into())
    }

    pub fn forget_icons() {}
}

pub fn list_icons() -> Result<Vec<HarvestedIcon>, String> {
    win::list_icons()
}

pub fn desktop_dirs() -> Vec<std::path::PathBuf> {
    win::desktop_dirs()
}

pub fn forget_icons() {
    win::forget_icons()
}

pub fn list_folder(path: &str) -> Result<Vec<HarvestedIcon>, String> {
    win::list_folder(path)
}

pub fn search_folder(roots: &[String], query: &str, limit: usize) -> Vec<HarvestedIcon> {
    win::search_folder(roots, query, limit)
}

pub fn reveal_item(path: &str) -> Result<(), String> {
    win::reveal_item(path)
}

pub fn known_folders() -> Vec<KnownFolder> {
    win::known_folders()
}

pub fn pick_folder(hwnd: isize) -> Result<Option<String>, String> {
    win::pick_folder(hwnd)
}

pub fn pick_image(hwnd: isize) -> Result<Option<String>, String> {
    win::pick_image(hwnd)
}

pub fn set_wallpaper(path: &str) -> Result<(), String> {
    win::set_wallpaper(path)
}

pub fn set_wallpaper_color(rgb: u32) -> Result<(), String> {
    win::set_wallpaper_color(rgb)
}

pub fn open_item_with(path: &str, args: Option<&str>) -> Result<(), String> {
    win::open_item_with(path, args)
}

pub fn shell_icon(target: &str) -> Result<String, String> {
    win::shell_icon(target)
}

pub fn icon_data_url(path: &std::path::Path) -> Result<String, String> {
    win::icon_data_url(path)
}

pub fn thumb_data_url(path: &std::path::Path) -> Result<Option<String>, String> {
    win::thumb_data_url(path)
}

pub fn recycle_bin() -> Result<RecycleBin, String> {
    win::recycle_bin()
}

pub fn desktop_background(max_w: u32, max_h: u32) -> Result<DesktopBackground, String> {
    win::desktop_background(max_w, max_h)
}

pub fn popup_recycle_bin_menu(hwnd: isize, x: i32, y: i32) -> Result<(), String> {
    win::popup_recycle_bin_menu(hwnd, x, y)
}

pub fn empty_recycle_bin() -> Result<(), String> {
    win::empty_recycle_bin()
}

pub fn recycle_bin_properties() -> Result<(), String> {
    win::recycle_bin_properties()
}

pub fn paste_into(hwnd: isize, dest: Option<&str>) -> Result<(), String> {
    win::paste_into(hwnd, dest)
}

pub fn recycle_paths(hwnd: isize, paths: &[String]) -> Result<(), String> {
    win::recycle_paths(hwnd, paths)
}

#[cfg(test)]
mod fit_cover_tests {
    use super::fit_cover;

    #[test]
    fn huge_photo_covers_this_desk() {
        assert_eq!(fit_cover(9504, 6336, 1920, 1040), (1920, 1280));
    }

    #[test]
    fn already_small_stays() {
        assert_eq!(fit_cover(800, 600, 1920, 1080), (800, 600));
    }

    #[test]
    fn exact_match() {
        assert_eq!(fit_cover(1920, 1080, 1920, 1080), (1920, 1080));
    }

    #[test]
    fn portrait_does_not_upscale() {
        assert_eq!(fit_cover(1080, 1920, 1920, 1080), (1080, 1920));
    }
}
