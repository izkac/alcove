use serde::Serialize;

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

#[cfg(windows)]
mod win {
    use super::HarvestedIcon;
    use std::os::windows::ffi::OsStrExt;
    use std::path::{Path, PathBuf};

    use base64::Engine;
    use windows::core::{HSTRING, PCWSTR, PWSTR};
    use windows::Win32::Foundation::SIZE;
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, GetDIBits,
        GetObjectW, ReleaseDC, SelectObject, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
        DIB_RGB_COLORS, HBITMAP, HGDIOBJ,
    };
    use windows::Win32::System::Com::{
        CoInitializeEx, CoTaskMemFree, CoUninitialize, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Controls::IImageList;
    use windows::Win32::UI::Shell::{
        SHCreateItemFromParsingName, SHGetFileInfoW, SHGetKnownFolderPath, SHGetStockIconInfo,
        ExtractIconExW, SHDefExtractIconW, ShellExecuteW, FOLDERID_Desktop, FOLDERID_Documents,
        FOLDERID_Downloads, FOLDERID_Pictures, FOLDERID_PublicDesktop, FOLDERID_Screenshots,
        IShellItemImageFactory, KF_FLAG_DEFAULT, SHFILEINFOW, SHGFI_DISPLAYNAME, SHGFI_SYSICONINDEX,
        SHGSI_SYSICONINDEX, SHSTOCKICONINFO, SIID_RECYCLER, SIID_RECYCLERFULL, SIIGBF_BIGGERSIZEOK,
        SIIGBF_ICONONLY, SHIL_EXTRALARGE, SHIL_JUMBO,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreatePopupMenu, DestroyIcon, DestroyMenu, DrawIconEx, GetIconInfo, TrackPopupMenu,
        DI_NORMAL, ICONINFO, SW_SHOWNORMAL, TPM_LEFTALIGN, TPM_RETURNCMD, TPM_RIGHTBUTTON,
    };

    pub fn list_icons() -> Result<Vec<HarvestedIcon>, String> {
        let mut cache = harvest_memo()
            .lock()
            .map_err(|err| err.to_string())?;
        if let Some(icons) = cache.as_ref() {
            return Ok(icons.clone());
        }
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }
        let started = std::time::Instant::now();
        let result = list_icons_inner();
        unsafe {
            CoUninitialize();
        }
        if let Ok(icons) = &result {
            log::info!(
                "harvested {} desktop icons in {}ms",
                icons.len(),
                started.elapsed().as_millis()
            );
            *cache = Some(icons.clone());
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
            match harvest_one(&path, jumbo.as_ref(), true) {
                Ok(icon) => icons.push(icon),
                Err(err) => log::warn!("skip {}: {err}", path.display()),
            }
        }
        Ok(icons)
    }

    fn known_folder(id: &windows::core::GUID) -> Result<PathBuf, String> {
        unsafe {
            let pwstr: PWSTR = SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None)
                    .map_err(|err| err.to_string())?;
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
            {
                continue;
            }
            out.push(path);
        }
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
        let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
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
            Some("png") | Some("jpg") | Some("jpeg") | Some("gif") | Some("webp") | Some("bmp")
            | Some("tif") | Some("tiff") | Some("heic") => ("image", "photos"),
            _ => ("document", "documents"),
        }
    }

    // Ask Windows for a 256px resource. Encode at most 128px, and never stretch a
    // smaller HICON up to that size (that was the blurry-tile bug).
    const ICON_PX: i32 = 128;
    const EXTRACT_PX: i32 = 256;
    const MIN_ICON_EDGE: u32 = 40;
    const CACHE_TAG: &str = "q3";

    fn harvest_memo() -> &'static std::sync::Mutex<Option<Vec<HarvestedIcon>>> {
        static CACHE: std::sync::OnceLock<std::sync::Mutex<Option<Vec<HarvestedIcon>>>> =
            std::sync::OnceLock::new();
        CACHE.get_or_init(|| std::sync::Mutex::new(None))
    }

    fn jumbo_list() -> Result<IImageList, String> {
        use windows::Win32::UI::Shell::SHGetImageList;
        unsafe { SHGetImageList(SHIL_JUMBO as i32) }.map_err(|err| err.to_string())
    }

    pub fn icon_data_url(path: &Path) -> Result<String, String> {
        let png = icon_png(path, None)?;
        Ok(format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(png)
        ))
    }

    fn icon_png(path: &Path, jumbo: Option<&IImageList>) -> Result<Vec<u8>, String> {
        if let Some(cached) = read_icon_cache(path) {
            return Ok(cached);
        }
        let png = extract_fresh(path, jumbo)?;
        write_icon_cache(path, &png);
        Ok(png)
    }

    fn extract_fresh(path: &Path, jumbo: Option<&IImageList>) -> Result<Vec<u8>, String> {
        for (file, index) in extract_targets(path) {
            if let Ok(png) = private_extract_png(&file, index, EXTRACT_PX, MIN_ICON_EDGE) {
                return Ok(png);
            }
        }
        if let Ok(png) = imagelist_png(path, jumbo, SHIL_JUMBO as i32, MIN_ICON_EDGE) {
            return Ok(png);
        }
        if let Ok(png) = imagelist_png(path, None, SHIL_EXTRALARGE as i32, 32) {
            return Ok(png);
        }
        if let Ok(png) = shell_item_png(&path.to_string_lossy(), EXTRACT_PX, MIN_ICON_EDGE) {
            return Ok(png);
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
        let dir = std::path::PathBuf::from(base).join("alcove").join("icon-cache");
        std::fs::create_dir_all(&dir).ok()?;
        Some(dir)
    }

    fn icon_cache_path(path: &Path) -> Option<std::path::PathBuf> {
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
            "{hash:016x}-{mtime}-{}-{ICON_PX}-{CACHE_TAG}.png",
            meta.len()
        )))
    }

    fn read_icon_cache(path: &Path) -> Option<Vec<u8>> {
        let file = icon_cache_path(path)?;
        let bytes = std::fs::read(file).ok()?;
        (bytes.len() > 32).then_some(bytes)
    }

    fn write_icon_cache(path: &Path, png: &[u8]) {
        let Some(file) = icon_cache_path(path) else {
            return;
        };
        let _ = std::fs::write(file, png);
    }

    fn wide_path(path: &Path) -> Vec<u16> {
        path.as_os_str().encode_wide().chain(std::iter::once(0)).collect()
    }

    fn extract_targets(path: &Path) -> Vec<(PathBuf, i32)> {
        let mut out = Vec::new();
        let is_lnk = path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("lnk"));
        if is_lnk {
            out.extend(shortcut_icon_files(path));
        }
        out.push((path.to_path_buf(), 0));
        out
    }

    fn shortcut_icon_files(path: &Path) -> Vec<(PathBuf, i32)> {
        use windows::core::Interface;
        use windows::Win32::System::Com::{
            CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER, STGM_READ,
        };
        use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};
        let link: IShellLinkW = match unsafe {
            CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
        } {
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
            let file = expand_env_path(&utf16_z(&icon_path));
            if !file.as_os_str().is_empty() {
                out.push((file, icon_index));
            }
        }
        let mut target = [0u16; 260];
        if unsafe { link.GetPath(&mut target, std::ptr::null_mut(), 0) }.is_ok() {
            let file = expand_env_path(&utf16_z(&target));
            if !file.as_os_str().is_empty()
                && !out.iter().any(|(existing, _)| existing == &file)
            {
                out.push((file, 0));
            }
        }
        out
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
        let count = unsafe {
            ExtractIconExW(PCWSTR(wide.as_ptr()), index, Some(&mut large), None, 1)
        };
        if count == 0 || large.0.is_null() {
            return Err("ExtractIconEx found nothing".into());
        }
        let png = unsafe { hicon_to_png(large, min_edge) };
        unsafe {
            let _ = DestroyIcon(large);
        }
        png
    }

    fn shell_item_png(parsing: &str, size: i32, min_edge: u32) -> Result<Vec<u8>, String> {
        let hstring = HSTRING::from(parsing);
        let factory: IShellItemImageFactory =
            unsafe { SHCreateItemFromParsingName(&hstring, None) }
                .map_err(|err| err.to_string())?;
        let hbmp = unsafe {
            factory.GetImage(
                SIZE { cx: size, cy: size },
                SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK,
            )
        }
        .map_err(|err| err.to_string())?;
        let png = unsafe { hbitmap_to_png(hbmp, min_edge) };
        unsafe {
            let _ = DeleteObject(HGDIOBJ(hbmp.0));
        }
        png
    }

    fn shell_display_name(parsing: &str) -> Option<String> {
        use windows::Win32::UI::Shell::{IShellItem, SIGDN_NORMALDISPLAY};
        let hstring = HSTRING::from(parsing);
        let item: IShellItem =
            unsafe { SHCreateItemFromParsingName(&hstring, None) }.ok()?;
        let pwstr = unsafe { item.GetDisplayName(SIGDN_NORMALDISPLAY) }.ok()?;
        let name = unsafe { pwstr.to_string() }.ok();
        unsafe {
            CoTaskMemFree(Some(pwstr.0 as *const _ as *const std::ffi::c_void));
        }
        name.filter(|s| !s.is_empty())
    }

    pub fn recycle_bin() -> Result<super::RecycleBin, String> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }
        let result = recycle_bin_inner();
        unsafe {
            CoUninitialize();
        }
        result
    }

    fn recycle_bin_inner() -> Result<super::RecycleBin, String> {
        const PARSING: &str = "shell:RecycleBinFolder";
        let png = recycle_bin_png().or_else(|_| shell_item_png(PARSING, EXTRACT_PX, 0))?;
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
            SHGetImageList, SHQUERYRBINFO, SHQueryRecycleBinW, SHIL_JUMBO,
        };
        let mut query = SHQUERYRBINFO {
            cbSize: std::mem::size_of::<SHQUERYRBINFO>() as u32,
            ..Default::default()
        };
        let full = unsafe { SHQueryRecycleBinW(None, &mut query) }
            .is_ok()
            && query.i64NumItems > 0;
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
            IContextMenu, IShellItem, BHID_SFUIObject, CMF_NORMAL, CMINVOKECOMMANDINFO,
        };
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }
        let result = (|| {
            let item: IShellItem = unsafe {
                SHCreateItemFromParsingName(&HSTRING::from("shell:RecycleBinFolder"), None)
            }
            .map_err(|err| err.to_string())?;
            let ctx: IContextMenu = unsafe { item.BindToHandler(None, &BHID_SFUIObject) }
                .map_err(|err| err.to_string())?;
            let menu = unsafe { CreatePopupMenu() }.map_err(|err| err.to_string())?;
            unsafe { ctx.QueryContextMenu(menu, 0, 1, 0x7FFF, CMF_NORMAL) }
                .ok()
                .map_err(|err| err.to_string())?;
            let owner = HWND(hwnd as *mut core::ffi::c_void);
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
                let mut invoke = CMINVOKECOMMANDINFO {
                    cbSize: std::mem::size_of::<CMINVOKECOMMANDINFO>() as u32,
                    hwnd: owner,
                    lpVerb: PCSTR((code as usize - 1) as *const u8),
                    nShow: SW_SHOWNORMAL.0 as i32,
                    ..Default::default()
                };
                unsafe { ctx.InvokeCommand(&mut invoke) }.map_err(|err| err.to_string())?;
            }
            unsafe {
                let _ = DestroyMenu(menu);
            }
            Ok(())
        })();
        unsafe {
            CoUninitialize();
        }
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

    pub fn desktop_background() -> Result<super::DesktopBackground, String> {
        Ok(super::DesktopBackground {
            color: desktop_color(),
            image_url: wallpaper_data_url(),
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

    fn wallpaper_data_url() -> Option<String> {
        let path = wallpaper_path()?;
        let meta = std::fs::metadata(&path).ok()?;
        if meta.len() == 0 || meta.len() > 8_000_000 {
            return None;
        }
        let bytes = std::fs::read(&path).ok()?;
        let mime = match path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_ascii_lowercase())
            .as_deref()
        {
            Some("png") => "image/png",
            Some("bmp") => "image/bmp",
            Some("gif") => "image/gif",
            Some("webp") => "image/webp",
            Some("tif") | Some("tiff") => "image/tiff",
            Some("jpg") | Some("jpeg") | Some("jfif") => "image/jpeg",
            _ => "image/jpeg",
        };
        Some(format!(
            "data:{mime};base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        ))
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

    unsafe fn hbitmap_to_png(hbmp: HBITMAP, min_edge: u32) -> Result<Vec<u8>, String> {
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
        encode_icon_rgba(std::mem::take(&mut rgba), width as u32, height as u32, min_edge)
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
        let (width, height, rgba) = crop_to_opaque(&rgba, width, height);
        let ink = rgba.chunks_exact(4).filter(|p| p[3] > 40).count();
        if ink < 16 {
            return Err("blank icon".into());
        }
        if min_edge > 0 && width.min(height) < min_edge {
            return Err(format!("icon too small ({width}x{height})"));
        }
        encode_png(width, height, &rgba)
    }

    fn crop_to_opaque(rgba: &[u8], width: u32, height: u32) -> (u32, u32, Vec<u8>) {
        if width == 0 || height == 0 || rgba.len() < 4 {
            return (width, height, rgba.to_vec());
        }
        let alpha = |x: u32, y: u32| rgba[((y * width + x) * 4 + 3) as usize];
        let mut min_x = width;
        let mut min_y = height;
        let mut max_x = 0u32;
        let mut max_y = 0u32;
        for y in 0..height {
            for x in 0..width {
                if alpha(x, y) > 48 {
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
        let pad = ((max_x - min_x + 1).max(max_y - min_y + 1) / 16).max(2);
        min_x = min_x.saturating_sub(pad);
        min_y = min_y.saturating_sub(pad);
        max_x = (max_x + pad).min(width - 1);
        max_y = (max_y + pad).min(height - 1);
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
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }
        let started = std::time::Instant::now();
        let result = list_folder_inner(&root);
        unsafe {
            CoUninitialize();
        }
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
        paths.sort_by(|a, b| {
            let ma = a.metadata().and_then(|meta| meta.modified()).ok();
            let mb = b.metadata().and_then(|meta| meta.modified()).ok();
            mb.cmp(&ma).then_with(|| a.file_name().cmp(&b.file_name()))
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
            match harvest_one(&path, jumbo.as_ref(), extract) {
                Ok(icon) => icons.push(icon),
                Err(err) => log::warn!("skip {}: {err}", path.display()),
            }
        }
        Ok(icons)
    }

    pub fn known_folders() -> Vec<super::KnownFolder> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }
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
        unsafe {
            CoUninitialize();
        }
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

    pub fn pick_folder(hwnd: isize) -> Result<Option<String>, String> {
        use windows::core::Interface;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::System::Com::{
            CoCreateInstance, CLSCTX_INPROC_SERVER,
        };
        use windows::Win32::UI::Shell::{
            FileOpenDialog, IFileDialog, IFileOpenDialog, IModalWindow, IShellItem,
            FOS_FORCEFILESYSTEM, FOS_PICKFOLDERS, SIGDN_FILESYSPATH,
        };
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }
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
                let owner = HWND(hwnd as *mut core::ffi::c_void);
                let modal: IModalWindow = dialog.cast().map_err(|err| err.to_string())?;
                if modal.Show(Some(owner)).is_err() {
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
        unsafe {
            CoUninitialize();
        }
        result
    }

    pub fn open_item(path: &str) -> Result<(), String> {
        let hstring = HSTRING::from(path);
        let result = unsafe {
            ShellExecuteW(
                None,
                PCWSTR::null(),
                &hstring,
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };
        if result.0 as isize <= 32 {
            return Err(format!("could not open {path}"));
        }
        Ok(())
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

    pub fn known_folders() -> Vec<super::KnownFolder> {
        Vec::new()
    }

    pub fn pick_folder(_hwnd: isize) -> Result<Option<String>, String> {
        Err("folder picker is Windows-only".into())
    }

    pub fn open_item(_path: &str) -> Result<(), String> {
        Err("open is Windows-only".into())
    }

    pub fn icon_data_url(_path: &std::path::Path) -> Result<String, String> {
        Err("icons are Windows-only".into())
    }

    pub fn recycle_bin() -> Result<super::RecycleBin, String> {
        Err("recycle bin is Windows-only".into())
    }

    pub fn desktop_background() -> Result<super::DesktopBackground, String> {
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
}

pub fn list_icons() -> Result<Vec<HarvestedIcon>, String> {
    win::list_icons()
}

pub fn list_folder(path: &str) -> Result<Vec<HarvestedIcon>, String> {
    win::list_folder(path)
}

pub fn known_folders() -> Vec<KnownFolder> {
    win::known_folders()
}

pub fn pick_folder(hwnd: isize) -> Result<Option<String>, String> {
    win::pick_folder(hwnd)
}

pub fn open_item(path: &str) -> Result<(), String> {
    win::open_item(path)
}

pub fn icon_data_url(path: &std::path::Path) -> Result<String, String> {
    win::icon_data_url(path)
}

pub fn recycle_bin() -> Result<RecycleBin, String> {
    win::recycle_bin()
}

pub fn desktop_background() -> Result<DesktopBackground, String> {
    win::desktop_background()
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
