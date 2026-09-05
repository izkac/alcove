use std::collections::{HashSet, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

pub struct Budget {
    pub entries: usize,
    pub duration: Duration,
    pub depth: usize,
}

pub struct Hit {
    pub path: PathBuf,
    pub is_dir: bool,
    pub byte_size: Option<u64>,
    pub modified: Option<std::time::SystemTime>,
}

/// Read entries incrementally. All retained collections are bounded by the
/// entry/hit limits, and ranking uses metadata already read inside the budget.
pub fn walk(
    roots: &[String],
    query: &str,
    limit: usize,
    budget: Budget,
    cancelled: &AtomicBool,
    visible: impl Fn(&std::fs::DirEntry) -> bool,
) -> Vec<Hit> {
    let started = Instant::now();
    let stop = || cancelled.load(Ordering::Relaxed) || started.elapsed() >= budget.duration;
    let terms: Vec<_> = query.split_whitespace().map(str::to_lowercase).collect();
    if limit == 0 || terms.is_empty() || stop() {
        return Vec::new();
    }
    let gather = limit.saturating_mul(4);
    let mut queue = VecDeque::new();
    let mut seen = HashSet::new();
    for root in roots.iter().take(budget.entries) {
        if stop() {
            break;
        }
        let path = PathBuf::from(root.trim());
        if seen.insert(path.clone()) && path.is_dir() {
            queue.push_back((path, 0));
        }
    }
    let mut walked = 0;
    let mut hits = Vec::new();
    'walk: while let Some((dir, depth)) = queue.pop_front() {
        if stop() || walked >= budget.entries || hits.len() >= gather {
            break;
        }
        let Ok(mut entries) = std::fs::read_dir(dir) else {
            continue;
        };
        loop {
            // Check before advancing ReadDir too: it can itself do disk I/O.
            if stop() || walked >= budget.entries || hits.len() >= gather {
                break 'walk;
            }
            let Some(entry) = entries.next() else { break };
            walked += 1;
            let Ok(entry) = entry else { continue };
            if !visible(&entry) {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_lowercase();
            let path = entry.path();
            if terms.iter().all(|term| name.contains(term)) {
                if stop() {
                    break 'walk;
                }
                let meta = entry.metadata().ok();
                let modified = meta.as_ref().and_then(|meta| meta.modified().ok());
                let is_dir = meta.as_ref().is_some_and(|meta| meta.is_dir());
                let byte_size = meta
                    .as_ref()
                    .filter(|meta| !meta.is_dir())
                    .map(|meta| meta.len());
                hits.push((
                    depth + 1,
                    std::cmp::Reverse(modified),
                    Hit {
                        path: path.clone(),
                        is_dir,
                        byte_size,
                        modified,
                    },
                ));
            }
            if depth + 1 < budget.depth
                && !skip(&name)
                && entry.file_type().is_ok_and(|kind| kind.is_dir())
            {
                queue.push_back((path, depth + 1));
            }
        }
    }
    if cancelled.load(Ordering::Relaxed) {
        return Vec::new();
    }
    hits.sort_unstable_by(|a, b| (&a.0, &a.1, &a.2.path).cmp(&(&b.0, &b.1, &b.2.path)));
    hits.into_iter()
        .take(limit)
        .map(|(_, _, hit)| hit)
        .collect()
}

fn skip(name: &str) -> bool {
    matches!(
        name,
        "node_modules" | "$recycle.bin" | "system volume information" | "appdata" | "__pycache__"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    #[test]
    fn wide_directory_obeys_entry_hit_and_cancellation_limits() {
        let dir = std::env::temp_dir().join(format!("alcove-search-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        for n in 0..100 {
            std::fs::write(dir.join(format!("hit-{n}.txt")), b"").unwrap();
        }
        let roots = vec![dir.to_string_lossy().into_owned()];
        let cancelled = AtomicBool::new(false);
        let count = AtomicUsize::new(0);
        let budget = || Budget {
            entries: 7,
            duration: Duration::from_secs(5),
            depth: 5,
        };
        let hits = walk(&roots, "hit", 50, budget(), &cancelled, |_| {
            count.fetch_add(1, Ordering::Relaxed);
            true
        });
        assert_eq!(hits.len(), 7);
        assert_eq!(count.load(Ordering::Relaxed), 7);
        count.store(0, Ordering::Relaxed);
        let hits = walk(&roots, "hit", 1, budget(), &cancelled, |_| {
            count.fetch_add(1, Ordering::Relaxed);
            true
        });
        assert_eq!(hits.len(), 1);
        assert_eq!(count.load(Ordering::Relaxed), 4);
        count.store(0, Ordering::Relaxed);
        let hits = walk(&roots, "hit", 50, budget(), &cancelled, |_| {
            if count.fetch_add(1, Ordering::Relaxed) == 2 {
                cancelled.store(true, Ordering::Relaxed);
            }
            true
        });
        assert!(hits.is_empty());
        assert_eq!(count.load(Ordering::Relaxed), 3);
        let hits = walk(
            &roots,
            "hit",
            50,
            Budget {
                duration: Duration::ZERO,
                ..budget()
            },
            &AtomicBool::new(false),
            |_| panic!("expired search visited an entry"),
        );
        assert!(hits.is_empty());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
