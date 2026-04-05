mod db_schema;
mod icon_extractor;
mod power_watcher;
mod tracker;
mod tracking_runtime;

use serde::{Deserialize, Serialize};
use sqlx::{Pool, Row, Sqlite};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuEvent, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime, State, Window, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
use tauri_plugin_sql::{DbInstances, DbPool};
use tokio::time::{sleep, Duration};

const DB_NAME: &str = "sqlite:timetracker.db";
const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_ID: &str = "main";
const TRAY_MENU_SHOW_ID: &str = "tray-show-main";
const TRAY_MENU_TOGGLE_PAUSE_ID: &str = "tray-toggle-pause";
const TRAY_MENU_QUIT_ID: &str = "tray-quit";
const CLOSE_BEHAVIOR_KEY: &str = "close_behavior";
const MINIMIZE_BEHAVIOR_KEY: &str = "minimize_behavior";
const TRACKING_PAUSED_KEY: &str = "tracking_paused";
const LAUNCH_AT_LOGIN_KEY: &str = "launch_at_login";
const START_MINIMIZED_KEY: &str = "start_minimized";
const AUTOSTART_ARG: &str = "--autostart";
const BACKUP_FILE_EXT: &str = "ttbackup.json";
const CURRENT_BACKUP_VERSION: u32 = 1;
const CURRENT_BACKUP_SCHEMA_VERSION: u32 = 3;

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum CloseBehavior {
    Exit,
    #[default]
    Tray,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum MinimizeBehavior {
    #[default]
    Taskbar,
    Tray,
}

#[derive(Clone, Copy, Debug)]
struct DesktopBehaviorSettings {
    close_behavior: CloseBehavior,
    minimize_behavior: MinimizeBehavior,
    launch_at_login: bool,
    start_minimized: bool,
}

impl Default for DesktopBehaviorSettings {
    fn default() -> Self {
        Self {
            close_behavior: CloseBehavior::Tray,
            minimize_behavior: MinimizeBehavior::Taskbar,
            launch_at_login: false,
            start_minimized: true,
        }
    }
}

impl DesktopBehaviorSettings {
    fn should_keep_tray_visible(self) -> bool {
        self.close_behavior == CloseBehavior::Tray
            || self.minimize_behavior == MinimizeBehavior::Tray
    }

    fn should_start_minimized_on_autostart(self) -> bool {
        self.launch_at_login && self.start_minimized
    }
}

#[derive(Debug, Default)]
struct DesktopBehaviorState {
    inner: Mutex<DesktopBehaviorSettings>,
}

impl DesktopBehaviorState {
    fn snapshot(&self) -> DesktopBehaviorSettings {
        match self.inner.lock() {
            Ok(guard) => *guard,
            Err(poisoned) => *poisoned.into_inner(),
        }
    }

    fn update_desktop(
        &self,
        close_behavior: CloseBehavior,
        minimize_behavior: MinimizeBehavior,
    ) -> DesktopBehaviorSettings {
        match self.inner.lock() {
            Ok(mut guard) => {
                guard.close_behavior = close_behavior;
                guard.minimize_behavior = minimize_behavior;
                *guard
            }
            Err(poisoned) => {
                let mut guard = poisoned.into_inner();
                guard.close_behavior = close_behavior;
                guard.minimize_behavior = minimize_behavior;
                *guard
            }
        }
    }

    fn update_launch(
        &self,
        launch_at_login: bool,
        start_minimized: bool,
    ) -> DesktopBehaviorSettings {
        match self.inner.lock() {
            Ok(mut guard) => {
                guard.launch_at_login = launch_at_login;
                guard.start_minimized = start_minimized;
                *guard
            }
            Err(poisoned) => {
                let mut guard = poisoned.into_inner();
                guard.launch_at_login = launch_at_login;
                guard.start_minimized = start_minimized;
                *guard
            }
        }
    }
}

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
struct BackupPreview {
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


#[tauri::command]
fn get_icon(exe_path: String) -> Option<String> {
    icon_extractor::get_icon_base64(&exe_path)
}

#[tauri::command]
fn cmd_set_desktop_behavior(
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
fn cmd_set_launch_behavior(
    launch_at_login: bool,
    start_minimized: bool,
    app: AppHandle,
    desktop_behavior_state: State<DesktopBehaviorState>,
) -> Result<(), String> {
    let next = desktop_behavior_state.update_launch(launch_at_login, start_minimized);
    apply_autostart(&app, next.launch_at_login)?;
    Ok(())
}

fn default_backup_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data dir: {error}"))?;
    let backup_dir = app_data_dir.join("backups");
    fs::create_dir_all(&backup_dir)
        .map_err(|error| format!("failed to create backup dir: {error}"))?;

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


async fn load_backup_payload<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<BackupPayload, String> {
    let pool = wait_for_sqlite_pool(app).await?;

    let session_rows = sqlx::query(
        "SELECT id, app_name, exe_name, window_title, start_time, end_time, duration
         FROM sessions
         ORDER BY id ASC",
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
fn cmd_pick_backup_save_file(initial_path: Option<String>) -> Option<String> {
    let mut dialog = rfd::FileDialog::new().add_filter("Backup files", &["json", "ttbackup"]);
    if let Some(dir) = resolve_dialog_directory(initial_path) {
        dialog = dialog.set_directory(dir);
    }
    dialog = dialog.set_file_name(&backup_file_name());

    dialog
        .save_file()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn cmd_pick_backup_file(initial_path: Option<String>) -> Option<String> {
    let mut dialog = rfd::FileDialog::new().add_filter("Backup files", &["json", "ttbackup"]);
    if let Some(dir) = resolve_dialog_directory(initial_path) {
        dialog = dialog.set_directory(dir);
    }

    dialog
        .pick_file()
        .map(|path| path.to_string_lossy().to_string())
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
async fn cmd_export_backup(backup_path: Option<String>, app: AppHandle) -> Result<String, String> {
    let payload = load_backup_payload(&app).await?;
    let target_path = resolve_backup_path(&app, backup_path)?;

    let serialized = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("failed to serialize backup payload: {error}"))?;
    fs::write(&target_path, serialized)
        .map_err(|error| format!("failed to write backup file: {error}"))?;

    Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn cmd_restore_backup(backup_path: String, app: AppHandle) -> Result<(), String> {
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
            "INSERT INTO sessions (
               id, app_name, exe_name, window_title, start_time, end_time, duration
             ) VALUES (?, ?, ?, ?, ?, ?, ?)",
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
async fn cmd_preview_backup(backup_path: String) -> Result<BackupPreview, String> {
    let backup_path = PathBuf::from(backup_path.trim());
    if backup_path.as_os_str().is_empty() {
        return Err("backup path cannot be empty".to_string());
    }

    let raw_json = fs::read_to_string(&backup_path).map_err(|error| {
        format!(
            "failed to read backup file `{}`: {error}",
            backup_path.display()
        )
    })?;
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

fn parse_close_behavior(raw: &str) -> CloseBehavior {
    if raw.trim().eq_ignore_ascii_case("exit") {
        CloseBehavior::Exit
    } else {
        CloseBehavior::Tray
    }
}

fn parse_minimize_behavior(raw: &str) -> MinimizeBehavior {
    if raw.trim().eq_ignore_ascii_case("tray") {
        MinimizeBehavior::Tray
    } else {
        MinimizeBehavior::Taskbar
    }
}

fn parse_boolean_setting(raw: &str, fallback: bool) -> bool {
    match raw.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => true,
        "0" | "false" | "no" | "off" => false,
        _ => fallback,
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

async fn load_tracking_paused_setting(pool: &Pool<Sqlite>) -> Result<bool, sqlx::Error> {
    let row = sqlx::query("SELECT value FROM settings WHERE key = ? LIMIT 1")
        .bind(TRACKING_PAUSED_KEY)
        .fetch_optional(pool)
        .await?;

    Ok(row
        .and_then(|row| row.try_get::<String, _>("value").ok())
        .map(|value| parse_boolean_setting(&value, false))
        .unwrap_or(false))
}

async fn save_tracking_paused_setting(
    pool: &Pool<Sqlite>,
    tracking_paused: bool,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(TRACKING_PAUSED_KEY)
    .bind(if tracking_paused { "1" } else { "0" })
    .execute(pool)
    .await?;

    Ok(())
}

async fn toggle_tracking_paused<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let pool = wait_for_sqlite_pool(&app).await?;
    let current = load_tracking_paused_setting(&pool)
        .await
        .map_err(|error| format!("failed to load tracking pause setting: {error}"))?;
    let next = !current;

    save_tracking_paused_setting(&pool, next)
        .await
        .map_err(|error| format!("failed to save tracking pause setting: {error}"))?;

    let reason = if next {
        "tracking-paused"
    } else {
        "tracking-resumed"
    };
    app.emit(
        "tracking-data-changed",
        tracking_runtime::TrackingDataChangedPayload {
            reason: reason.to_string(),
            changed_at_ms: now_ms(),
        },
    )
    .map_err(|error| format!("failed to emit tracking pause event: {error}"))?;

    Ok(())
}

fn was_launched_by_autostart() -> bool {
    std::env::args().any(|arg| arg == AUTOSTART_ARG)
}

fn apply_autostart<R: Runtime>(app: &AppHandle<R>, launch_at_login: bool) -> Result<(), String> {
    let autostart_manager = app.autolaunch();

    if launch_at_login {
        autostart_manager
            .enable()
            .map_err(|error| format!("failed to enable autostart: {error}"))?;
    } else {
        autostart_manager
            .disable()
            .map_err(|error| format!("failed to disable autostart: {error}"))?;
    }

    Ok(())
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn apply_tray_visibility<R: Runtime>(app: &AppHandle<R>, settings: DesktopBehaviorSettings) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        if let Err(error) = tray.set_visible(settings.should_keep_tray_visible()) {
            eprintln!("[tray] failed to apply visibility: {error}");
        }
    }
}

fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    if event.id() == TRAY_MENU_SHOW_ID {
        show_main_window(app);
        return;
    }

    if event.id() == TRAY_MENU_TOGGLE_PAUSE_ID {
        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) = toggle_tracking_paused(app_handle).await {
                eprintln!("[tray] failed to toggle tracking pause: {error}");
            }
        });
        return;
    }

    if event.id() == TRAY_MENU_QUIT_ID {
        app.exit(0);
    }
}

fn handle_tray_icon_event<R: Runtime>(app: &AppHandle<R>, event: TrayIconEvent) {
    match event {
        TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
        }
        | TrayIconEvent::DoubleClick {
            button: MouseButton::Left,
            ..
        } => {
            show_main_window(app);
        }
        _ => {}
    }
}

fn handle_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if window.label() != MAIN_WINDOW_LABEL {
        return;
    }

    let app = window.app_handle();
    let state = app.state::<DesktopBehaviorState>();
    let settings = state.snapshot();

    if let WindowEvent::CloseRequested { api, .. } = event {
        if settings.close_behavior == CloseBehavior::Tray && settings.should_keep_tray_visible() {
            api.prevent_close();
            let _ = window.hide();
        }
        return;
    }

    if settings.minimize_behavior == MinimizeBehavior::Tray
        && settings.should_keep_tray_visible()
        && window.is_minimized().unwrap_or(false)
    {
        let _ = window.hide();
    }
}

fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, TRAY_MENU_SHOW_ID, "打开主界面", true, None::<&str>)?;
    let toggle_pause_item = MenuItem::with_id(
        app,
        TRAY_MENU_TOGGLE_PAUSE_ID,
        "暂停/恢复追踪",
        true,
        None::<&str>,
    )?;
    let quit_item = MenuItem::with_id(app, TRAY_MENU_QUIT_ID, "退出应用", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &toggle_pause_item, &quit_item])?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip("Time Tracker")
        .show_menu_on_left_click(true);

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}
async fn wait_for_sqlite_pool<R: Runtime>(app: &AppHandle<R>) -> Result<Pool<Sqlite>, String> {
    let mut wait_cycles: u64 = 0;

    loop {
        if let Some(instances) = app.try_state::<DbInstances>() {
            let instances = instances.0.read().await;
            if let Some(DbPool::Sqlite(pool)) = instances.get(DB_NAME) {
                return Ok(pool.clone());
            }
        }

        wait_cycles += 1;
        if wait_cycles > 300 {
            return Err("sqlite pool not available in time".to_string());
        }

        sleep(Duration::from_millis(100)).await;
    }
}

