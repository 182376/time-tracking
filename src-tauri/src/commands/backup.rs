use crate::app::state::DesktopBehaviorState;
use crate::app::tray::apply_tray_visibility;
use crate::app::{apply_autostart, load_desktop_behavior_settings, now_ms, wait_for_sqlite_pool};
use crate::tracking_runtime;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Row, Sqlite};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager, Runtime};

const BACKUP_FILE_EXT: &str = "ttbackup.json";
const CURRENT_BACKUP_VERSION: u32 = 1;
const CURRENT_BACKUP_SCHEMA_VERSION: u32 = 3;

#[derive(Clone, Debug, Serialize, Deserialize)]
struct BackupMeta {
    exported_at_ms: u64,
    schema_version: u32,
    app_version: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct BackupSession {
    id: i64,
    app_name: String,
    exe_name: String,
    window_title: Option<String>,
    start_time: i64,
    end_time: Option<i64>,
    duration: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct BackupSetting {
    key: String,
    value: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct BackupIconCache {
    exe_name: String,
    icon_base64: String,
    last_updated: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct BackupPayload {
    version: u32,
    meta: BackupMeta,
    sessions: Vec<BackupSession>,
    settings: Vec<BackupSetting>,
    icon_cache: Vec<BackupIconCache>,
}

#[derive(Clone, Debug, Serialize)]
pub struct BackupPreview {
    version: u32,
    exported_at_ms: u64,
    schema_version: u32,
    app_version: String,
    compatibility_level: String,
    compatibility_message: String,
    session_count: usize,
    setting_count: usize,
    icon_cache_count: usize,
}

fn default_backup_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data dir: {error}"))?;
    let backup_dir = app_data_dir.join("backups");
    fs::create_dir_all(&backup_dir).map_err(|error| format!("failed to create backup dir: {error}"))?;

    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    Ok(backup_dir.join(format!("time-tracker-backup-{timestamp}.{BACKUP_FILE_EXT}")))
}

fn backup_file_name() -> String {
    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    format!("time-tracker-backup-{timestamp}.{BACKUP_FILE_EXT}")
}

fn resolve_backup_path<R: Runtime>(
    app: &AppHandle<R>,
    raw_path: Option<String>,
) -> Result<PathBuf, String> {
    let Some(raw_path) = raw_path.map(|value| value.trim().to_string()) else {
        return default_backup_path(app);
    };

    if raw_path.is_empty() {
        return default_backup_path(app);
    }

    let mut path = PathBuf::from(&raw_path);
    let ends_with_separator = raw_path.ends_with('\\') || raw_path.ends_with('/');
    if path.is_dir() || ends_with_separator {
        fs::create_dir_all(&path)
            .map_err(|error| format!("failed to create backup target dir: {error}"))?;
        path = path.join(backup_file_name());
    }

    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("failed to create backup parent dir: {error}"))?;
        }
    }

    Ok(path)
}

