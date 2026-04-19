use crate::data::sqlite_pool::wait_for_sqlite_pool;
use crate::domain::tracking::TrackingStatusSnapshot;
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
pub struct CurrentTrackingSnapshot {
    pub window: crate::platform::windows::foreground::WindowInfo,
    pub status: TrackingStatusSnapshot,
}

#[tauri::command]
pub fn get_current_active_window() -> crate::platform::windows::foreground::WindowInfo {
    crate::platform::windows::foreground::get_current_active_window()
}

#[tauri::command]
pub async fn get_current_tracking_snapshot(
    app: tauri::AppHandle,
) -> Result<CurrentTrackingSnapshot, String> {
    let pool = wait_for_sqlite_pool(&app).await?;
    let snapshot = crate::engine::tracking::runtime::load_current_tracking_snapshot(&pool).await?;

    Ok(CurrentTrackingSnapshot {
        window: snapshot.window,
        status: snapshot.status,
    })
}

#[tauri::command]
pub fn cmd_set_idle_timeout(timeout_secs: u64) {
    crate::platform::windows::foreground::cmd_set_idle_timeout(timeout_secs);
}
