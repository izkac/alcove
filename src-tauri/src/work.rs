//! Limits expensive native work before it enters the blocking thread pool.
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tokio::sync::{Mutex as AsyncMutex, Semaphore};
pub static APPLICATIONS: Semaphore = Semaphore::const_new(1);

struct SearchSession {
    id: u64,
    generation: u64,
    cancelled: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct SearchJobs {
    jobs: Mutex<std::collections::HashMap<String, SearchSession>>,
    next: std::sync::atomic::AtomicU64,
}

impl SearchJobs {
    pub fn session(&self, window: &str) -> u64 {
        let id = self.next.fetch_add(1, Ordering::Relaxed) + 1;
        let mut jobs = self.jobs.lock().unwrap();
        if let Some(old) = jobs.insert(
            window.to_string(),
            SearchSession {
                id,
                generation: 0,
                cancelled: Arc::new(AtomicBool::new(false)),
            },
        ) {
            old.cancelled.store(true, Ordering::Relaxed);
        }
        id
    }

    pub fn begin(&self, window: &str, session: u64, generation: u64) -> Arc<AtomicBool> {
        let mut jobs = self.jobs.lock().unwrap();
        let Some(current) = jobs.get_mut(window) else {
            return Arc::new(AtomicBool::new(true));
        };
        if current.id != session || generation <= current.generation {
            return Arc::new(AtomicBool::new(true));
        }
        current.cancelled.store(true, Ordering::Relaxed);
        current.generation = generation;
        current.cancelled = Arc::new(AtomicBool::new(false));
        current.cancelled.clone()
    }

    pub fn cancel(&self, window: &str, session: u64, generation: u64) {
        let mut jobs = self.jobs.lock().unwrap();
        if let Some(current) = jobs.get_mut(window) {
            if current.id == session && generation >= current.generation {
                current.cancelled.store(true, Ordering::Relaxed);
                // Remember cancellation even if it precedes the async command.
                current.generation = generation;
            }
        }
    }

    pub fn remove(&self, window: &str) {
        if let Some(current) = self.jobs.lock().unwrap().remove(window) {
            current.cancelled.store(true, Ordering::Relaxed);
        }
    }
}

pub static LISTINGS: Semaphore = Semaphore::const_new(2);
pub static ICONS: Semaphore = Semaphore::const_new(4);
pub static THUMBNAILS: Semaphore = Semaphore::const_new(2);
pub static SEARCHES: Semaphore = Semaphore::const_new(2);
pub static DESKTOP: AsyncMutex<()> = AsyncMutex::const_new(());

pub async fn run<T: Send + 'static>(
    lanes: &'static Semaphore,
    job: impl FnOnce() -> T + Send + 'static,
) -> Result<T, String> {
    let permit = lanes.acquire().await.map_err(|err| err.to_string())?;
    // The permit belongs to the blocking job: dropping an awaiting command
    // must not admit more work while its native call is still running.
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        job()
    })
    .await
    .map_err(|err| err.to_string())
}

type FolderIcons = Vec<crate::harvest::HarvestedIcon>;
type SharedFolderResult = Result<Arc<FolderIcons>, String>;
type FolderFlight = tokio::sync::watch::Receiver<Option<SharedFolderResult>>;

#[derive(Default)]
struct FolderState {
    cached: Option<(Instant, Arc<FolderIcons>)>,
    flight: Option<FolderFlight>,
}
type FolderSlot = Arc<AsyncMutex<FolderState>>;
type FolderSlots = std::collections::VecDeque<(String, FolderSlot)>;
#[derive(Default)]
struct FolderRegistry {
    warm: FolderSlots,
    active: std::collections::HashMap<String, std::sync::Weak<AsyncMutex<FolderState>>>,
}
const FOLDER_SLOTS: usize = 16;
const FOLDER_BYTES: usize = 512 * 1024;
const FOLDER_TTL: Duration = Duration::from_secs(2);

