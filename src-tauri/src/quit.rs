//! Graceful shutdown: let every window flush pending writes before exit.
//!
//! Note/task windows debounce their edits (`save-queue.svelte.ts`) and the
//! workspace-family windows debounce settings (`settings.svelte.ts`), so at
//! quit time a window can still hold an unsaved change. The tray's Quit used to
//! call `app.exit(0)` immediately, which discarded it. Instead we ask every
//! window to flush, wait for them to acknowledge, and only then exit — with a
//! hard timeout so a wedged window cannot block the app forever.

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// Sent to every window when the user asks to quit.
pub const QUIT_REQUESTED_EVENT: &str = "app:quit-requested";

/// How long to wait for windows to flush before exiting anyway.
const QUIT_TIMEOUT: Duration = Duration::from_millis(2000);

#[derive(Default)]
pub struct QuitState {
    /// Labels still expected to acknowledge the quit.
    pending: Mutex<HashSet<String>>,
    quitting: AtomicBool,
}

/// Asks every window to flush, then exits.
///
/// Every role carries something debounced: note/task windows a save queue, and
/// the workspace/overlay/kanban windows a debounced settings write. Waiting for
/// all of them is what keeps the last change from being lost on Quit.
pub fn request_quit<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<QuitState>();
    if state.quitting.swap(true, Ordering::SeqCst) {
        return;
    }

    let labels: Vec<String> = app.webview_windows().keys().cloned().collect();

    if labels.is_empty() {
        app.exit(0);
        return;
    }

    {
        let mut pending = state.pending.lock().expect("quit state lock");
        pending.extend(labels.iter().cloned());
    }

    // Broadcast once; every window flushes and acks by label.
    let _ = app.emit(QUIT_REQUESTED_EVENT, ());

    // Safety net: exit even if an ack never arrives.
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(QUIT_TIMEOUT);
        handle.exit(0);
    });
}

/// Records that a window finished flushing; exits once every window has.
#[tauri::command]
pub fn app_quit_ready<R: Runtime>(app: AppHandle<R>, label: String) {
    let state = app.state::<QuitState>();
    let remaining = {
        let mut pending = state.pending.lock().expect("quit state lock");
        pending.remove(&label);
        pending.len()
    };
    if remaining == 0 {
        app.exit(0);
    }
}
