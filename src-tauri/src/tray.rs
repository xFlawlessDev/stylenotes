use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

use crate::WORKSPACE_LABEL;

const TRAY_ID: &str = "stylenotes-tray";
const MENU_SHOW: &str = "tray-show";
const MENU_HIDE: &str = "tray-hide";
const MENU_QUIT: &str = "tray-quit";

/// Builds the system tray icon.
///
/// The windows hide instead of closing, so the tray is what keeps the app
/// reachable while it runs in the background and lets the user quit.
pub fn init<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, MENU_SHOW, "Show StyleNotes", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, MENU_HIDE, "Hide window", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, MENU_QUIT, "Quit StyleNotes", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &hide, &separator, &quit])?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("StyleNotes")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            MENU_SHOW => show_workspace(app),
            MENU_HIDE => hide_workspace(app),
            MENU_QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_workspace(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    // The icon is removed when the last handle is dropped, so keep it in state.
    let _ = app.manage(builder.build(app)?);
    Ok(())
}

fn show_workspace<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(WORKSPACE_LABEL) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn hide_workspace<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(WORKSPACE_LABEL) {
        let _ = window.hide();
    }
}
