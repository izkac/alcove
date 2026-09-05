use std::io::Write;
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{Duration, Instant};
use tokio::sync::oneshot;

use tauri::{AppHandle, Manager};

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|err| err.to_string())
        .map(|dir| dir.join("desktop.json"))
}

fn load(path: &std::path::Path) -> Result<Option<String>, String> {
    if !path.is_file() {
        return Ok(None);
    }
    std::fs::read_to_string(&path)
        .map(Some)
        .map_err(|err| err.to_string())
}

/// Write to a sibling temp file, flush it to disk, then rename over the target.
/// A plain write is one kill or power cut away from a truncated `desktop.json`,
/// and a truncated state file drops the user back into onboarding with every
/// drawer, group, pin and per-monitor layout gone. The rename is atomic, so the
/// worst case is losing the newest change, never the whole desk.
fn save(path: &std::path::Path, json: &str) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|err| err.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    {
        let mut file = std::fs::File::create(&tmp).map_err(|err| err.to_string())?;
        file.write_all(json.as_bytes())
            .map_err(|err| err.to_string())?;
        // Rename is atomic but only orders metadata; without this the rename can
        // land before the bytes do and survive a power cut pointing at nothing.
        file.sync_all().map_err(|err| err.to_string())?;
    }
    std::fs::rename(&tmp, &path).map_err(|err| err.to_string())
}

type SaveReply = oneshot::Sender<Result<(), String>>;
enum Message {
    Save(String, SaveReply),
    Load(oneshot::Sender<Result<Option<String>, String>>),
    Flush(mpsc::Sender<Result<(), String>>),
}

/// One process-wide writer owns the temporary file. Saves received within
/// 150ms share a durable write; readers see the latest accepted state.
pub struct Writer(mpsc::Sender<Message>);

impl Writer {
    pub fn new(app: &AppHandle) -> Result<Self, String> {
        Self::at(state_path(app)?)
    }

    fn at(path: PathBuf) -> Result<Self, String> {
        let (tx, rx) = mpsc::channel();
        std::thread::Builder::new()
            .name("alcove-state-writer".into())
            .spawn(move || write_loop(path, rx))
            .map_err(|err| err.to_string())?;
        Ok(Self(tx))
    }

    pub async fn save(&self, json: String) -> Result<(), String> {
        let (tx, rx) = oneshot::channel();
        self.0
            .send(Message::Save(json, tx))
            .map_err(|err| err.to_string())?;
        rx.await.map_err(|err| err.to_string())?
    }

    pub async fn load(&self) -> Result<Option<String>, String> {
        let (tx, rx) = oneshot::channel();
        self.0
            .send(Message::Load(tx))
            .map_err(|err| err.to_string())?;
        rx.await.map_err(|err| err.to_string())?
    }

    /// Only blocks during orderly exit, after normal interactive work ends.
    pub fn flush(&self) -> Result<(), String> {
        let (tx, rx) = mpsc::channel();
        self.0
            .send(Message::Flush(tx))
            .map_err(|err| err.to_string())?;
        rx.recv().map_err(|err| err.to_string())?
    }
}

fn commit(
    path: &std::path::Path,
    pending: &Option<String>,
    saved: &mut Option<String>,
    replies: &mut Vec<SaveReply>,
) -> Result<(), String> {
    let result = match pending {
        Some(json) if saved.as_ref() != Some(json) => {
            save(path, json).map(|()| *saved = Some(json.clone()))
        }
        _ => Ok(()),
    };
    for reply in replies.drain(..) {
        let _ = reply.send(result.clone());
    }
    result
}