async fn load_desktop_behavior_settings(
    pool: &Pool<Sqlite>,
) -> Result<DesktopBehaviorSettings, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?)",
    )
    .bind(CLOSE_BEHAVIOR_KEY)
    .bind(MINIMIZE_BEHAVIOR_KEY)
    .bind(LAUNCH_AT_LOGIN_KEY)
    .bind(START_MINIMIZED_KEY)
    .fetch_all(pool)
    .await?;

    let mut close_behavior = None;
    let mut minimize_behavior = None;
    let mut launch_at_login = None;
    let mut start_minimized = None;

    for row in rows {
        let key: String = row.get("key");
        let value: String = row.get("value");

        match key.as_str() {
            CLOSE_BEHAVIOR_KEY => close_behavior = Some(parse_close_behavior(&value)),
            MINIMIZE_BEHAVIOR_KEY => {
                minimize_behavior = Some(parse_minimize_behavior(&value));
            }
            LAUNCH_AT_LOGIN_KEY => launch_at_login = Some(parse_boolean_setting(&value, false)),
            START_MINIMIZED_KEY => start_minimized = Some(parse_boolean_setting(&value, true)),
            _ => {}
        }
    }

    Ok(DesktopBehaviorSettings {
        close_behavior: close_behavior.unwrap_or_default(),
        minimize_behavior: minimize_behavior.unwrap_or_default(),
        launch_at_login: launch_at_login.unwrap_or(false),
        start_minimized: start_minimized.unwrap_or(true),
    })
}

