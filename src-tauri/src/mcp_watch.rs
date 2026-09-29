//! Push notifications for new MCP write jobs (docs/design/mcp-local-free.md #D4).
//!
//! The shim drops `mcp/jobs/<id>.json`; the always-alive `workspace` window used
//! to poll that directory every 150 ms. Instead the frontend now parks one
//! `mcp_wait_job` call, and this module wakes it the moment a job lands.
//!
//! Two hard constraints shape the code here:
//!
//! 1. **Never block the main thread.** Tauri runs window IPC on the main thread
//!    (the same loop that paints and handles input), so a multi-second wait
//!    there freezes the whole app. [`Waiter::park`] first checks the directory,
//!    and only then hands an *empty* answer to a worker thread that waits for a
//!    hint. A job that is already on disk therefore never costs a thread hop.
//! 2. **The watcher is a hint, not a lease.** Every wake re-reads the directory,
//!    and the wait has its own deadline, so a missed or spurious event costs
//!    latency — never a job.

use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, Sender};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use notify::{RecommendedWatcher, Watcher};
use tauri::{AppHandle, Runtime};

/// Ceiling on one parked wait, so a stuck call cannot outlive the shim's 5 s
/// deadline. The wait only backs up the watcher, so it stays short.
pub const MAX_WAIT_MS: u64 = 1_500;
/// Slack subtracted from the job deadline, leaving room to answer.
const DEADLINE_SLACK_MS: u64 = 500;
/// Shortest allowed wait, so a stale deadline cannot spin the loop.
const MIN_WAIT_MS: u64 = 100;

/// Watches `mcp/jobs/` and parks waits for new job files.
pub struct JobWatch {
    receiver: Mutex<Receiver<()>>,
    _watcher: Option<RecommendedWatcher>,
    /// Canonical form of the watched directory, used to ignore hints meant for
    /// another path. `None` when no watcher could be installed.
    watched: Option<PathBuf>,
}

/// Builds the channel pair an installed watcher needs.
///
/// The sender half goes to the watcher thread; the receiver half is what a
/// parked wait blocks on. Exposed for tests, which wake a wait without touching
/// the filesystem.
pub fn channel() -> (Sender<()>, Receiver<()>) {
    std::sync::mpsc::channel()
}

impl JobWatch {
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

    /// True when this watch reports changes under `dir`.
    ///
    /// The comparison is canonical: Tauri hands out `\\?\`-prefixed paths on
    /// Windows while the watcher stores what it was given, and both spell the
    /// same directory.
    pub fn watches(&self, dir: &Path) -> bool {
        match &self.watched {
            Some(watched) => canonical(watched) == canonical(dir),
            None => false,
        }
    }

    /// Waits on the worker thread for a hint, bounded by `wait_ms`.
    ///
    /// Returns immediately when a hint is already pending, so a job that landed
    /// while the previous one was executing is never delayed by a full wait.
    fn wait_blocking(&self, wait_ms: u64) {
        let remaining = Duration::from_millis(wait_ms);
        if remaining.is_zero() {
            return;
        }
        let Ok(receiver) = self.receiver.lock() else {
            thread::sleep(remaining);
            return;
        };
        // One hint is enough: the caller re-reads the directory afterwards, so a
        // coalesced or stale hint is harmless.
        let _ = receiver.recv_timeout(remaining);
    }

    /// Non-blocking drain, used right before re-checking the jobs directory.
    pub fn drain(&self) {
        let Ok(receiver) = self.receiver.lock() else {
            return;
        };
        while receiver.try_recv().is_ok() {}
    }
}

/// A wait handed to a worker thread.
///
/// Tauri's state must stay `Send + Sync`, so it owns the watcher and a callback
/// rather than borrowing either. The callback is invoked exactly once.
pub struct ParkedWait {
    watch: std::sync::Arc<JobWatch>,
    wait_ms: u64,
    answer: Box<dyn FnOnce() + Send>,
}

impl ParkedWait {
    /// Runs the wait off the main thread and reports back through `answer`.
    pub fn spawn(self) -> thread::JoinHandle<()> {
        thread::spawn(move || {
            self.watch.wait_blocking(self.wait_ms);
            (self.answer)();
        })
    }
}

/// Longest a wait may park: the caller's ceiling, bounded by the job deadline.
///
/// The budget only backs up the watcher, so it stays short — the app must never
/// look asleep while it is merely waiting for work.
pub fn wait_budget(requested_ms: Option<u64>, deadline: Option<u64>) -> u64 {
    let mut budget = requested_ms.unwrap_or(MAX_WAIT_MS).min(MAX_WAIT_MS);
    if let Some(deadline) = deadline {
        let until_deadline = deadline
            .saturating_sub(now_millis())
            .saturating_sub(DEADLINE_SLACK_MS);
        budget = budget.min(until_deadline);
    }
    budget.max(MIN_WAIT_MS)
}

