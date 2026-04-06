use crate::app::state::DesktopBehaviorState;
use crate::app::tray::apply_tray_visibility;
use crate::app::runtime::apply_autostart;
use crate::domain::settings::{parse_close_behavior, parse_minimize_behavior};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn cmd_set_desktop_behavior(
    close_behavior: String,
    minimize_behavior: String,
    app: AppHandle,
    desktop_behavior_state: State<DesktopBehaviorState>,
) -> Result<(), String> {
    let close_behavior = parse_close_behavior(&close_behavior);
    let minimize_behavior = parse_minimize_behavior(&minimize_behavior);
    let next = desktop_behavior_state.update_desktop(close_behavior, minimize_behavior);
    apply_tray_visibility(&app, next);
    Ok(())
}

#[tauri::command]
pub fn cmd_set_launch_behavior(
    launch_at_login: bool,
    start_minimized: bool,
    app: AppHandle,
    desktop_behavior_state: State<DesktopBehaviorState>,
) -> Result<(), String> {
    let next = desktop_behavior_state.update_launch(launch_at_login, start_minimized);
    apply_autostart(&app, next.launch_at_login)?;
    Ok(())
}

