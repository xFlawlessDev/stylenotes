//! Desktop window shortcuts (AGENTS.md: Tauri / capabilities).
//!
//! The global shortcuts are registered in Rust so they work from launch, before
//! (or without) a given webview. The Kanban lock lives here rather than in the
//! frontend because it flips a window property, not app state.

use tauri::{Emitter, Manager};

use crate::{KANBAN_LABEL, KANBAN_LOCK_EVENT, OVERLAY_LABEL, QUICK_CAPTURE_EVENT};

/// Shortcut that locks the Kanban window to the desktop or floats it again.
pub fn kanban_lock_shortcut() -> tauri_plugin_global_shortcut::Shortcut {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Backslash)
}

/// Shortcut that quick-captures a note straight into the overlay dock.
pub fn quick_note_shortcut() -> tauri_plugin_global_shortcut::Shortcut {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyN)
}

/// Shortcut that quick-captures a task straight into the overlay dock.
pub fn quick_task_shortcut() -> tauri_plugin_global_shortcut::Shortcut {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyT)
}

/// Locks the Kanban window to the desktop (`true`) or floats it (`false`).
///
/// Must not run on the main thread: the desktop underlay plugin dispatches to
/// the main thread internally and waits for it to finish.
pub fn toggle_kanban_lock<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    use tauri_plugin_desktop_underlay::DesktopUnderlayExt;

    let Some(window) = app.get_webview_window(KANBAN_LABEL) else {
        return;
    };
    let locked = !window.is_desktop_underlay();
    if locked {
        let _ = window.set_always_on_top(false);
        let _ = window.set_desktop_underlay(true);
    } else {
        let _ = window.set_desktop_underlay(false);
        let _ = window.set_always_on_top(true);
    }
    let _ = window.show();
    if !locked {
        let _ = window.set_focus();
    }
    let _ = app.emit(KANBAN_LOCK_EVENT, locked);
}

/// Parks the overlay in the top-right corner on launch.
pub fn place_overlay<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    use tauri_plugin_positioner::{Position, WindowExt};
    if let Some(overlay) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = overlay.as_ref().window().move_window(Position::TopRight);
    }
}

/// Registers the three global shortcuts.
///
/// The Kanban lock is fatal if it cannot register (returned); the two quick
/// captures stay best-effort, because a taken shortcut should never stop the
/// app from starting.
pub fn register<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), tauri_plugin_global_shortcut::Error> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

    // Registered in Rust so the shortcut works from launch, even before (or
    // without) the Kanban webview.
    app.global_shortcut()
        .on_shortcut(kanban_lock_shortcut(), move |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            let app = app.clone();
            // Detached on purpose: the toggle must not run on the shortcut
            // handler's thread (see `toggle_kanban_lock`).
            std::mem::drop(tauri::async_runtime::spawn(async move {
                toggle_kanban_lock(&app);
            }));
        })?;

    // Quick capture: the dock (always alive) receives the event, creates the
    // record, and opens its editor window. A failed registration (shortcut
    // taken by another app) is not fatal.
    let _ =
        app.global_shortcut()
            .on_shortcut(quick_note_shortcut(), move |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    let _ = app.emit(QUICK_CAPTURE_EVENT, "note");
                }
            });
    let _ =
        app.global_shortcut()
            .on_shortcut(quick_task_shortcut(), move |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    let _ = app.emit(QUICK_CAPTURE_EVENT, "task");
                }
            });
    Ok(())
}
