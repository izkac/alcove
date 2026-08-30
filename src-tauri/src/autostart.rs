//! Sign-in startup via HKCU\...\Run. The installer writes the same value;
//! Settings can turn it off. A marker file remembers an explicit opt-out
//! so an update does not put it back.

use std::path::PathBuf;

const VALUE_NAME: &str = "Alcove";
const RUN_SUBKEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

fn opt_out_path() -> PathBuf {
    let appdata = std::env::var_os("APPDATA").unwrap_or_default();
    PathBuf::from(appdata)
        .join("com.alcove.desktop")
        .join("autostart-off")
}

#[cfg(windows)]
mod win {
    use super::*;
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW,
        RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_QUERY_VALUE, KEY_SET_VALUE,
        REG_OPTION_NON_VOLATILE, REG_SZ,
    };
    #[cfg(not(debug_assertions))]
    use windows::core::w;
    #[cfg(not(debug_assertions))]
    use windows::Win32::Foundation::{ERROR_ALREADY_EXISTS, GetLastError};
    #[cfg(not(debug_assertions))]
    use windows::Win32::System::Threading::CreateMutexW;

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn exe_command() -> Result<String, String> {
        let path = std::env::current_exe().map_err(|err| err.to_string())?;
        Ok(format!("\"{}\"", path.display()))
    }

    fn open_run_key(write: bool) -> Result<HKEY, String> {
        let access = if write {
            KEY_QUERY_VALUE | KEY_SET_VALUE
        } else {
            KEY_QUERY_VALUE
        };
        let mut key = HKEY::default();
        let subkey = wide(RUN_SUBKEY);
        let status = unsafe {
            if write {
                RegCreateKeyExW(
                    HKEY_CURRENT_USER,
                    PCWSTR(subkey.as_ptr()),
                    None,
                    None,
                    REG_OPTION_NON_VOLATILE,
                    access,
                    None,
                    &mut key,
                    None,
                )
            } else {
                RegOpenKeyExW(
                    HKEY_CURRENT_USER,
                    PCWSTR(subkey.as_ptr()),
                    None,
                    access,
                    &mut key,
                )
            }
        };
        status.ok().map_err(|err| err.to_string())?;
        Ok(key)
    }

    pub fn is_enabled() -> bool {
        let Ok(key) = open_run_key(false) else {
            return false;
        };
        let mut kind = REG_SZ;
        let mut size = 0u32;
        let name = wide(VALUE_NAME);
        let status = unsafe {
            RegQueryValueExW(
                key,
                PCWSTR(name.as_ptr()),
                None,
                Some(&mut kind),
                None,
                Some(&mut size),
            )
        };
        unsafe {
            let _ = RegCloseKey(key);
        }
        status.is_ok()
    }

    pub fn enable() -> Result<(), String> {
        if cfg!(debug_assertions) {
            return Err("Start at sign-in is only for the installed app".into());
        }
        let command = exe_command()?;
        let key = open_run_key(true)?;
        let name = wide(VALUE_NAME);
        let data = wide(&command);
        let bytes = unsafe {
            std::slice::from_raw_parts(data.as_ptr() as *const u8, data.len() * 2)
        };
        let status =
            unsafe { RegSetValueExW(key, PCWSTR(name.as_ptr()), None, REG_SZ, Some(bytes)) };
        unsafe {
            let _ = RegCloseKey(key);
        }
        status.ok().map_err(|err| err.to_string())?;
        let _ = std::fs::remove_file(opt_out_path());
        Ok(())
    }

    pub fn disable() -> Result<(), String> {
        if let Some(parent) = opt_out_path().parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(opt_out_path(), b"1").map_err(|err| err.to_string())?;
        if let Ok(key) = open_run_key(true) {
            let name = wide(VALUE_NAME);
            unsafe {
                let _ = RegDeleteValueW(key, PCWSTR(name.as_ptr()));
                let _ = RegCloseKey(key);
            }
        }
        Ok(())
    }

    #[cfg(not(debug_assertions))]
    pub fn claim_singleton() -> bool {
        let Ok(handle) = (unsafe { CreateMutexW(None, true, w!("Local\\AlcoveDesktopSingleton")) })
        else {
            return true;
        };
        if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
            unsafe {
                let _ = windows::Win32::Foundation::CloseHandle(handle);
            }
            return false;
        }
        // HANDLE is Copy and does not close on drop; leaving it open keeps the mutex.
        let _ = handle;
        true
    }
}

#[cfg(not(windows))]
mod win {
    pub fn is_enabled() -> bool {
        false
    }
    pub fn enable() -> Result<(), String> {
        Err("sign-in start is Windows-only".into())
    }
    pub fn disable() -> Result<(), String> {
        Ok(())
    }
}

pub fn is_enabled() -> bool {
    win::is_enabled()
}

pub fn enable() -> Result<(), String> {
    win::enable()
}

pub fn disable() -> Result<(), String> {
    win::disable()
}

pub fn opted_out() -> bool {
    opt_out_path().is_file()
}

#[cfg(all(windows, not(debug_assertions)))]
pub fn claim_singleton() -> bool {
    win::claim_singleton()
}

/// First successful pin writes the Run key unless the user turned it off.
pub fn enable_unless_opted_out() {
    if opted_out() || is_enabled() {
        return;
    }
    let _ = enable();
}
