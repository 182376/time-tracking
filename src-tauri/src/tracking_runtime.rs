use crate::{icon_extractor, tracker};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Row, Sqlite};
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::sync::{
    atomic::{AtomicI64, Ordering},
    Arc,
};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_sql::{DbInstances, DbPool};
use tokio::task::spawn_blocking;
use tokio::time::{sleep, timeout, Duration};
use windows::core::PCWSTR;
use windows::Win32::Storage::FileSystem::{
    GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW,
};

const DB_NAME: &str = "sqlite:timetracker.db";
const TRACKER_LAST_HEARTBEAT_KEY: &str = "__tracker_last_heartbeat_ms";
const TRACKER_LAST_SUCCESSFUL_SAMPLE_KEY: &str = "__tracker_last_successful_sample_ms";
const DEFAULT_AFK_TIMEOUT_SECS: u64 = 300;
const WINDOW_POLL_TIMEOUT_SECS: u64 = 3;
const TRACKER_WATCHDOG_POLL_MS: u64 = 1_000;
const TRACKER_STALL_SEAL_AFTER_MS: i64 = 8_000;
const VERSION_INFO_NAME_KEYS: [&str; 2] = ["FileDescription", "ProductName"];

#[repr(C)]
#[derive(Clone, Copy)]
struct LangAndCodePage {
    language: u16,
    code_page: u16,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TrackingDataChangedPayload {
    pub reason: String,
    pub changed_at_ms: u64,
}

#[derive(Clone, Debug)]
struct ActiveSessionSnapshot {
    start_time: i64,
    exe_name: String,
    window_title: String,
}

#[derive(Clone, Copy, Debug, Default)]
struct WindowTransitionDecision {
    reason: &'static str,
    should_end_previous: bool,
    should_start_next: bool,
    should_refresh_metadata: bool,
    end_time_override: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct WindowSessionIdentity {
    app_key: String,
    instance_key: String,
}

#[derive(Debug, Default)]
pub struct RuntimeHealthState {
    last_successful_sample_ms: AtomicI64,
    last_watchdog_seal_sample_ms: AtomicI64,
}

impl RuntimeHealthState {
    pub fn note_successful_sample(&self, timestamp_ms: i64) {
        self.last_successful_sample_ms
            .store(timestamp_ms, Ordering::Relaxed);
    }

    fn last_successful_sample_ms(&self) -> Option<i64> {
        let timestamp_ms = self.last_successful_sample_ms.load(Ordering::Relaxed);
        (timestamp_ms > 0).then_some(timestamp_ms)
    }

    fn note_watchdog_seal(&self, timestamp_ms: i64) {
        self.last_watchdog_seal_sample_ms
            .store(timestamp_ms, Ordering::Relaxed);
    }

