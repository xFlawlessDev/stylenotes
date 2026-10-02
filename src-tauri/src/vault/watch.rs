//! Push notification for vault folder changes (docs/design/vault-mirror.md #V19).
//!
//! A vault is a tree, so unlike the MCP job watch this installs a **recursive**
//! `notify` watcher on the folder root. It follows the same discipline as
//! `mcp_watch.rs`:
//!
//! 1. **Never block the main thread.** A parked wait runs on a worker thread and
//!    reports back; the IPC call itself returns immediately.
//! 2. **The watcher is a hint, not a lease.** A missed or spurious event costs
//!    latency, never a change — the caller always re-scans the folder, which is
//!    the same sweep that catches files made while the app was closed (#V18).

use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, Sender};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};

/// Ceiling on one parked wait; the frontend loops on top of it.
pub const MAX_WAIT_MS: u64 = 2_000;
/// Shortest allowed wait, so a stale deadline cannot spin the loop.
const MIN_WAIT_MS: u64 = 200;

/// Watches one vault root and wakes a parked wait on any change under it.
pub struct VaultWatch {
    receiver: Mutex<Receiver<()>>,
    _watcher: Option<RecommendedWatcher>,
    watched: Option<PathBuf>,
}

/// Builds the channel pair an installed watcher needs (exposed for tests).
pub fn channel() -> (Sender<()>, Receiver<()>) {
    std::sync::mpsc::channel()
}

impl VaultWatch {
    fn new(
        receiver: Receiver<()>,
        watcher: Option<RecommendedWatcher>,
        watched: Option<PathBuf>,
    ) -> Self {
        Self {
            receiver: Mutex::new(receiver),
            _watcher: watcher,
            watched,
        }
    }

    /// True when this watch is already installed on the same folder.
    pub fn watches(&self, root: &Path) -> bool {
        match &self.watched {
            Some(watched) => canonical(watched) == canonical(root),
            None => false,
        }
    }

    fn wait_blocking(&self, wait_ms: u64) {
        let remaining = Duration::from_millis(wait_ms);
        if remaining.is_zero() {
            return;
        }
        let Ok(receiver) = self.receiver.lock() else {
            thread::sleep(remaining);
            return;
        };
        // One hint is enough: the caller re-scans afterwards.
        let _ = receiver.recv_timeout(remaining);
    }
}

/// A wait handed to a worker thread; the callback runs exactly once.
pub struct ParkedWait {
    watch: std::sync::Arc<VaultWatch>,
    wait_ms: u64,
    answer: Box<dyn FnOnce() + Send>,
}

impl ParkedWait {
    pub fn spawn(self) -> thread::JoinHandle<()> {
        thread::spawn(move || {
            self.watch.wait_blocking(self.wait_ms);
            (self.answer)();
        })
    }
}

/// Clamps a requested wait into the allowed window.
pub fn wait_budget(requested_ms: Option<u64>) -> u64 {
    requested_ms
        .unwrap_or(MAX_WAIT_MS)
        .clamp(MIN_WAIT_MS, MAX_WAIT_MS)
}

/// Installs a recursive watcher on `root`.
///
/// A failure is not fatal: the returned handle then has no watcher, and the
/// frontend keeps working because each wait falls back to its deadline.
pub fn install(root: PathBuf) -> VaultWatch {
    let (signal, receiver) = channel();
    if !root.is_dir() {
        return VaultWatch::new(receiver, None, None);
    }
    let notifier = signal.clone();
    // Forward every event as a hint; the frontend collapses bursts by running
    // at most one cycle at a time and skipping unchanged files by hash.
    let created = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        if let Ok(event) = event {
            if !event.paths.is_empty() {
                let _ = notifier.send(());
            }
        }
    });
    let watcher = match created {
        Ok(mut watcher) => match watcher.watch(&root, RecursiveMode::Recursive) {
            Ok(()) => Some(watcher),
            Err(error) => {
                eprintln!("vault watch unavailable, falling back to the timer: {error}");
                None
            }
        },
        Err(error) => {
            eprintln!("vault watch unavailable, falling back to the timer: {error}");
            None
        }
    };
    let watched = watcher.as_ref().map(|_| root);
    VaultWatch::new(receiver, watcher, watched)
}

/// Wraps the watcher for shared app state.
pub fn shared(watch: VaultWatch) -> std::sync::Arc<VaultWatch> {
    std::sync::Arc::new(watch)
}

/// Builds the worker payload for one parked wait.
pub fn parked(
    watch: std::sync::Arc<VaultWatch>,
    wait_ms: u64,
    answer: impl FnOnce() + Send + 'static,
) -> ParkedWait {
    ParkedWait {
        watch,
        wait_ms,
        answer: Box::new(answer),
    }
}

fn canonical(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wait_returns_immediately_when_signalled() {
        let (signal, receiver) = channel();
        let watch = VaultWatch::new(receiver, None, None);
        signal.send(()).expect("hint");
        let started = std::time::Instant::now();
        watch.wait_blocking(1_000);
        assert!(started.elapsed() < Duration::from_millis(100));
    }

    #[test]
    fn wait_falls_back_to_the_deadline_without_a_watcher() {
        let (_signal, receiver) = channel();
        let watch = VaultWatch::new(receiver, None, None);
        let started = std::time::Instant::now();
        watch.wait_blocking(150);
        assert!(started.elapsed() >= Duration::from_millis(100));
    }

    #[test]
    fn budget_is_clamped() {
        assert_eq!(wait_budget(None), MAX_WAIT_MS);
        assert_eq!(wait_budget(Some(10)), MIN_WAIT_MS);
        assert_eq!(wait_budget(Some(10_000)), MAX_WAIT_MS);
    }
}
