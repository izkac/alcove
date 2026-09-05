//! Bounded static executable art, separate from current window state.
use std::collections::VecDeque;
use std::time::{Duration, Instant, SystemTime};

#[derive(Clone, PartialEq, Eq)]
pub struct Fingerprint {
    pub path: String,
    pub size: u64,
    pub modified: SystemTime,
}

struct Entry {
    key: Fingerprint,
    value: Option<String>,
    expires: Instant,
    bytes: usize,
}

pub struct IconCache {
    entries: VecDeque<Entry>,
    bytes: usize,
    max_bytes: usize,
    max_entries: usize,
}

impl IconCache {
    pub fn new(max_bytes: usize, max_entries: usize) -> Self {
        Self {
            entries: VecDeque::new(),
            bytes: 0,
            max_bytes,
            max_entries,
        }
    }

    pub fn get_or_load(
        &mut self,
        key: Fingerprint,
        now: Instant,
        load: impl FnOnce() -> Option<String>,
    ) -> Option<String> {
        if let Some(index) = self
            .entries
            .iter()
            .position(|entry| entry.key.path == key.path)
        {
            let entry = self.entries.remove(index).unwrap();
            self.bytes -= entry.bytes;
            if entry.key == key && now < entry.expires {
                let result = entry.value.clone();
                self.bytes += entry.bytes;
                self.entries.push_back(entry);
                return result;
            }
        }
        let value = load();
        let bytes = key.path.capacity()
            + value.as_ref().map_or(0, String::capacity)
            + std::mem::size_of::<Entry>();
        if bytes <= self.max_bytes && self.max_entries > 0 {
            while self.bytes + bytes > self.max_bytes || self.entries.len() >= self.max_entries {
                if let Some(old) = self.entries.pop_front() {
                    self.bytes -= old.bytes;
                }
            }
            let ttl = if value.is_some() { 300 } else { 5 };
            self.entries.push_back(Entry {
                key,
                value: value.clone(),
                expires: now + Duration::from_secs(ttl),
                bytes,
            });
            self.bytes += bytes;
        }
        value
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn key(path: &str, size: u64) -> Fingerprint {
        Fingerprint {
            path: path.into(),
            size,
            modified: SystemTime::UNIX_EPOCH,
        }
    }
    #[test]
    fn reuses_art_but_invalidates_changed_executables_and_failed_extractions() {
        let mut cache = IconCache::new(4096, 4);
        let now = Instant::now();
        assert_eq!(
            cache
                .get_or_load(key("a", 1), now, || Some("old".into()))
                .as_deref(),
            Some("old")
        );
        cache.get_or_load(key("a", 1), now, || panic!("unchanged art must be reused"));
        assert_eq!(
            cache
                .get_or_load(key("a", 2), now, || Some("new".into()))
                .as_deref(),
            Some("new")
        );
        cache.get_or_load(key("b", 1), now, || None);
        cache.get_or_load(key("b", 1), now, || panic!("miss is briefly cached"));
        assert!(cache
            .get_or_load(key("b", 1), now + Duration::from_secs(6), || Some(
                "retry".into()
            ))
            .is_some());
    }
    #[test]
    fn limits_bytes_and_evicts_the_least_recently_used_entry() {
        let mut cache = IconCache::new(512, 2);
        let now = Instant::now();
        for path in ["a", "b", "a", "c"] {
            cache.get_or_load(key(path, 1), now, || Some(path.into()));
        }
        assert_eq!(
            cache
                .entries
                .iter()
                .map(|e| e.key.path.as_str())
                .collect::<Vec<_>>(),
            ["a", "c"]
        );
        cache.get_or_load(key("large", 1), now, || Some("x".repeat(1024)));
        assert!(cache.bytes <= 512);
        assert_eq!(cache.entries.len(), 2);
    }
}