fn folder_slot(path: &str) -> FolderSlot {
    static SLOTS: OnceLock<Mutex<FolderRegistry>> = OnceLock::new();
    let mut slots = SLOTS.get_or_init(Default::default).lock().unwrap();
    slots.active.retain(|_, slot| slot.strong_count() > 0);
    let key = path.trim().replace('/', "\\").to_lowercase();
    let slot: FolderSlot = slots
        .active
        .get(&key)
        .and_then(std::sync::Weak::upgrade)
        .unwrap_or_default();
    slots.active.insert(key.clone(), Arc::downgrade(&slot));
    slots.warm.retain(|(name, _)| name != &key);
    slots.warm.push_back((key, slot.clone()));
    while slots.warm.len() > FOLDER_SLOTS {
        slots.warm.pop_front();
    }
    slot
}

async fn folder_result(mut flight: FolderFlight) -> Result<FolderIcons, String> {
    loop {
        if let Some(result) = flight.borrow().clone() {
            return result.map(|icons| (*icons).clone());
        }
        flight.changed().await.map_err(|err| err.to_string())?;
    }
}

/// The retained memo is small; concurrent callers share even oversized results.
pub async fn folder(path: String, refresh: bool) -> Result<FolderIcons, String> {
    load_folder(folder_slot(&path), refresh, move || {
        crate::harvest::list_folder(&path)
    })
    .await
}