async fn sync_desktop_behavior_from_storage<R: Runtime>(
    app: AppHandle<R>,
    launched_by_autostart: bool,
) -> Result<(), String> {
    let pool = wait_for_sqlite_pool(&app).await?;
    let loaded = load_desktop_behavior_settings(&pool)
        .await
        .map_err(|error| format!("failed to load desktop behavior settings: {error}"))?;

    let state = app.state::<DesktopBehaviorState>();
    state.update_desktop(loaded.close_behavior, loaded.minimize_behavior);
    let next = state.update_launch(loaded.launch_at_login, loaded.start_minimized);

    apply_autostart(&app, next.launch_at_login)?;
    apply_tray_visibility(&app, next);

    if launched_by_autostart {
        if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
            if next.should_start_minimized_on_autostart() {
                let _ = window.hide();
            } else {
                let _ = window.show();
                let _ = window.unminimize();
            }
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let runtime_health = Arc::new(tracking_runtime::RuntimeHealthState::default());
    let launched_by_autostart = was_launched_by_autostart();

    tauri::Builder::default()
        .manage(DesktopBehaviorState::default())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(vec![AUTOSTART_ARG.to_string()])
                .build(),
        )
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:timetracker.db", db_schema::tracker_migrations())
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_icon,
            tracker::get_current_active_window,
            tracker::cmd_set_afk_timeout,
            cmd_set_desktop_behavior,
            cmd_set_launch_behavior,
            cmd_pick_backup_save_file,
            cmd_pick_backup_file,
            cmd_preview_backup,
            cmd_export_backup,
            cmd_restore_backup
        ])
        .on_menu_event(handle_menu_event)
        .on_tray_icon_event(handle_tray_icon_event)
        .on_window_event(handle_window_event)
        .setup(move |app| {
            power_watcher::start(app.handle().clone());

            let app_handle = app.handle().clone();
            setup_tray(&app_handle)?;
            let desktop_behavior = app_handle.state::<DesktopBehaviorState>().snapshot();
            apply_tray_visibility(&app_handle, desktop_behavior);
            if launched_by_autostart {
                if let Some(window) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) {
                    let _ = window.hide();
                }
            }

            let behavior_sync_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = sync_desktop_behavior_from_storage(
                    behavior_sync_handle,
                    launched_by_autostart,
                )
                .await
                {
                    eprintln!("[tray] failed to sync desktop behavior from storage: {error}");
                }
            });

            let app_handle = app.handle().clone();
            let runtime_state = runtime_health.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    if let Err(error) =
                        tracking_runtime::run(app_handle.clone(), runtime_state.clone()).await
                    {
                        eprintln!("[tracker] tracking runtime stopped: {error}");
                        eprintln!("[tracker] restarting tracking runtime in 2 seconds...");
                        sleep(Duration::from_secs(2)).await;
                        continue;
                    }

                    break;
                }
            });

            let watchdog_handle = app.handle().clone();
            let watchdog_state = runtime_health.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    if let Err(error) =
                        tracking_runtime::watch(watchdog_handle.clone(), watchdog_state.clone())
                            .await
                    {
                        eprintln!("[tracker] watchdog stopped: {error}");
                        eprintln!("[tracker] restarting watchdog in 2 seconds...");
                        sleep(Duration::from_secs(2)).await;
                        continue;
                    }

                    break;
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
                "INSERT INTO sessions (app_name, exe_name, window_title, start_time, end_time, duration)
                 VALUES ('Baseline App', 'baseline.exe', 'Baseline Window', 1000, 2000, 1000)",
            )
            .execute(&pool)
            .await
            .unwrap();
            sqlx::query("INSERT INTO settings (key, value) VALUES ('baseline_key', 'baseline_value')")
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query(
                "INSERT INTO icon_cache (exe_name, icon_base64, last_updated)
                 VALUES ('baseline.exe', 'aWNvbg==', 1234)",
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
                result
                    .unwrap_err()
                    .contains("failed to restore settings"),
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