    fn last_watchdog_seal_sample_ms(&self) -> Option<i64> {
        let timestamp_ms = self.last_watchdog_seal_sample_ms.load(Ordering::Relaxed);
        (timestamp_ms > 0).then_some(timestamp_ms)
    }
}

pub async fn run<R: Runtime>(
    app: AppHandle<R>,
    health_state: Arc<RuntimeHealthState>,
) -> Result<(), String> {
    let pool = wait_for_sqlite_pool(&app).await?;
    initialize_tracker(&app, &pool)
        .await
        .map_err(|error| format!("tracker initialization failed: {error}"))?;

    let mut last_window: Option<tracker::WindowInfo> = None;
    let mut last_emitted_window: Option<tracker::WindowInfo> = None;

    loop {
        let window_info = poll_active_window_with_timeout().await?;
        let now_ms = now_ms();
        health_state.note_successful_sample(now_ms);

        if let Err(error) =
            save_tracker_timestamp(&pool, TRACKER_LAST_SUCCESSFUL_SAMPLE_KEY, now_ms).await
        {
            log_tracker_error(format!("failed to save tracker sample timestamp: {error}"));
        }

        if let Err(error) = save_tracker_timestamp(&pool, TRACKER_LAST_HEARTBEAT_KEY, now_ms).await
        {
            log_tracker_error(format!("failed to save tracker heartbeat: {error}"));
        }

        if tracker::has_meaningful_change(last_emitted_window.as_ref(), &window_info) {
            let _ = app.emit("active-window-changed", &window_info);
            last_emitted_window = Some(window_info.clone());
        }

        match apply_window_transition(&pool, last_window.as_ref(), &window_info, now_ms).await {
            Ok(Some(reason)) => {
                let _ = emit_tracking_data_changed(&app, reason, now_ms as u64);
            }
            Ok(None) => {}
            Err(error) => {
                log_tracker_error(format!("failed to apply window transition: {error}"));
            }
        }

        last_window = Some(window_info);
        sleep(Duration::from_secs(2)).await;
    }
}

pub async fn watch<R: Runtime>(
    app: AppHandle<R>,
    health_state: Arc<RuntimeHealthState>,
) -> Result<(), String> {
    let pool = wait_for_sqlite_pool(&app).await?;

    loop {
        let now_ms = now_ms();
        let last_successful_sample_ms = health_state.last_successful_sample_ms();
        let last_watchdog_seal_sample_ms = health_state.last_watchdog_seal_sample_ms();

        if should_watchdog_seal(
            last_successful_sample_ms,
            last_watchdog_seal_sample_ms,
            now_ms,
        ) {
            let sample_time_ms = last_successful_sample_ms.unwrap_or_default();
            match end_active_sessions(&pool, sample_time_ms).await {
                Ok(did_seal) => {
                    health_state.note_watchdog_seal(sample_time_ms);

                    if did_seal {
                        log_tracker_error(format!(
                            "watchdog sealed stale active session at {} after tracker stall",
                            sample_time_ms
                        ));
                        let _ = emit_tracking_data_changed(
                            &app,
                            "watchdog-sealed",
                            sample_time_ms as u64,
                        );
                    }
                }
                Err(error) => {
                    log_tracker_error(format!("watchdog failed to seal stale session: {error}"));
                }
            }
        }

        sleep(Duration::from_millis(TRACKER_WATCHDOG_POLL_MS)).await;
    }
}

pub async fn handle_power_lifecycle_event<R: Runtime>(
    app: AppHandle<R>,
    state: &str,
    timestamp_ms: i64,
) -> Result<(), String> {
    let pool = wait_for_sqlite_pool(&app).await?;
    let reason = apply_power_lifecycle_event(&pool, state, timestamp_ms)
        .await
        .map_err(|error| format!("power lifecycle transition failed: {error}"))?;

    if let Some(reason) = reason {
        let _ = emit_tracking_data_changed(&app, reason, timestamp_ms as u64);
    }

    Ok(())
}

async fn poll_active_window_with_timeout() -> Result<tracker::WindowInfo, String> {
    match timeout(
        Duration::from_secs(WINDOW_POLL_TIMEOUT_SECS),
        spawn_blocking(tracker::get_active_window),
    )
    .await
    {
        Ok(Ok(window_info)) => Ok(window_info),
        Ok(Err(error)) => Err(format!("active window poll task failed: {error}")),
        Err(_) => Err(format!(
            "active window poll timed out after {} seconds",
            WINDOW_POLL_TIMEOUT_SECS
        )),
    }
}

async fn wait_for_sqlite_pool<R: Runtime>(app: &AppHandle<R>) -> Result<Pool<Sqlite>, String> {
    let mut wait_cycles: u64 = 0;

    loop {
        if let Some(instances) = app.try_state::<DbInstances>() {
            let instances = instances.0.read().await;
            if let Some(DbPool::Sqlite(pool)) = instances.get(DB_NAME) {
                if wait_cycles > 0 {
                    eprintln!(
                        "[tracker] sqlite pool became available after {} ms",
                        wait_cycles * 100
                    );
                }
                return Ok(pool.clone());
            }
        }

        if wait_cycles == 0 || wait_cycles % 50 == 0 {
            eprintln!("[tracker] waiting for sqlite pool `{DB_NAME}`...");
        }

        wait_cycles += 1;
        sleep(Duration::from_millis(100)).await;
    }
}

async fn initialize_tracker<R: Runtime>(
    app: &AppHandle<R>,
    pool: &Pool<Sqlite>,
) -> Result<(), sqlx::Error> {
    let afk_timeout_secs = load_afk_timeout_secs(pool).await?;
    tracker::cmd_set_afk_timeout(afk_timeout_secs);

    if let Some(existing_session) = load_active_session(pool).await? {
        let last_heartbeat_ms = load_tracker_heartbeat(pool).await?;
        let end_time =
            resolve_startup_seal_time(existing_session.start_time, last_heartbeat_ms, now_ms());

        if end_active_sessions(pool, end_time).await? {
            let _ = emit_tracking_data_changed(app, "startup-sealed", end_time as u64);
        }
    }

    Ok(())
}

async fn apply_window_transition(
    pool: &Pool<Sqlite>,
    previous_window: Option<&tracker::WindowInfo>,
    next_window: &tracker::WindowInfo,
    now_ms: i64,
) -> Result<Option<&'static str>, sqlx::Error> {
    let decision = plan_window_transition(previous_window, next_window, now_ms);
    if !decision.should_end_previous
        && !decision.should_start_next
        && !decision.should_refresh_metadata
    {
        return recover_missing_active_session(pool, next_window, now_ms).await;
    }

    let mut did_mutate = false;

    if decision.should_end_previous {
        did_mutate |=
            end_active_sessions(pool, decision.end_time_override.unwrap_or(now_ms)).await?;
    }

