#[tauri::command]
pub fn get_current_active_window() -> crate::platform::windows::foreground::WindowInfo {
    crate::platform::windows::foreground::get_current_active_window()
}

#[tauri::command]
pub fn cmd_set_afk_timeout(timeout_secs: u64) {
    crate::platform::windows::foreground::cmd_set_afk_timeout(timeout_secs);
}
