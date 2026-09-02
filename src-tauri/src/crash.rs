//! Last-breath crash log. An access violation never reaches a Rust panic hook,
//! so Windows unhandled-exception is the only stack we can keep.

use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn install() {
    std::panic::set_hook(Box::new(|info| {
        let loc = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "unknown".into());
        let msg = info
            .payload()
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| info.payload().downcast_ref::<String>().map(|s| s.as_str()))
            .unwrap_or("Box<dyn Any>");
        breadcrumb(&format!("panic at {loc}: {msg}"));
        breadcrumb(&format!("{}", std::backtrace::Backtrace::force_capture()));
    }));
    #[cfg(windows)]
    win::install();
}

/// Write one line to the log file and stderr, flushed, before the next call
/// that might kill the process.
pub fn breadcrumb(msg: &str) {
    let line = format!("[{}][alcove_lib::crash][ERROR] {msg}\n", stamp());
    let mut err = std::io::stderr();
    let _ = err.write_all(line.as_bytes());
    let _ = err.flush();
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path())
    {
        let _ = file.write_all(line.as_bytes());
        let _ = file.flush();
    }
    log::error!("{msg}");
    log::logger().flush();
}

fn stamp() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("unix={secs}")
}

fn log_path() -> PathBuf {
    let mut dir = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    dir.push("com.alcove.desktop");
    dir.push("logs");
    let _ = std::fs::create_dir_all(&dir);
    dir.push("Alcove.log");
    dir
}

#[cfg(windows)]
mod win {
    use super::log_path;
    use std::ffi::c_void;
    use std::io::Write;
    use std::path::Path;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{HMODULE, STATUS_ACCESS_VIOLATION};
    use windows::Win32::System::Diagnostics::Debug::{
        AddVectoredExceptionHandler, RtlCaptureStackBackTrace, SetUnhandledExceptionFilter,
        EXCEPTION_POINTERS,
    };
    use windows::Win32::System::LibraryLoader::{
        GetModuleFileNameW, GetModuleHandleExW, GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,
        GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
    };

    use std::sync::atomic::{AtomicBool, Ordering};

    static DUMPED: AtomicBool = AtomicBool::new(false);

    pub fn install() {
        unsafe {
            let _ = SetUnhandledExceptionFilter(Some(on_unhandled));
            let _ = AddVectoredExceptionHandler(1, Some(on_veh));
        }
    }

    unsafe extern "system" fn on_veh(info: *mut EXCEPTION_POINTERS) -> i32 {
        on_unhandled(info as *const EXCEPTION_POINTERS)
    }

    unsafe extern "system" fn on_unhandled(info: *const EXCEPTION_POINTERS) -> i32 {
        if info.is_null() {
            return 0;
        }
        let record = *(*info).ExceptionRecord;
        if record.ExceptionCode != STATUS_ACCESS_VIOLATION {
            return 0;
        }
        if DUMPED.swap(true, Ordering::SeqCst) {
            return 0;
        }
        let code = record.ExceptionCode.0 as u32;
        let addr = record.ExceptionAddress;
        let (module, offset) = module_offset(addr);
        write_raw(&format!(
            "\n=== ALCOVE CRASH STATUS_ACCESS_VIOLATION code=0x{code:08X} in {module}+0x{offset:X} ({addr:?}) ===\n"
        ));
        dump_stack();
        write_raw("=== end crash ===\n");
        0
    }

    fn dump_stack() {
        let mut frames: [*mut c_void; 32] = [std::ptr::null_mut(); 32];
        let n = unsafe { RtlCaptureStackBackTrace(0, &mut frames, None) };
        for (i, ptr) in frames.iter().take(n as usize).enumerate() {
            let (module, offset) = module_offset(*ptr);
            write_raw(&format!("  #{i:02} {module}+0x{offset:X} ({ptr:?})\n"));
        }
    }

    fn module_offset(addr: *mut c_void) -> (String, usize) {
        let mut module = HMODULE::default();
        let ok = unsafe {
            GetModuleHandleExW(
                GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS
                    | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                PCWSTR(addr as *const u16),
                &mut module,
            )
        };
        if ok.is_err() || module.0.is_null() {
            return ("unknown".into(), addr as usize);
        }
        let mut buf = [0u16; 260];
        let n = unsafe { GetModuleFileNameW(Some(module), &mut buf) };
        let path = String::from_utf16_lossy(&buf[..n as usize]);
        let name = Path::new(&path)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or(path);
        let base = module.0 as usize;
        let offset = (addr as usize).wrapping_sub(base);
        (name, offset)
    }

    fn write_raw(text: &str) {
        let mut err = std::io::stderr();
        let _ = err.write_all(text.as_bytes());
        let _ = err.flush();
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path())
        {
            let _ = file.write_all(text.as_bytes());
            let _ = file.flush();
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn breadcrumb_writes_without_panicking() {
        super::breadcrumb("crash-log self-test");
    }
}