    if decision.should_start_next {
        did_mutate |= start_session(pool, next_window, now_ms).await?;
    }

    if decision.should_refresh_metadata {
        did_mutate |= refresh_active_session_metadata(pool, next_window).await?;
    }

    if !did_mutate {
        return Ok(None);
    }

    Ok(Some(
        if decision.should_end_previous && decision.should_start_next {
            "session-transition"
        } else if decision.should_end_previous {
            "session-ended"
        } else if decision.should_start_next {
            "session-started"
        } else {
            decision.reason
        },
    ))
}

async fn recover_missing_active_session(
    pool: &Pool<Sqlite>,
    window: &tracker::WindowInfo,
    now_ms: i64,
) -> Result<Option<&'static str>, sqlx::Error> {
    if !is_trackable_window(Some(window)) {
        return Ok(None);
    }

    if load_active_session(pool).await?.is_some() {
        return Ok(None);
    }

    if start_session(pool, window, now_ms).await? {
        return Ok(Some("session-recovered"));
    }

    Ok(None)
}

async fn apply_power_lifecycle_event(
    pool: &Pool<Sqlite>,
    state: &str,
    timestamp_ms: i64,
) -> Result<Option<&'static str>, sqlx::Error> {
    let should_end_active_session = matches!(state, "lock" | "suspend");

    if !should_end_active_session {
        return Ok(None);
    }

    if end_active_sessions(pool, timestamp_ms).await? {
        return Ok(Some(match state {
            "lock" => "session-ended-lock",
            "suspend" => "session-ended-suspend",
            _ => "session-ended-system",
        }));
    }

    Ok(None)
}

fn plan_window_transition(
    previous_window: Option<&tracker::WindowInfo>,
    next_window: &tracker::WindowInfo,
    now_ms: i64,
) -> WindowTransitionDecision {
    let last_trackable = is_trackable_window(previous_window);
    let next_trackable = is_trackable_window(Some(next_window));
    let previous_identity = resolve_window_session_identity(previous_window);
    let next_identity = resolve_window_session_identity(Some(next_window));
    let app_changed = match (previous_identity.as_ref(), next_identity.as_ref()) {
        (Some(previous), Some(next)) => previous.app_key != next.app_key,
        _ => last_trackable != next_trackable,
    };
    let instance_changed = match (previous_identity.as_ref(), next_identity.as_ref()) {
        (Some(previous), Some(next)) => previous.instance_key != next.instance_key,
        _ => false,
    };
    let tracking_state_changed = last_trackable != next_trackable;
    let did_change = app_changed || tracking_state_changed;
    let should_end_previous = last_trackable && did_change;
    let should_start_next = next_trackable && did_change;
    let title_changed = previous_window
        .map(|window| window.title != next_window.title)
        .unwrap_or(false);
    let should_refresh_metadata =
        !did_change && next_trackable && (title_changed || instance_changed);
    let reason = if app_changed {
        "session-transition-app-change"
    } else if tracking_state_changed {
        "session-transition-state-change"
    } else if should_refresh_metadata {
        "session-metadata-refreshed"
    } else if instance_changed {
        "session-instance-unchanged-app"
    } else {
        "session-no-change"
    };

    WindowTransitionDecision {
        reason,
        should_end_previous,
        should_start_next,
        should_refresh_metadata,
        end_time_override: if should_end_previous && !next_trackable && next_window.is_afk {
            Some(now_ms - i64::from(next_window.idle_time_ms))
        } else {
            None
        },
    }
}

fn resolve_window_session_identity(
    window: Option<&tracker::WindowInfo>,
) -> Option<WindowSessionIdentity> {
    let window = window?;
    if !is_trackable_window(Some(window)) {
        return None;
    }

    let app_key = window.exe_name.to_lowercase();
    let root_owner_key = if window.root_owner_hwnd.is_empty() {
        window.hwnd.as_str()
    } else {
        window.root_owner_hwnd.as_str()
    };
    let class_key = window.window_class.to_lowercase();
    let instance_key = format!(
        "{}|pid:{}|root:{}|class:{}",
        app_key, window.process_id, root_owner_key, class_key
    );

    Some(WindowSessionIdentity {
        app_key,
        instance_key,
    })
}

fn is_trackable_window(window: Option<&tracker::WindowInfo>) -> bool {
    let Some(window) = window else {
        return false;
    };

    !window.exe_name.is_empty() && !window.is_afk && should_track(&window.exe_name)
}