fn write_loop(path: PathBuf, rx: mpsc::Receiver<Message>) {
    let initial = load(&path);
    let mut saved = initial.as_ref().ok().cloned().flatten();
    let mut pending: Option<String> = None;
    let mut replies = Vec::new();
    let mut deadline: Option<Instant> = None;
    loop {
        let message = match deadline {
            Some(at) => rx.recv_timeout(at.saturating_duration_since(Instant::now())),
            None => rx.recv().map_err(|_| mpsc::RecvTimeoutError::Disconnected),
        };
        match message {
            Ok(Message::Save(json, reply)) => {
                pending = Some(json);
                replies.push(reply);
                deadline.get_or_insert_with(|| Instant::now() + Duration::from_millis(150));
            }
            Ok(Message::Load(reply)) => {
                let value = pending.clone().or_else(|| saved.clone());
                let result = if value.is_some() {
                    Ok(value)
                } else {
                    initial.clone()
                };
                let _ = reply.send(result);
            }
            Ok(Message::Flush(reply)) => {
                let result = commit(&path, &pending, &mut saved, &mut replies);
                let _ = reply.send(result);
                deadline = None;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                let _ = commit(&path, &pending, &mut saved, &mut replies);
                deadline = None;
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                if let Err(err) = commit(&path, &pending, &mut saved, &mut replies) {
                    log::error!("could not flush desktop state: {err}");
                }
                break;
            }
        }
    }
}

fn hidden_marker(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|err| err.to_string())
        .map(|dir| dir.join("desktop-hidden"))
}

/// Records that Explorer's icon list is hidden right now. Clean shutdowns clear
/// it; a marker still present at startup means the previous run was killed or
/// crashed while the real desktop icons were hidden.
pub fn mark_desktop_hidden(app: &AppHandle, hidden: bool) {
    let Ok(path) = hidden_marker(app) else {
        return;
    };
    if hidden {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(&path, b"1");
    } else {
        let _ = std::fs::remove_file(&path);
    }
}

pub fn desktop_left_hidden(app: &AppHandle) -> bool {
    hidden_marker(app)
        .map(|path| path.is_file())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_dir(name: &str) -> PathBuf {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "alcove-writer-{name}-{}-{nonce}",
            std::process::id()
        ))
    }

    #[test]
    fn ordered_writer_exposes_latest_pending_state_and_flushes_on_exit() {
        let dir = test_dir("ordered");
        let path = dir.join("desktop.json");
        let writer = Writer::at(path.clone()).unwrap();
        let (first_tx, first_rx) = oneshot::channel();
        let (last_tx, last_rx) = oneshot::channel();
        writer
            .0
            .send(Message::Save("{\"layout\":1}".into(), first_tx))
            .unwrap();
        writer
            .0
            .send(Message::Save("{\"layout\":2}".into(), last_tx))
            .unwrap();
        assert_eq!(
            tauri::async_runtime::block_on(writer.load())
                .unwrap()
                .as_deref(),
            Some("{\"layout\":2}")
        );
        writer.flush().unwrap();
        first_rx.blocking_recv().unwrap().unwrap();
        last_rx.blocking_recv().unwrap().unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{\"layout\":2}");
        assert!(!path.with_extension("json.tmp").exists());
        let modified = path.metadata().unwrap().modified().unwrap();
        tauri::async_runtime::block_on(writer.save("{\"layout\":2}".into())).unwrap();
        assert_eq!(
            path.metadata().unwrap().modified().unwrap(),
            modified,
            "identical state must not rewrite the file"
        );
        drop(writer);
        assert_eq!(dir.parent(), Some(std::env::temp_dir().as_path()));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn failed_write_is_reported_and_same_state_can_retry() {
        let dir = test_dir("retry");
        std::fs::write(&dir, b"blocks directory creation").unwrap();
        let path = dir.join("desktop.json");
        let writer = Writer::at(path.clone()).unwrap();
        assert!(tauri::async_runtime::block_on(writer.save("{}".into())).is_err());
        std::fs::remove_file(&dir).unwrap();
        tauri::async_runtime::block_on(writer.save("{}".into())).unwrap();
        writer.flush().unwrap();
        assert_eq!(std::fs::read_to_string(path).unwrap(), "{}");
        drop(writer);
        assert_eq!(dir.parent(), Some(std::env::temp_dir().as_path()));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