async fn load_folder(
    slot: FolderSlot,
    refresh: bool,
    loader: impl FnOnce() -> Result<FolderIcons, String> + Send + 'static,
) -> Result<FolderIcons, String> {
    loop {
        let mut state = slot.lock().await;
        if let Some(flight) = state.flight.clone() {
            drop(state);
            if !refresh {
                return folder_result(flight).await;
            }
            // A post-operation refresh must not reuse a pre-operation listing.
            let _ = folder_result(flight).await;
            continue;
        }
        if !refresh {
            if let Some((at, icons)) = &state.cached {
                if at.elapsed() < FOLDER_TTL {
                    return Ok((**icons).clone());
                }
            }
        }
        state.cached = None;
        let (tx, rx) = tokio::sync::watch::channel(None);
        state.flight = Some(rx.clone());
        drop(state);
        let shared_slot = slot.clone();
        // This task owns the request even if the initiating webview closes.
        tauri::async_runtime::spawn(async move {
            let result = run(&LISTINGS, loader)
                .await
                .and_then(|value| value)
                .map(Arc::new);
            let mut state = shared_slot.lock().await;
            if let Ok(icons) = &result {
                let bytes = icons.capacity() * std::mem::size_of::<crate::harvest::HarvestedIcon>()
                    + icons
                        .iter()
                        .map(|icon| {
                            icon.id.capacity()
                                + icon.name.capacity()
                                + icon.kind.capacity()
                                + icon.extension.as_ref().map_or(0, String::capacity)
                                + icon.group_hint.capacity()
                                + icon.path.capacity()
                                + icon.image_url.capacity()
                        })
                        .sum::<usize>();
                if bytes <= FOLDER_BYTES {
                    state.cached = Some((Instant::now(), icons.clone()));
                }
            }
            // Existing waiters retain the shared value, not the cache. Drop the
            // slot's receiver after publication so large results aren't retained.
            let _ = tx.send(Some(result));
            state.flight = None;
        });
        return folder_result(rx).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oversized_folder_results_are_shared_but_not_retained() {
        use std::future::Future;
        let slot = FolderSlot::default();
        let (started_tx, started_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let first_slot = slot.clone();
        let first = tauri::async_runtime::spawn(async move {
            load_folder(first_slot, false, move || {
                started_tx.send(()).unwrap();
                release_rx.recv().unwrap();
                Ok(vec![crate::harvest::HarvestedIcon {
                    id: "large".into(),
                    name: "large".into(),
                    kind: "app".into(),
                    extension: None,
                    group_hint: "apps".into(),
                    path: "large".into(),
                    image_url: "x".repeat(FOLDER_BYTES + 1),
                    byte_size: None,
                    modified_at: None,
                }])
            })
            .await
            .unwrap()
        });
        started_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        tauri::async_runtime::block_on(async {
            let mut second = Box::pin(load_folder(slot.clone(), false, || {
                panic!("duplicate scan")
            }));
            std::future::poll_fn(|cx| {
                assert!(second.as_mut().poll(cx).is_pending());
                std::task::Poll::Ready(())
            })
            .await;
            release_tx.send(()).unwrap();
            let a = first.await.unwrap();
            let b = second.await.unwrap();
            assert_eq!(a[0].image_url, b[0].image_url);
            assert!(slot.lock().await.cached.is_none());
            assert!(load_folder(slot.clone(), false, || Ok(Vec::new()))
                .await
                .unwrap()
                .is_empty());
            assert!(
                load_folder(slot, false, || panic!("small memo should be reused"))
                    .await
                    .unwrap()
                    .is_empty()
            );
        });
    }

    #[test]
    fn active_folder_survives_warm_cache_eviction() {
        let active = folder_slot("test-active");
        for n in 0..FOLDER_SLOTS + 4 {
            let _ = folder_slot(&format!("test-folder-{n}"));
        }
        assert!(Arc::ptr_eq(&active, &folder_slot("test-active")));
    }

    #[test]
    fn newer_search_and_early_cancellation_supersede_work() {
        let jobs = SearchJobs::default();
        let session = jobs.session("main");
        let other_session = jobs.session("search");
        let first = jobs.begin("main", session, 1);
        let other = jobs.begin("search", other_session, 1);
        let second = jobs.begin("main", session, 2);
        assert!(first.load(Ordering::Relaxed));
        assert!(!other.load(Ordering::Relaxed));
        jobs.cancel("main", session, 1);
        assert!(!second.load(Ordering::Relaxed));
        jobs.cancel("main", session, 3);
        assert!(second.load(Ordering::Relaxed));
        assert!(jobs.begin("main", session, 3).load(Ordering::Relaxed));
        assert!(!jobs.begin("main", session, 4).load(Ordering::Relaxed));
        let reloaded = jobs.session("main");
        let fresh = jobs.begin("main", reloaded, 1);
        assert!(!fresh.load(Ordering::Relaxed));
        assert!(jobs.begin("main", session, 100).load(Ordering::Relaxed));
        jobs.cancel("main", session, 101);
        assert!(!fresh.load(Ordering::Relaxed));
        jobs.remove("main");
        assert!(fresh.load(Ordering::Relaxed));
    }

    #[test]
    fn native_jobs_obey_concurrency_limit_and_do_not_block_async_workers() {
        static LANES: Semaphore = Semaphore::const_new(2);
        let barrier = Arc::new(std::sync::Barrier::new(3));
        let (tx, rx) = std::sync::mpsc::channel();
        let mut jobs = Vec::new();
        for n in 0..2 {
            let barrier = barrier.clone();
            let tx = tx.clone();
            jobs.push(tauri::async_runtime::spawn(async move {
                run(&LANES, move || {
                    tx.send(n).unwrap();
                    barrier.wait();
                    n
                })
                .await
                .unwrap()
            }));
        }
        rx.recv_timeout(Duration::from_secs(5)).unwrap();
        rx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(LANES.available_permits(), 0);
        let third = tauri::async_runtime::spawn(async move {
            run(&LANES, move || {
                tx.send(2).unwrap();
                2
            })
            .await
            .unwrap()
        });
        // An unrelated async task still runs while both native calls are blocked.
        assert_eq!(
            tauri::async_runtime::block_on(tauri::async_runtime::spawn(async { 42 })).unwrap(),
            42
        );
        assert!(rx.try_recv().is_err());
        barrier.wait();
        for job in jobs {
            tauri::async_runtime::block_on(job).unwrap();
        }
        assert_eq!(tauri::async_runtime::block_on(third).unwrap(), 2);
        assert_eq!(LANES.available_permits(), 2);
    }
}