fn should_track(exe_name: &str) -> bool {
    let lower_name = exe_name.to_lowercase();

    if matches!(
        lower_name.as_str(),
        "time_tracker.exe"
            | "powershell.exe"
            | "pwsh.exe"
            | "cmd.exe"
            | "windowsterminal.exe"
            | "wt.exe"
            | "explorer.exe"
            | "taskmgr.exe"
            | "regedit.exe"
            | "mmc.exe"
            | "control.exe"
            | "searchhost.exe"
            | "searchapp.exe"
            | "searchindexer.exe"
            | "shellexperiencehost.exe"
            | "startmenuexperiencehost.exe"
            | "applicationframehost.exe"
            | "textinputhost.exe"
            | "runtimebroker.exe"
            | "taskhostw.exe"
            | "consent.exe"
            | "lockapp.exe"
            | "logonui.exe"
            | "sihost.exe"
            | "dwm.exe"
            | "ctfmon.exe"
            | "fontdrvhost.exe"
            | "securityhealthsystray.exe"
            | "smartscreen.exe"
            | "winlogon.exe"
            | "userinit.exe"
            | "pickerhost.exe"
    ) {
        return false;
    }

    if is_likely_system_process(&lower_name) {
        return false;
    }

    true
}

fn is_likely_system_process(lower_name: &str) -> bool {
    (lower_name.starts_with("search") && lower_name.ends_with(".exe"))
        || (lower_name.ends_with("host.exe")
            && (lower_name.contains("experience")
                || lower_name.contains("runtime")
                || lower_name.contains("task")
                || lower_name.contains("applicationframe")
                || lower_name.contains("textinput")
                || lower_name.contains("fontdrv")))
        || lower_name.ends_with("broker.exe")
        || lower_name.ends_with("systray.exe")
        || matches!(lower_name, "svchost.exe" | "dllhost.exe" | "conhost.exe")
}

fn resolve_startup_seal_time(
    session_start_time: i64,
    last_heartbeat_ms: Option<i64>,
    now_ms: i64,
) -> i64 {
    let Some(last_heartbeat_ms) = last_heartbeat_ms else {
        return now_ms;
    };

    now_ms.min(session_start_time.max(last_heartbeat_ms))
}

fn should_watchdog_seal(
    last_successful_sample_ms: Option<i64>,
    last_watchdog_seal_sample_ms: Option<i64>,
    now_ms: i64,
) -> bool {
    let Some(last_successful_sample_ms) = last_successful_sample_ms else {
        return false;
    };

    if last_watchdog_seal_sample_ms == Some(last_successful_sample_ms) {
        return false;
    }

    now_ms.saturating_sub(last_successful_sample_ms) > TRACKER_STALL_SEAL_AFTER_MS
}

async fn load_afk_timeout_secs(pool: &Pool<Sqlite>) -> Result<u64, sqlx::Error> {
    let row = sqlx::query("SELECT value FROM settings WHERE key = ? LIMIT 1")
        .bind("afk_timeout_secs")
        .fetch_optional(pool)
        .await?;

    let value = row
        .and_then(|row| row.try_get::<String, _>("value").ok())
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(DEFAULT_AFK_TIMEOUT_SECS);

    Ok(value)
}

async fn load_tracker_heartbeat(pool: &Pool<Sqlite>) -> Result<Option<i64>, sqlx::Error> {
    let row = sqlx::query("SELECT value FROM settings WHERE key = ? LIMIT 1")
        .bind(TRACKER_LAST_HEARTBEAT_KEY)
        .fetch_optional(pool)
        .await?;

    Ok(row
        .and_then(|row| row.try_get::<String, _>("value").ok())
        .and_then(|value| value.parse::<i64>().ok()))
}

async fn save_tracker_timestamp(
    pool: &Pool<Sqlite>,
    key: &str,
    timestamp_ms: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(key)
    .bind(timestamp_ms.to_string())
    .execute(pool)
    .await?;

    Ok(())
}

async fn load_active_session(
    pool: &Pool<Sqlite>,
) -> Result<Option<ActiveSessionSnapshot>, sqlx::Error> {
    let row = sqlx::query(
        "SELECT start_time, exe_name, COALESCE(window_title, '') AS window_title
         FROM sessions
         WHERE end_time IS NULL
         ORDER BY start_time DESC, id DESC
         LIMIT 1",
    )
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|row| ActiveSessionSnapshot {
        start_time: row.get("start_time"),
        exe_name: row.get("exe_name"),
        window_title: row.get("window_title"),
    }))
}

async fn end_active_sessions(pool: &Pool<Sqlite>, raw_end_time: i64) -> Result<bool, sqlx::Error> {
    let active_sessions = sqlx::query(
        "SELECT id, start_time
         FROM sessions
         WHERE end_time IS NULL
         ORDER BY start_time DESC, id DESC",
    )
    .fetch_all(pool)
    .await?;

    if active_sessions.is_empty() {
        return Ok(false);
    }

    for session in active_sessions {
        let id: i64 = session.get("id");
        let start_time: i64 = session.get("start_time");
        let end_time = raw_end_time.max(start_time);
        let duration = end_time - start_time;

        sqlx::query(
            "UPDATE sessions
             SET end_time = ?, duration = ?
             WHERE id = ?",
        )
        .bind(end_time)
        .bind(duration)
        .bind(id)
        .execute(pool)
        .await?;
    }

    Ok(true)
}