/// Installs the watcher over `<app_data>/mcp/jobs`, creating it when missing.
///
/// A failure is not fatal: the returned handle then has no watcher, and the
/// frontend keeps working because each wait's deadline returns an empty answer.
pub fn install<R: Runtime>(app: &AppHandle<R>, jobs_dir: PathBuf) -> JobWatch {
    let (signal, receiver) = channel();
    if std::fs::create_dir_all(&jobs_dir).is_err() {
        return JobWatch::new(receiver, None, None);
    }
    let notifier = signal.clone();
    let created = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        if let Ok(event) = event {
            if !event.paths.is_empty() {
                // Wake a parked wait. Blocking on a full channel is fine: a full
                // channel means a wait is already pending, so the hint is
                // redundant and this returns as soon as that wait drains one.
                // The callback runs on the watcher's own thread, never on the
                // IPC path, so it cannot stall the UI.
                let _ = notifier.send(());
            }
        }
    });
    let watcher = match created {
        Ok(mut watcher) => match watcher.watch(&jobs_dir, notify::RecursiveMode::NonRecursive) {
            Ok(()) => Some(watcher),
            Err(error) => {
                eprintln!("mcp job watch unavailable, waiting on deadline only: {error}");
                None
            }
        },
        Err(error) => {
            eprintln!("mcp job watch unavailable, waiting on deadline only: {error}");
            None
        }
    };
    let _ = app;
    let watched = watcher.as_ref().map(|_| jobs_dir);
    JobWatch::new(receiver, watcher, watched)
}

/// Wraps the watcher for state, so a wait can be parked from any thread.
pub fn shared(watch: JobWatch) -> std::sync::Arc<JobWatch> {
    std::sync::Arc::new(watch)
}

/// Builds the worker payload for one parked wait.
pub fn parked(
    watch: std::sync::Arc<JobWatch>,
    wait_ms: u64,
    answer: impl FnOnce() + Send + 'static,
) -> ParkedWait {
    ParkedWait {
        watch,
        wait_ms,
        answer: Box::new(answer),
    }
}

/// Canonical form of a path, falling back to the path itself when the
/// filesystem cannot resolve it (e.g. the directory vanished mid-call).
fn canonical(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn now_millis() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn wait_returns_immediately_when_signalled() {
        let (signal, receiver) = channel();
        let watch = JobWatch::new(receiver, None, None);
        signal.send(()).expect("send hint");
        let started = Instant::now();
        watch.wait_blocking(1_000);
        assert!(started.elapsed() < Duration::from_millis(100));
    }

    #[test]
    fn wait_falls_back_to_deadline_without_watcher() {
        let (_signal, receiver) = channel();
        let watch = JobWatch::new(receiver, None, None);
        let started = Instant::now();
        watch.wait_blocking(120);
        assert!(started.elapsed() >= Duration::from_millis(100));
    }

    #[test]
    fn drain_clears_a_stale_hint() {
        let (signal, receiver) = channel();
        let watch = JobWatch::new(receiver, None, None);
        signal.send(()).expect("send hint");
        watch.drain();
        let started = Instant::now();
        watch.wait_blocking(120);
        assert!(started.elapsed() >= Duration::from_millis(100));
    }

    #[test]
    fn watches_only_the_installed_directory() {
        let jobs = std::env::temp_dir().join("stylenotes-jobs-a");
        let _ = std::fs::create_dir_all(&jobs);
        let other = std::env::temp_dir().join("stylenotes-jobs-b");
        let (_signal, receiver) = channel();
        let watch = JobWatch::new(receiver, None, Some(jobs.clone()));
        assert!(watch.watches(&jobs));
        assert!(!watch.watches(&other));
        let _ = std::fs::remove_dir_all(&jobs);
    }

    #[test]
    fn budget_is_capped_and_never_zero() {
        assert_eq!(wait_budget(None, None), MAX_WAIT_MS);
        assert_eq!(wait_budget(Some(60_000), None), MAX_WAIT_MS);
        assert_eq!(wait_budget(Some(0), None), MIN_WAIT_MS);
        let past = now_millis().saturating_sub(5_000);
        assert_eq!(wait_budget(None, Some(past)), MIN_WAIT_MS);
    }

    #[test]
    fn budget_stays_clear_of_the_shim_deadline() {
        let budget = wait_budget(None, Some(now_millis() + 5_000));
        assert!(budget <= MAX_WAIT_MS);
        // The answer needs room before the shim gives up at 5 s.
        assert!(budget + DEADLINE_SLACK_MS <= 5_000);
    }
}