async fn load_backup_payload<R: Runtime>(app: &AppHandle<R>) -> Result<BackupPayload, String> {
    let pool = wait_for_sqlite_pool(app).await?;

    let session_rows = sqlx::query(
        "SELECT id, app_name, exe_name, window_title, start_time, end_time, duration\n         FROM sessions\n         ORDER BY id ASC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|error| format!("failed to read sessions for backup: {error}"))?;
    let sessions = session_rows
        .into_iter()
        .map(|row| BackupSession {
            id: row.get("id"),
            app_name: row.get("app_name"),
            exe_name: row.get("exe_name"),
            window_title: row.get("window_title"),
            start_time: row.get("start_time"),
            end_time: row.get("end_time"),
            duration: row.get("duration"),
        })
        .collect::<Vec<_>>();

    let setting_rows = sqlx::query("SELECT key, value FROM settings ORDER BY key ASC")
        .fetch_all(&pool)
        .await
        .map_err(|error| format!("failed to read settings for backup: {error}"))?;
    let settings = setting_rows
        .into_iter()
        .map(|row| BackupSetting {
            key: row.get("key"),
            value: row.get("value"),
        })
        .collect::<Vec<_>>();

    let icon_rows = sqlx::query("SELECT exe_name, icon_base64, last_updated FROM icon_cache")
        .fetch_all(&pool)
        .await
        .map_err(|error| format!("failed to read icon cache for backup: {error}"))?;
    let icon_cache = icon_rows
        .into_iter()
        .map(|row| BackupIconCache {
            exe_name: row.get("exe_name"),
            icon_base64: row.get("icon_base64"),
            last_updated: row.get("last_updated"),
        })
        .collect::<Vec<_>>();

    Ok(BackupPayload {
        version: 1,
        meta: BackupMeta {
            exported_at_ms: now_ms(),
            schema_version: 3,
            app_version: env!("CARGO_PKG_VERSION").to_string(),
        },
        sessions,
        settings,
        icon_cache,
    })
}

fn resolve_dialog_directory(initial_path: Option<String>) -> Option<PathBuf> {
    let raw = initial_path?.trim().to_string();
    if raw.is_empty() {
        return None;
    }

    let path = PathBuf::from(raw);
    if path.is_dir() {
        return Some(path);
    }

    path.parent().and_then(|parent| {
        if parent.as_os_str().is_empty() {
            None
        } else {
            Some(parent.to_path_buf())
        }
    })
}

#[tauri::command]
pub fn cmd_pick_backup_save_file(initial_path: Option<String>) -> Option<String> {
    let mut dialog = rfd::FileDialog::new().add_filter("Backup files", &["json", "ttbackup"]);
    if let Some(dir) = resolve_dialog_directory(initial_path) {
        dialog = dialog.set_directory(dir);
    }
    dialog = dialog.set_file_name(&backup_file_name());

    dialog.save_file().map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn cmd_pick_backup_file(initial_path: Option<String>) -> Option<String> {
    let mut dialog = rfd::FileDialog::new().add_filter("Backup files", &["json", "ttbackup"]);
    if let Some(dir) = resolve_dialog_directory(initial_path) {
        dialog = dialog.set_directory(dir);
    }

    dialog.pick_file().map(|path| path.to_string_lossy().to_string())
}

fn decode_backup_payload(raw_json: &str, source_path: &Path) -> Result<BackupPayload, String> {
    let payload = serde_json::from_str::<BackupPayload>(raw_json).map_err(|error| {
        format!(
            "failed to parse backup file `{}`: {error}",
            source_path.display()
        )
    })?;

    Ok(payload)
}

fn evaluate_backup_compatibility(payload: &BackupPayload) -> (String, String, bool) {
    if payload.version > CURRENT_BACKUP_VERSION {
        return (
            "incompatible".to_string(),
            format!(
                "备份格式版本 {} 高于当前支持的 {}，请升级应用后再恢复。",
                payload.version, CURRENT_BACKUP_VERSION
            ),
            false,
        );
    }

    if payload.version < CURRENT_BACKUP_VERSION {
        return (
            "legacy".to_string(),
            format!(
                "备份格式版本 {} 低于当前版本 {}，将按兼容模式尝试恢复。",
                payload.version, CURRENT_BACKUP_VERSION
            ),
            true,
        );
    }

    if payload.meta.schema_version > CURRENT_BACKUP_SCHEMA_VERSION {
        return (
            "incompatible".to_string(),
            format!(
                "备份 schema 版本 {} 高于当前支持的 {}，请升级应用后再恢复。",
                payload.meta.schema_version, CURRENT_BACKUP_SCHEMA_VERSION
            ),
            false,
        );
    }

    (
        "compatible".to_string(),
        "当前版本可直接恢复该备份。".to_string(),
        true,
    )
}

#[tauri::command]
pub async fn cmd_export_backup(backup_path: Option<String>, app: AppHandle) -> Result<String, String> {
    let payload = load_backup_payload(&app).await?;
    let target_path = resolve_backup_path(&app, backup_path)?;

    let serialized = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("failed to serialize backup payload: {error}"))?;
    fs::write(&target_path, serialized)
        .map_err(|error| format!("failed to write backup file: {error}"))?;

    Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn cmd_restore_backup(backup_path: String, app: AppHandle) -> Result<(), String> {
    let backup_path = PathBuf::from(backup_path.trim());
    if backup_path.as_os_str().is_empty() {
        return Err("backup path cannot be empty".to_string());
    }

    let raw_json = fs::read_to_string(&backup_path)
        .map_err(|error| format!("failed to read backup file `{}`: {error}", backup_path.display()))?;
    let payload = decode_backup_payload(&raw_json, &backup_path)?;
    let (_, compatibility_message, supported) = evaluate_backup_compatibility(&payload);
    if !supported {
        return Err(compatibility_message);
    }

    let pool = wait_for_sqlite_pool(&app).await?;
    restore_backup_payload(&pool, &payload).await?;

    let loaded = load_desktop_behavior_settings(&pool)
        .await
        .map_err(|error| format!("failed to reload desktop behavior after restore: {error}"))?;
    let state = app.state::<DesktopBehaviorState>();
    state.update_desktop(loaded.close_behavior, loaded.minimize_behavior);
    let next = state.update_launch(loaded.launch_at_login, loaded.start_minimized);
    apply_tray_visibility(&app, next);
    apply_autostart(&app, next.launch_at_login)?;

    app.emit(
        "tracking-data-changed",
        tracking_runtime::TrackingDataChangedPayload {
            reason: "backup-restored".to_string(),
            changed_at_ms: now_ms(),
        },
    )
    .map_err(|error| format!("failed to emit restore refresh event: {error}"))?;

    Ok(())
}

async fn restore_backup_payload(pool: &Pool<Sqlite>, payload: &BackupPayload) -> Result<(), String> {
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| format!("failed to start restore transaction: {error}"))?;

    sqlx::query("DELETE FROM sessions")
        .execute(&mut *tx)
        .await
        .map_err(|error| format!("failed to clear sessions before restore: {error}"))?;
    sqlx::query("DELETE FROM settings")
        .execute(&mut *tx)
        .await
        .map_err(|error| format!("failed to clear settings before restore: {error}"))?;
    sqlx::query("DELETE FROM icon_cache")
        .execute(&mut *tx)
        .await
        .map_err(|error| format!("failed to clear icon cache before restore: {error}"))?;

    for session in &payload.sessions {
        sqlx::query(
            "INSERT INTO sessions (\n               id, app_name, exe_name, window_title, start_time, end_time, duration\n             ) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(session.id)
        .bind(&session.app_name)
        .bind(&session.exe_name)
        .bind(&session.window_title)
        .bind(session.start_time)
        .bind(session.end_time)
        .bind(session.duration)
        .execute(&mut *tx)
        .await
        .map_err(|error| format!("failed to restore sessions: {error}"))?;
    }

    for setting in &payload.settings {
        sqlx::query("INSERT INTO settings (key, value) VALUES (?, ?)")
            .bind(&setting.key)
            .bind(&setting.value)
            .execute(&mut *tx)
            .await
            .map_err(|error| format!("failed to restore settings: {error}"))?;
    }

    for icon in &payload.icon_cache {
        sqlx::query("INSERT INTO icon_cache (exe_name, icon_base64, last_updated) VALUES (?, ?, ?)")
            .bind(&icon.exe_name)
            .bind(&icon.icon_base64)
            .bind(icon.last_updated)
            .execute(&mut *tx)
            .await
            .map_err(|error| format!("failed to restore icon cache: {error}"))?;
    }

    tx.commit()
        .await
        .map_err(|error| format!("failed to commit restore transaction: {error}"))?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_preview_backup(backup_path: String) -> Result<BackupPreview, String> {
    let backup_path = PathBuf::from(backup_path.trim());
    if backup_path.as_os_str().is_empty() {
        return Err("backup path cannot be empty".to_string());
    }

    let raw_json = fs::read_to_string(&backup_path)
        .map_err(|error| format!("failed to read backup file `{}`: {error}", backup_path.display()))?;
    let payload = decode_backup_payload(&raw_json, &backup_path)?;
    let (compatibility_level, compatibility_message, _) = evaluate_backup_compatibility(&payload);

    Ok(BackupPreview {
        version: payload.version,
        exported_at_ms: payload.meta.exported_at_ms,
        schema_version: payload.meta.schema_version,
        app_version: payload.meta.app_version,
        compatibility_level,
        compatibility_message,
        session_count: payload.sessions.len(),
        setting_count: payload.settings.len(),
        icon_cache_count: payload.icon_cache.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db_schema;
    use sqlx::{Executor, SqlitePool};

    async fn setup_test_db() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        pool.execute(db_schema::MIGRATION_1_SQL).await.unwrap();
        pool.execute(db_schema::MIGRATION_2_SQL).await.unwrap();
        pool.execute(db_schema::MIGRATION_3_SQL).await.unwrap();
        pool
    }

    #[test]
    fn restore_backup_payload_rolls_back_when_insert_fails() {
        tauri::async_runtime::block_on(async {
            let pool = setup_test_db().await;

            sqlx::query(
                "INSERT INTO sessions (app_name, exe_name, window_title, start_time, end_time, duration)\n                 VALUES ('Baseline App', 'baseline.exe', 'Baseline Window', 1000, 2000, 1000)",
            )
            .execute(&pool)
            .await
            .unwrap();
            sqlx::query("INSERT INTO settings (key, value) VALUES ('baseline_key', 'baseline_value')")
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query(
                "INSERT INTO icon_cache (exe_name, icon_base64, last_updated)\n                 VALUES ('baseline.exe', 'aWNvbg==', 1234)",
            )
            .execute(&pool)
            .await
            .unwrap();

            let bad_payload = BackupPayload {
                version: CURRENT_BACKUP_VERSION,
                meta: BackupMeta {
                    exported_at_ms: 1,
                    schema_version: CURRENT_BACKUP_SCHEMA_VERSION,
                    app_version: "test".to_string(),
                },
                sessions: vec![BackupSession {
                    id: 100,
                    app_name: "New App".to_string(),
                    exe_name: "new.exe".to_string(),
                    window_title: Some("New Window".to_string()),
                    start_time: 3000,
                    end_time: Some(4000),
                    duration: Some(1000),
                }],
                settings: vec![
                    BackupSetting {
                        key: "dup_key".to_string(),
                        value: "v1".to_string(),
                    },
                    BackupSetting {
                        key: "dup_key".to_string(),
                        value: "v2".to_string(),
                    },
                ],
                icon_cache: vec![BackupIconCache {
                    exe_name: "new.exe".to_string(),
                    icon_base64: "bmV3aWNvbg==".to_string(),
                    last_updated: Some(5678),
                }],
            };

            let result = restore_backup_payload(&pool, &bad_payload).await;
            assert!(result.is_err());
            assert!(
                result.unwrap_err().contains("failed to restore settings"),
                "restore should fail in settings stage"
            );

            let session_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM sessions WHERE exe_name = 'baseline.exe'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            let setting_value: Option<String> =
                sqlx::query_scalar("SELECT value FROM settings WHERE key = 'baseline_key' LIMIT 1")
                    .fetch_optional(&pool)
                    .await
                    .unwrap();
            let icon_count: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM icon_cache WHERE exe_name = 'baseline.exe'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();

            assert_eq!(session_count, 1, "original session should be preserved");
            assert_eq!(
                setting_value.as_deref(),
                Some("baseline_value"),
                "original setting should be preserved"
            );
            assert_eq!(icon_count, 1, "original icon cache should be preserved");
        });
    }
}