async fn refresh_active_session_metadata(
    pool: &Pool<Sqlite>,
    window: &tracker::WindowInfo,
) -> Result<bool, sqlx::Error> {
    let Some(active_session) = load_active_session(pool).await? else {
        return Ok(false);
    };

    if !active_session
        .exe_name
        .eq_ignore_ascii_case(&window.exe_name)
        || active_session.window_title == window.title
    {
        return Ok(false);
    }

    sqlx::query(
        "UPDATE sessions
         SET window_title = ?
         WHERE end_time IS NULL",
    )
    .bind(&window.title)
    .execute(pool)
    .await?;

    Ok(true)
}

async fn start_session(
    pool: &Pool<Sqlite>,
    window: &tracker::WindowInfo,
    start_time: i64,
) -> Result<bool, sqlx::Error> {
    if let Some(existing_session) = load_active_session(pool).await? {
        if existing_session
            .exe_name
            .eq_ignore_ascii_case(&window.exe_name)
            && existing_session.window_title == window.title
        {
            return Ok(false);
        }
    }

    let app_name = map_app_name(&window.exe_name, &window.process_path);

    sqlx::query(
        "INSERT INTO sessions (app_name, exe_name, window_title, start_time)
         VALUES (?, ?, ?, ?)",
    )
    .bind(app_name)
    .bind(&window.exe_name)
    .bind(&window.title)
    .bind(start_time)
    .execute(pool)
    .await?;

    if !window.process_path.is_empty() {
        let pool = pool.clone();
        let exe_name = window.exe_name.clone();
        let process_path = window.process_path.clone();

        tauri::async_runtime::spawn(async move {
            if let Err(error) = ensure_icon_cache(&pool, &exe_name, &process_path).await {
                log_tracker_error(format!("failed to update icon cache: {error}"));
            }
        });
    }

    Ok(true)
}

async fn ensure_icon_cache(
    pool: &Pool<Sqlite>,
    exe_name: &str,
    process_path: &str,
) -> Result<(), sqlx::Error> {
    if process_path.is_empty() {
        return Ok(());
    }

    let already_cached = sqlx::query("SELECT exe_name FROM icon_cache WHERE exe_name = ? LIMIT 1")
        .bind(exe_name)
        .fetch_optional(pool)
        .await?
        .is_some();

    if already_cached {
        return Ok(());
    }

    let Some(base64_icon) = icon_extractor::get_icon_base64(process_path) else {
        return Ok(());
    };

    sqlx::query(
        "INSERT INTO icon_cache (exe_name, icon_base64, last_updated)
         VALUES (?, ?, ?)
         ON CONFLICT(exe_name) DO UPDATE
         SET icon_base64 = excluded.icon_base64,
             last_updated = excluded.last_updated",
    )
    .bind(exe_name)
    .bind(base64_icon)
    .bind(now_ms())
    .execute(pool)
    .await?;

    Ok(())
}

fn map_app_name(exe_name: &str, process_path: &str) -> String {
    if let Some(display_name) = resolve_process_display_name(process_path) {
        let normalized = normalize_display_name(&display_name);
        if !normalized.is_empty() {
            return normalized;
        }
    }

    fallback_app_name(exe_name)
}

