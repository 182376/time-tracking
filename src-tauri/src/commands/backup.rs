use crate::app::runtime::{now_ms, sync_desktop_behavior_from_storage};
use crate::data::backup;
use crate::domain::backup::BackupPreview;
use crate::engine::tracking_runtime;
use tauri::AppHandle;

#[tauri::command]
pub fn cmd_pick_backup_save_file(initial_path: Option<String>) -> Option<String> {
    backup::pick_backup_save_file(initial_path)
}

#[tauri::command]
pub fn cmd_pick_backup_file(initial_path: Option<String>) -> Option<String> {
    backup::pick_backup_file(initial_path)
}

#[tauri::command]
pub async fn cmd_export_backup(backup_path: Option<String>, app: AppHandle) -> Result<String, String> {
    backup::export_backup(backup_path, app).await
}

#[tauri::command]
pub async fn cmd_restore_backup(backup_path: String, app: AppHandle) -> Result<(), String> {
    backup::restore_backup(backup_path, app.clone()).await?;
    sync_desktop_behavior_from_storage(app.clone(), false).await?;
    tracking_runtime::emit_tracking_data_changed(&app, "backup-restored", now_ms())
        .map_err(|error| format!("failed to emit restore refresh event: {error}"))?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_preview_backup(backup_path: String) -> Result<BackupPreview, String> {
    backup::preview_backup(backup_path).await
}