fn resolve_process_display_name(process_path: &str) -> Option<String> {
    if process_path.trim().is_empty() {
        return None;
    }

    let path_wide: Vec<u16> = OsStr::new(process_path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut handle = 0u32;
    let size = unsafe { GetFileVersionInfoSizeW(PCWSTR(path_wide.as_ptr()), Some(&mut handle)) };
    if size == 0 {
        return None;
    }

    let mut version_data = vec![0u8; size as usize];
    unsafe {
        GetFileVersionInfoW(
            PCWSTR(path_wide.as_ptr()),
            Some(0),
            size,
            version_data.as_mut_ptr().cast(),
        )
        .ok()?;
    }

    for (language, code_page) in iter_version_translations(&version_data) {
        for key in VERSION_INFO_NAME_KEYS {
            if let Some(value) = query_version_string(&version_data, language, code_page, key) {
                if !value.trim().is_empty() {
                    return Some(value);
                }
            }
        }
    }

    None
}

fn iter_version_translations(version_data: &[u8]) -> Vec<(u16, u16)> {
    let mut translations = Vec::new();
    let translation_key: Vec<u16> = "\\VarFileInfo\\Translation"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let mut buffer_ptr: *mut core::ffi::c_void = std::ptr::null_mut();
    let mut buffer_len = 0u32;

    let found_translation = unsafe {
        VerQueryValueW(
            version_data.as_ptr().cast(),
            PCWSTR(translation_key.as_ptr()),
            &mut buffer_ptr,
            &mut buffer_len,
        )
        .as_bool()
    };

    if found_translation
        && !buffer_ptr.is_null()
        && buffer_len >= std::mem::size_of::<LangAndCodePage>() as u32
    {
        let count = buffer_len as usize / std::mem::size_of::<LangAndCodePage>();
        let table =
            unsafe { std::slice::from_raw_parts(buffer_ptr as *const LangAndCodePage, count) };

        for entry in table {
            let pair = (entry.language, entry.code_page);
            if !translations.contains(&pair) {
                translations.push(pair);
            }
        }
    }

    for fallback in [(0x0804u16, 0x04B0u16), (0x0409u16, 0x04B0u16)] {
        if !translations.contains(&fallback) {
            translations.push(fallback);
        }
    }

    translations
}

fn query_version_string(
    version_data: &[u8],
    language: u16,
    code_page: u16,
    key: &str,
) -> Option<String> {
    let query_path = format!(
        "\\StringFileInfo\\{:04X}{:04X}\\{}",
        language, code_page, key
    );
    let query_wide: Vec<u16> = query_path
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let mut value_ptr: *mut core::ffi::c_void = std::ptr::null_mut();
    let mut value_len = 0u32;

    let found = unsafe {
        VerQueryValueW(
            version_data.as_ptr().cast(),
            PCWSTR(query_wide.as_ptr()),
            &mut value_ptr,
            &mut value_len,
        )
        .as_bool()
    };

    if !found || value_ptr.is_null() || value_len == 0 {
        return None;
    }

    let raw_slice =
        unsafe { std::slice::from_raw_parts(value_ptr as *const u16, value_len as usize) };
    let value = String::from_utf16_lossy(raw_slice);
    let trimmed = value.trim_matches('\0').trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn normalize_display_name(name: &str) -> String {
    name.trim().trim_end_matches(".exe").trim().to_string()
}

fn fallback_app_name(exe_name: &str) -> String {
    let raw = exe_name
        .trim()
        .trim_matches('"')
        .trim_end_matches(".exe")
        .trim();
    if raw.is_empty() {
        return String::new();
    }

    let mut normalized = String::with_capacity(raw.len());
    let mut previous_was_separator = false;
    for ch in raw.chars() {
        let is_separator = matches!(ch, '_' | '-' | '.');
        if is_separator {
            if !normalized.is_empty() && !previous_was_separator {
                normalized.push(' ');
            }
            previous_was_separator = true;
            continue;
        }

        normalized.push(ch);
        previous_was_separator = false;
    }

    let normalized = normalized.trim();
    if normalized.is_empty() {
        return String::new();
    }

    let mut chars = normalized.chars();
    match chars.next() {
        Some(first) => {
            let mut result = first.to_uppercase().collect::<String>();
            result.push_str(chars.as_str());
            result
        }
        None => String::new(),
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

fn emit_tracking_data_changed<R: Runtime>(
    app: &AppHandle<R>,
    reason: &str,
    changed_at_ms: u64,
) -> tauri::Result<()> {
    app.emit(
        "tracking-data-changed",
        TrackingDataChangedPayload {
            reason: reason.to_string(),
            changed_at_ms,
        },
    )
}

fn log_tracker_error(message: impl AsRef<str>) {
    eprintln!("[tracker] {}", message.as_ref());
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db_schema;
    use serde_json::json;
    use sqlx::{Executor, SqlitePool};

    fn make_window(overrides: &[(&str, &str)]) -> tracker::WindowInfo {
        let mut window = tracker::WindowInfo {
            hwnd: "0x100".into(),
            root_owner_hwnd: "0x100".into(),
            process_id: 123,
            window_class: "Chrome_WidgetWin_1".into(),
            title: "Window".into(),
            exe_name: "QQ.exe".into(),
            process_path: r"C:\Program Files\QQ\QQ.exe".into(),
            is_afk: false,
            idle_time_ms: 0,
        };

        for (key, value) in overrides {
            match *key {
                "hwnd" => window.hwnd = (*value).into(),
                "root_owner_hwnd" => window.root_owner_hwnd = (*value).into(),
                "process_id" => window.process_id = value.parse().unwrap(),
                "window_class" => window.window_class = (*value).into(),
                "title" => window.title = (*value).into(),
                "exe_name" => window.exe_name = (*value).into(),
                "process_path" => window.process_path = (*value).into(),
                "is_afk" => window.is_afk = *value == "true",
                "idle_time_ms" => window.idle_time_ms = value.parse().unwrap(),
                _ => {}
            }
        }

        window
    }

    async fn setup_test_db() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        pool.execute(db_schema::MIGRATION_1_SQL).await.unwrap();
        pool.execute(db_schema::MIGRATION_2_SQL).await.unwrap();
        pool.execute(db_schema::MIGRATION_3_SQL).await.unwrap();
        pool
    }

    #[test]
    fn startup_seal_time_prefers_valid_heartbeat() {
        assert_eq!(resolve_startup_seal_time(1_000, Some(8_000), 20_000), 8_000);
        assert_eq!(
            resolve_startup_seal_time(1_000, Some(30_000), 20_000),
            20_000
        );
        assert_eq!(resolve_startup_seal_time(5_000, None, 20_000), 20_000);
    }

    #[test]
    fn afk_transition_backdates_end_without_starting_new_session() {
        let previous = make_window(&[]);
        let next = make_window(&[
            ("exe_name", "explorer.exe"),
            ("process_path", r"C:\Windows\explorer.exe"),
            ("is_afk", "true"),
            ("idle_time_ms", "300000"),
        ]);

        let decision = plan_window_transition(Some(&previous), &next, 1_000_000);

        assert!(decision.should_end_previous);
        assert!(!decision.should_start_next);
        assert!(!decision.should_refresh_metadata);
        assert_eq!(decision.end_time_override, Some(700_000));
    }

    #[test]
    fn same_app_different_window_refreshes_metadata_without_splitting_session() {
        let previous = make_window(&[
            ("hwnd", "0x100"),
            ("root_owner_hwnd", "0x100"),
            ("title", "Window A"),
        ]);
        let next = make_window(&[
            ("hwnd", "0x200"),
            ("root_owner_hwnd", "0x200"),
            ("title", "Window B"),
        ]);

        let decision = plan_window_transition(Some(&previous), &next, 1_000_000);

        assert_eq!(decision.reason, "session-metadata-refreshed");
        assert!(!decision.should_end_previous);
        assert!(!decision.should_start_next);
        assert!(decision.should_refresh_metadata);
    }

    #[test]
    fn lock_screen_processes_are_not_trackable() {
        assert!(!should_track("LockApp.exe"));
        assert!(!should_track("LogonUI.exe"));
        assert!(!should_track("SearchHost.exe"));
        assert!(!should_track("ShellExperienceHost.exe"));
        assert!(!should_track("Consent.exe"));
        assert!(!should_track("PickerHost.exe"));
        assert!(!should_track("SearchUXHost.exe"));
        assert!(!should_track("FooExperienceHost.exe"));
        assert!(!should_track("svchost.exe"));
    }

    #[test]
    fn watchdog_seal_only_triggers_once_per_stale_sample() {
        assert!(!should_watchdog_seal(None, None, 20_000));
        assert!(!should_watchdog_seal(Some(10_000), None, 18_000));
        assert!(should_watchdog_seal(Some(10_000), None, 18_001));
        assert!(!should_watchdog_seal(Some(10_000), Some(10_000), 25_000));
        assert!(should_watchdog_seal(Some(12_000), Some(10_000), 21_000));
    }

    #[test]
    fn tracking_payload_contracts_are_stable() {
        let payload = serde_json::to_value(TrackingDataChangedPayload {
            reason: "session-transition".into(),
            changed_at_ms: 123,
        })
        .unwrap();

        assert_eq!(
            payload,
            json!({
                "reason": "session-transition",
                "changed_at_ms": 123
            })
        );

        let window_payload = serde_json::to_value(make_window(&[])).unwrap();
        assert_eq!(window_payload["hwnd"], "0x100");
        assert_eq!(window_payload["root_owner_hwnd"], "0x100");
        assert_eq!(window_payload["process_id"], 123);
        assert_eq!(window_payload["window_class"], "Chrome_WidgetWin_1");
        assert_eq!(window_payload["title"], "Window");
        assert_eq!(window_payload["exe_name"], "QQ.exe");
        assert_eq!(
            window_payload["process_path"],
            r"C:\Program Files\QQ\QQ.exe"
        );
        assert_eq!(window_payload["is_afk"], false);
        assert_eq!(window_payload["idle_time_ms"], 0);
    }

    #[test]
    fn migration_dedupes_multiple_active_sessions() {
        tauri::async_runtime::block_on(async {
            let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
            pool.execute(db_schema::MIGRATION_1_SQL).await.unwrap();
            pool.execute(
                "INSERT INTO sessions (app_name, exe_name, window_title, start_time)
                 VALUES ('QQ', 'QQ.exe', 'Chat A', 1000),
                        ('QQ', 'QQ.exe', 'Chat B', 2000)",
            )
            .await
            .unwrap();

            pool.execute(db_schema::MIGRATION_3_SQL).await.unwrap();

            let active_count: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE end_time IS NULL")
                    .fetch_one(&pool)
                    .await
                    .unwrap();

            let sealed_duration: i64 =
                sqlx::query_scalar("SELECT duration FROM sessions WHERE start_time = 1000")
                    .fetch_one(&pool)
                    .await
                    .unwrap();

            assert_eq!(active_count, 1);
            assert_eq!(sealed_duration, 0);
        });
    }

    #[test]
    fn start_session_preserves_single_active_session() {
        tauri::async_runtime::block_on(async {
            let pool = setup_test_db().await;
            let window = make_window(&[]);

            assert!(start_session(&pool, &window, 1_000).await.unwrap());
            assert!(!start_session(&pool, &window, 2_000).await.unwrap());

            let active_count: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE end_time IS NULL")
                    .fetch_one(&pool)
                    .await
                    .unwrap();

            assert_eq!(active_count, 1);
        });
    }

    #[test]
    fn missing_active_session_is_recovered_without_window_change() {
        tauri::async_runtime::block_on(async {
            let pool = setup_test_db().await;
            let window = make_window(&[]);

            let reason = apply_window_transition(&pool, Some(&window), &window, 5_000)
                .await
                .unwrap();

            let active_count: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE end_time IS NULL")
                    .fetch_one(&pool)
                    .await
                    .unwrap();

            assert_eq!(reason, Some("session-recovered"));
            assert_eq!(active_count, 1);
        });
    }

    #[test]
    fn metadata_refresh_updates_active_session_title() {
        tauri::async_runtime::block_on(async {
            let pool = setup_test_db().await;
            let original = make_window(&[("title", "Window A")]);
            let updated = make_window(&[
                ("hwnd", "0x200"),
                ("root_owner_hwnd", "0x200"),
                ("title", "Window B"),
            ]);

            assert!(start_session(&pool, &original, 1_000).await.unwrap());

            let reason = apply_window_transition(&pool, Some(&original), &updated, 5_000)
                .await
                .unwrap();

            let latest_title: String = sqlx::query_scalar(
                "SELECT window_title FROM sessions WHERE end_time IS NULL LIMIT 1",
            )
            .fetch_one(&pool)
            .await
            .unwrap();

            assert_eq!(reason, Some("session-metadata-refreshed"));
            assert_eq!(latest_title, "Window B");
        });
    }

    #[test]
    fn lock_event_seals_active_session_immediately() {
        tauri::async_runtime::block_on(async {
            let pool = setup_test_db().await;
            let window = make_window(&[]);

            assert!(start_session(&pool, &window, 1_000).await.unwrap());

            let reason = apply_power_lifecycle_event(&pool, "lock", 5_000)
                .await
                .unwrap();

            let ended: Option<(i64, i64)> = sqlx::query_as(
                "SELECT end_time, duration FROM sessions WHERE end_time IS NOT NULL LIMIT 1",
            )
            .fetch_optional(&pool)
            .await
            .unwrap();

            assert_eq!(reason, Some("session-ended-lock"));
            assert_eq!(ended, Some((5_000, 4_000)));
        });
    }

    #[test]
    fn unlock_event_does_not_mutate_sessions() {
        tauri::async_runtime::block_on(async {
            let pool = setup_test_db().await;
            let reason = apply_power_lifecycle_event(&pool, "unlock", 5_000)
                .await
                .unwrap();

            let active_count: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE end_time IS NULL")
                    .fetch_one(&pool)
                    .await
                    .unwrap();

            assert_eq!(reason, None);
            assert_eq!(active_count, 0);
        });
    }

    #[test]
    fn suspend_event_seals_active_session_immediately() {
        tauri::async_runtime::block_on(async {
            let pool = setup_test_db().await;
            let window = make_window(&[]);

            assert!(start_session(&pool, &window, 1_000).await.unwrap());

            let reason = apply_power_lifecycle_event(&pool, "suspend", 5_000)
                .await
                .unwrap();

            let ended: Option<(i64, i64)> = sqlx::query_as(
                "SELECT end_time, duration FROM sessions WHERE end_time IS NOT NULL LIMIT 1",
            )
            .fetch_optional(&pool)
            .await
            .unwrap();

            assert_eq!(reason, Some("session-ended-suspend"));
            assert_eq!(ended, Some((5_000, 4_000)));
        });
    }

    #[test]
    fn resume_event_does_not_mutate_sessions() {
        tauri::async_runtime::block_on(async {
            let pool = setup_test_db().await;
            let reason = apply_power_lifecycle_event(&pool, "resume", 5_000)
                .await
                .unwrap();

            let active_count: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE end_time IS NULL")
                    .fetch_one(&pool)
                    .await
                    .unwrap();

            assert_eq!(reason, None);
            assert_eq!(active_count, 0);
        });
    }
}
