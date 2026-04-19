use super::{active_session, continuity, startup, transition, watchdog};
use crate::data::repositories::{sessions, tracker_settings};
use crate::data::sqlite_pool::wait_for_sqlite_pool;
use crate::domain::tracking::{
    resolve_tracking_status, signal_matches_window, SustainedParticipationSignalSnapshot,
    TrackingDataChangedPayload, TrackingStatusSnapshot, WindowSessionIdentity,
    TRACKING_REASON_CONTINUITY_WINDOW_SEALED, TRACKING_REASON_PASSIVE_PARTICIPATION_SEALED,
    TRACKING_REASON_TRACKING_PAUSED_SEALED,
};
use crate::platform::windows::{audio, foreground as tracker, media};
use sqlx::{Pool, Sqlite};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::task::spawn_blocking;
use tokio::time::{sleep, timeout, Duration};
const WINDOW_POLL_TIMEOUT_SECS: u64 = 3;

struct TrackingLoopState {
    continuity_window_secs: u64,
    sustained_participation_secs: u64,
    tracking_paused: bool,
    tracked_window: tracker::WindowInfo,
    sustained_participation_signal: SustainedParticipationSignalSnapshot,
    tracking_status: TrackingStatusSnapshot,
}

pub struct CurrentTrackingSnapshotData {
    pub window: tracker::WindowInfo,
    pub status: TrackingStatusSnapshot,
}

pub async fn run<R: Runtime>(
    app: AppHandle<R>,
    health_state: Arc<watchdog::RuntimeHealthState>,
) -> Result<(), String> {
    let pool = wait_for_sqlite_pool(&app).await?;
    startup::initialize_tracker(&app, &pool)
        .await
        .map_err(|error| format!("tracker initialization failed: {error}"))?;

    let mut last_window: Option<tracker::WindowInfo> = None;
    let mut last_tracking_status: Option<TrackingStatusSnapshot> = None;
    let mut last_emitted_window: Option<tracker::WindowInfo> = None;
    let mut pending_sustained_continuity: Option<continuity::PendingSustainedContinuity> = None;

    loop {
        let window_info = poll_active_window_with_timeout().await?;
        let now_ms = now_ms();
        health_state.note_successful_sample(now_ms);
        persist_tracker_runtime_timestamps(&pool, now_ms).await;
        let tracking_state = load_tracking_loop_state(&pool, &window_info).await;
        let tracked_window = tracking_state.tracked_window;
        let continuity_group_start_time = continuity::resolve_next_session_continuity_group_start_time(
            pending_sustained_continuity.as_ref(),
            &tracked_window,
            now_ms,
        );
        let new_pending_sustained_continuity = continuity::load_pending_sustained_continuity(
            &pool,
            last_window.as_ref(),
            last_tracking_status.as_ref(),
            &tracked_window,
            tracking_state.continuity_window_secs,
            now_ms,
        )
        .await;

        if tracking_state.tracking_paused {
            match seal_active_sessions_for_tracking_pause(&pool, now_ms).await {
                Ok(Some(reason)) => {
                    let _ = emit_tracking_data_changed(&app, reason, now_ms as u64);
                }
                Ok(None) => {}
                Err(error) => {
                    log_tracker_error(format!("failed to seal session while paused: {error}"));
                }
            }

            pending_sustained_continuity = None;
            last_window = Some(tracked_window);
            last_tracking_status = Some(tracking_state.tracking_status);
            sleep(Duration::from_secs(1)).await;
            continue;
        }

        if should_seal_sustained_participation(
            last_window.as_ref(),
            &tracked_window,
            &tracking_state.sustained_participation_signal,
            tracking_state.sustained_participation_secs,
        ) {
            match seal_active_sessions_for_passive_participation_timeout(
                &pool,
                &tracked_window,
                now_ms,
                tracking_state.sustained_participation_secs,
            )
            .await
            {
                Ok(Some(reason)) => {
                    let _ = emit_tracking_data_changed(&app, reason, now_ms as u64);
                }
                Ok(None) => {}
                Err(error) => {
                    log_tracker_error(format!(
                        "failed to seal session for passive participation timeout: {error}"
                    ));
                }
            }

            last_window = Some(tracked_window);
            last_tracking_status = Some(tracking_state.tracking_status);
            sleep(Duration::from_secs(1)).await;
            continue;
        }

        if should_suspend_active_tracking(
            last_window.as_ref(),
            &tracked_window,
            tracking_state.continuity_window_secs,
            &tracking_state.tracking_status,
        ) {
            match seal_active_sessions_for_continuity_timeout(
                &pool,
                &tracked_window,
                now_ms,
                tracking_state.continuity_window_secs,
            )
            .await
            {
                Ok(Some(reason)) => {
                    let _ = emit_tracking_data_changed(&app, reason, now_ms as u64);
                }
                Ok(None) => {}
                Err(error) => {
                    log_tracker_error(format!(
                        "failed to seal session for continuity timeout: {error}"
                    ));
                }
            }

            last_window = Some(tracked_window);
            last_tracking_status = Some(tracking_state.tracking_status);
            sleep(Duration::from_secs(1)).await;
            continue;
        }

        if tracker::has_meaningful_change(last_emitted_window.as_ref(), &window_info) {
            let _ = app.emit("active-window-changed", &window_info);
            last_emitted_window = Some(window_info.clone());
        }

        match transition::apply_window_transition(
            &pool,
            last_window.as_ref(),
            &tracked_window,
            now_ms,
            continuity_group_start_time,
            active_session::start_session_for_transition,
        )
        .await
        {
            Ok(Some(reason)) => {
                let _ = emit_tracking_data_changed(&app, reason, now_ms as u64);
            }
            Ok(None) => {}
            Err(error) => {
                log_tracker_error(format!("failed to apply window transition: {error}"));
            }
        }

        pending_sustained_continuity = continuity::resolve_next_pending_sustained_continuity(
            pending_sustained_continuity,
            new_pending_sustained_continuity,
            continuity_group_start_time,
            &tracked_window,
            now_ms,
        );
        last_window = Some(tracked_window);
        last_tracking_status = Some(tracking_state.tracking_status);
        sleep(Duration::from_secs(1)).await;
    }
}

pub async fn load_current_tracking_snapshot(
    pool: &Pool<Sqlite>,
) -> Result<CurrentTrackingSnapshotData, String> {
    let window_info = poll_active_window_with_timeout().await?;
    let tracking_state = load_tracking_loop_state(pool, &window_info).await;

    Ok(CurrentTrackingSnapshotData {
        window: tracking_state.tracked_window,
        status: tracking_state.tracking_status,
    })
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

async fn persist_tracker_runtime_timestamps(pool: &Pool<Sqlite>, now_ms: i64) {
    for (setting_key, error_context) in [
        (
            tracker_settings::TRACKER_LAST_SUCCESSFUL_SAMPLE_KEY,
            "sample timestamp",
        ),
        (
            tracker_settings::TRACKER_LAST_HEARTBEAT_KEY,
            "heartbeat",
        ),
    ] {
        if let Err(error) = tracker_settings::save_tracker_timestamp(pool, setting_key, now_ms).await
        {
            log_tracker_error(format!(
                "failed to save tracker {error_context}: {error}"
            ));
        }
    }
}

async fn load_tracking_loop_state(
    pool: &Pool<Sqlite>,
    window_info: &tracker::WindowInfo,
) -> TrackingLoopState {
    let continuity_window_secs = match tracker_settings::load_timeline_merge_gap_secs(pool, 180).await
    {
        Ok(value) => value,
        Err(error) => {
            log_tracker_error(format!(
                "failed to load continuity window setting: {error}"
            ));
            180
        }
    };

    let tracking_paused = match tracker_settings::load_tracking_paused_setting(pool).await {
        Ok(value) => value,
        Err(error) => {
            log_tracker_error(format!("failed to load tracking pause setting: {error}"));
            false
        }
    };

    let sustained_participation_secs =
        match tracker_settings::load_idle_timeout_secs(pool, 300).await {
            Ok(value) => value,
            Err(error) => {
                log_tracker_error(format!(
                    "failed to load sustained participation setting: {error}"
                ));
                300
            }
        };

    let capture_window_title = match tracker_settings::load_capture_window_title_setting_for_app(
        pool,
        &window_info.exe_name,
    )
    .await
    {
        Ok(value) => value,
        Err(error) => {
            log_tracker_error(format!(
                "failed to load app capture title setting for {}: {error}",
                window_info.exe_name
            ));
            true
        }
    };

    let mut tracked_window = window_info.clone();
    if !capture_window_title {
        tracked_window.title.clear();
    }

    let sustained_participation_signal =
        load_sustained_participation_signal(&tracked_window, tracking_paused).await;
    let tracking_status = resolve_tracking_status(
        &tracked_window.exe_name,
        &tracked_window.process_path,
        tracked_window.idle_time_ms,
        tracked_window.is_afk,
        continuity_window_secs,
        sustained_participation_secs,
        tracking_paused,
        &sustained_participation_signal,
    );

    TrackingLoopState {
        continuity_window_secs,
        sustained_participation_secs,
        tracking_paused,
        tracked_window,
        sustained_participation_signal,
        tracking_status,
    }
}

async fn load_sustained_participation_signal(
    tracked_window: &tracker::WindowInfo,
    tracking_paused: bool,
) -> SustainedParticipationSignalSnapshot {
    if tracking_paused {
        return SustainedParticipationSignalSnapshot::default();
    }

    let system_media_signal = media::get_sustained_participation_signal(tracked_window).await;
    if signal_matches_window(
        &tracked_window.exe_name,
        &tracked_window.process_path,
        &system_media_signal,
    ) {
        return system_media_signal;
    }

    let audio_signal = audio::get_sustained_participation_signal(tracked_window).await;
    if signal_matches_window(
        &tracked_window.exe_name,
        &tracked_window.process_path,
        &audio_signal,
    ) {
        return audio_signal;
    }

    system_media_signal
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

async fn apply_power_lifecycle_event(
    pool: &Pool<Sqlite>,
    state: &str,
    timestamp_ms: i64,
) -> Result<Option<&'static str>, sqlx::Error> {
    let should_end_active_session = matches!(state, "lock" | "suspend");

    if !should_end_active_session {
        return Ok(None);
    }

    if sessions::end_active_sessions(pool, timestamp_ms).await? {
        return Ok(Some(match state {
            "lock" => "session-ended-lock",
            "suspend" => "session-ended-suspend",
            _ => "session-ended-system",
        }));
    }

    Ok(None)
}

async fn seal_active_sessions_for_tracking_pause(
    pool: &Pool<Sqlite>,
    timestamp_ms: i64,
) -> Result<Option<&'static str>, sqlx::Error> {
    if sessions::end_active_sessions(pool, timestamp_ms).await? {
        return Ok(Some(TRACKING_REASON_TRACKING_PAUSED_SEALED));
    }

    Ok(None)
}

async fn seal_active_sessions_for_continuity_timeout(
    pool: &Pool<Sqlite>,
    window: &tracker::WindowInfo,
    now_ms: i64,
    continuity_window_secs: u64,
) -> Result<Option<&'static str>, sqlx::Error> {
    if !has_exceeded_continuity_window(window, continuity_window_secs) {
        return Ok(None);
    }

    let resolved_end_time = resolve_continuity_window_end_time(
        now_ms,
        window.idle_time_ms,
        continuity_window_secs,
    );

    if sessions::end_active_sessions(pool, resolved_end_time).await? {
        return Ok(Some(TRACKING_REASON_CONTINUITY_WINDOW_SEALED));
    }

    Ok(None)
}

async fn seal_active_sessions_for_passive_participation_timeout(
    pool: &Pool<Sqlite>,
    window: &tracker::WindowInfo,
    now_ms: i64,
    sustained_participation_secs: u64,
) -> Result<Option<&'static str>, sqlx::Error> {
    if !has_exceeded_sustained_participation_window(window, sustained_participation_secs) {
        return Ok(None);
    }

    let resolved_end_time = resolve_sustained_participation_end_time(
        now_ms,
        window.idle_time_ms,
        sustained_participation_secs,
    );

    if sessions::end_active_sessions(pool, resolved_end_time).await? {
        return Ok(Some(TRACKING_REASON_PASSIVE_PARTICIPATION_SEALED));
    }

    Ok(None)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

fn should_suspend_active_tracking(
    previous_window: Option<&tracker::WindowInfo>,
    current_window: &tracker::WindowInfo,
    continuity_window_secs: u64,
    tracking_status: &TrackingStatusSnapshot,
) -> bool {
    if tracking_status.sustained_participation_active {
        return false;
    }

    if current_window.is_afk || !has_exceeded_continuity_window(current_window, continuity_window_secs)
    {
        return false;
    }

    let Some(previous_identity) = transition::resolve_window_session_identity(previous_window) else {
        return false;
    };
    let Some(current_identity) =
        transition::resolve_window_session_identity(Some(current_window))
    else {
        return false;
    };

    previous_identity.is_same_app(&current_identity)
}

fn should_seal_sustained_participation(
    previous_window: Option<&tracker::WindowInfo>,
    current_window: &tracker::WindowInfo,
    signal: &SustainedParticipationSignalSnapshot,
    sustained_participation_secs: u64,
) -> bool {
    if !signal_matches_window(&current_window.exe_name, &current_window.process_path, signal)
        || !current_window.is_afk
        || !has_exceeded_sustained_participation_window(current_window, sustained_participation_secs)
    {
        return false;
    }

    let Some(previous_identity) = transition::resolve_window_session_identity(previous_window) else {
        return false;
    };
    let Some(current_identity) = WindowSessionIdentity::from_window_fields(
        &current_window.exe_name,
        current_window.process_id,
        &current_window.root_owner_hwnd,
        &current_window.hwnd,
        &current_window.window_class,
    ) else {
        return false;
    };

    previous_identity.is_same_app(&current_identity)
}

fn has_exceeded_continuity_window(
    window: &tracker::WindowInfo,
    continuity_window_secs: u64,
) -> bool {
    let continuity_window_ms = continuity_window_ms(continuity_window_secs);
    continuity_window_ms >= 0 && i64::from(window.idle_time_ms) > continuity_window_ms
}

fn has_exceeded_sustained_participation_window(
    window: &tracker::WindowInfo,
    sustained_participation_secs: u64,
) -> bool {
    let sustained_participation_window_ms =
        sustained_participation_window_ms(sustained_participation_secs);
    sustained_participation_window_ms >= 0
        && i64::from(window.idle_time_ms) > sustained_participation_window_ms
}

fn resolve_continuity_window_end_time(
    now_ms: i64,
    idle_time_ms: u32,
    continuity_window_secs: u64,
) -> i64 {
    now_ms - i64::from(idle_time_ms) + continuity_window_ms(continuity_window_secs)
}

fn resolve_sustained_participation_end_time(
    now_ms: i64,
    idle_time_ms: u32,
    sustained_participation_secs: u64,
) -> i64 {
    now_ms - i64::from(idle_time_ms)
        + sustained_participation_window_ms(sustained_participation_secs)
}

fn continuity_window_ms(continuity_window_secs: u64) -> i64 {
    continuity_window_secs.saturating_mul(1000).min(i64::MAX as u64) as i64
}

fn sustained_participation_window_ms(sustained_participation_secs: u64) -> i64 {
    sustained_participation_secs
        .saturating_mul(1000)
        .min(i64::MAX as u64) as i64
}

pub fn emit_tracking_data_changed<R: Runtime>(
    app: &AppHandle<R>,
    reason: &str,
    changed_at_ms: u64,
) -> tauri::Result<()> {
    app.emit(
        "tracking-data-changed",
        TrackingDataChangedPayload::new(reason, changed_at_ms),
    )
}

fn log_tracker_error(message: impl AsRef<str>) {
    eprintln!("[tracker] {}", message.as_ref());
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::migrations as db_schema;
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
        pool.execute(db_schema::MIGRATION_4_SQL).await.unwrap();
        pool.execute(db_schema::MIGRATION_5_SQL).await.unwrap();
        pool.execute(db_schema::MIGRATION_6_SQL).await.unwrap();
        pool.execute(db_schema::MIGRATION_7_SQL).await.unwrap();
        pool
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

        let decision = transition::plan_window_transition(Some(&previous), &next, 1_000_000);

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

        let decision = transition::plan_window_transition(Some(&previous), &next, 1_000_000);

        assert_eq!(decision.reason, "session-metadata-refreshed");
        assert!(!decision.should_end_previous);
        assert!(!decision.should_start_next);
        assert!(decision.should_refresh_metadata);
    }

    #[test]
    fn lock_screen_processes_are_not_trackable() {
        assert!(!crate::domain::tracking::should_track("LockApp.exe"));
        assert!(!crate::domain::tracking::should_track("LogonUI.exe"));
        assert!(!crate::domain::tracking::should_track("time-tracker.exe"));
        assert!(!crate::domain::tracking::should_track("un.exe"));
        assert!(!crate::domain::tracking::should_track("SearchHost.exe"));
        assert!(!crate::domain::tracking::should_track("ShellHost.exe"));
        assert!(!crate::domain::tracking::should_track(
            "ShellExperienceHost.exe"
        ));
        assert!(!crate::domain::tracking::should_track("Consent.exe"));
        assert!(!crate::domain::tracking::should_track("PickerHost.exe"));
        assert!(!crate::domain::tracking::should_track("openwith.exe"));
        assert!(!crate::domain::tracking::should_track("SearchUXHost.exe"));
        assert!(!crate::domain::tracking::should_track(
            "FooExperienceHost.exe"
        ));
        assert!(!crate::domain::tracking::should_track("svchost.exe"));
    }

    #[test]
    fn lifecycle_utility_processes_are_not_trackable() {
        assert!(!crate::domain::tracking::should_track("uninstall.exe"));
        assert!(!crate::domain::tracking::should_track("unins000.exe"));
        assert!(!crate::domain::tracking::should_track("obsidian-setup.exe"));
        assert!(!crate::domain::tracking::should_track(
            "cursor-installer.exe"
        ));
        assert!(!crate::domain::tracking::should_track("cursor-updater.exe"));
        assert!(!crate::domain::tracking::should_track(
            "maintenancetool.exe"
        ));
        assert!(crate::domain::tracking::should_track("Antigravity.exe"));
    }

    #[test]
    fn lifecycle_utility_window_titles_are_not_trackable_for_versioned_installers() {
        let installer = make_window(&[
            ("exe_name", "alma-0.0.750-win-x64.exe"),
            ("title", "Alma 安装"),
        ]);
        let app = make_window(&[("exe_name", "Alma.exe"), ("title", "Alma")]);

        assert!(!transition::is_trackable_window(Some(&installer)));
        assert!(transition::is_trackable_window(Some(&app)));
    }

    #[test]
    fn watchdog_seal_only_triggers_once_per_stale_sample() {
        assert!(!watchdog::should_watchdog_seal(None, None, 20_000));
        assert!(!watchdog::should_watchdog_seal(Some(10_000), None, 18_000));
        assert!(watchdog::should_watchdog_seal(Some(10_000), None, 18_001));
        assert!(!watchdog::should_watchdog_seal(
            Some(10_000),
            Some(10_000),
            25_000
        ));
        assert!(watchdog::should_watchdog_seal(
            Some(12_000),
            Some(10_000),
            21_000
        ));
    }

    #[test]
    fn app_title_capture_override_defaults_to_enabled() {
        tauri::async_runtime::block_on(async {
            let pool = setup_test_db().await;

            let enabled =
                tracker_settings::load_capture_window_title_setting_for_app(&pool, "QQ.exe")
                    .await
                    .unwrap();

            assert!(enabled);
        });
    }

    #[test]
    fn app_title_capture_override_can_disable_title_recording() {
        tauri::async_runtime::block_on(async {
            let pool = setup_test_db().await;
            let key = format!("{}qq.exe", tracker_settings::APP_OVERRIDE_KEY_PREFIX);
            let value = serde_json::to_string(&json!({
                "captureTitle": false,
                "enabled": true
            }))
            .unwrap();

            sqlx::query(
                "INSERT INTO settings (key, value) VALUES (?, ?)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            )
            .bind(key)
            .bind(value)
            .execute(&pool)
            .await
            .unwrap();

            let enabled =
                tracker_settings::load_capture_window_title_setting_for_app(&pool, "QQ.exe")
                    .await
                    .unwrap();

            assert!(!enabled);
        });
    }

    #[test]
    fn tracking_payload_contracts_are_stable() {
        let payload =
            serde_json::to_value(TrackingDataChangedPayload::new("session-transition", 123))
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

            assert!(active_session::start_session(&pool, &window, 1_000).await.unwrap());
            assert!(!active_session::start_session(&pool, &window, 2_000).await.unwrap());

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

            let reason = transition::apply_window_transition(
                &pool,
                Some(&window),
                &window,
                5_000,
                5_000,
                active_session::start_session_for_transition,
            )
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
    fn continuity_timeout_seals_active_session_at_continuity_boundary() {
        tauri::async_runtime::block_on(async {
            let pool = setup_test_db().await;
            let window = make_window(&[("idle_time_ms", "300000")]);

            assert!(active_session::start_session(&pool, &make_window(&[]), 10_000).await.unwrap());

            let reason = seal_active_sessions_for_continuity_timeout(&pool, &window, 400_000, 180)
                .await
                .unwrap();

            let ended: Option<(i64, i64)> = sqlx::query_as(
                "SELECT end_time, duration FROM sessions WHERE end_time IS NOT NULL LIMIT 1",
            )
            .fetch_optional(&pool)
            .await
            .unwrap();

            assert_eq!(reason, Some(TRACKING_REASON_CONTINUITY_WINDOW_SEALED));
            assert_eq!(ended, Some((280_000, 270_000)));
        });
    }

    #[test]
    fn continuity_timeout_allows_same_app_to_start_new_session_after_input_returns() {
        tauri::async_runtime::block_on(async {
            let pool = setup_test_db().await;
            let previous = make_window(&[]);
            let timed_out = make_window(&[("idle_time_ms", "240000")]);
            let resumed = make_window(&[("idle_time_ms", "1")]);

            assert!(active_session::start_session(&pool, &previous, 1_000).await.unwrap());

            let seal_reason =
                seal_active_sessions_for_continuity_timeout(&pool, &timed_out, 300_000, 180)
                    .await
                    .unwrap();
            let recover_reason = transition::apply_window_transition(
                &pool,
                Some(&timed_out),
                &resumed,
                301_000,
                301_000,
                active_session::start_session_for_transition,
            )
            .await
            .unwrap();

            let sessions: Vec<(i64, i64, Option<i64>)> = sqlx::query_as(
                "SELECT start_time, continuity_group_start_time, end_time
                 FROM sessions
                 ORDER BY start_time ASC",
            )
                    .fetch_all(&pool)
                    .await
                    .unwrap();

            assert_eq!(seal_reason, Some(TRACKING_REASON_CONTINUITY_WINDOW_SEALED));
            assert_eq!(recover_reason, Some("session-recovered"));
            assert_eq!(
                sessions,
                vec![(1_000, 1_000, Some(240_000)), (301_000, 301_000, None)]
            );
        });
    }

    #[test]
    fn sustained_participation_signal_skips_continuity_suspend() {
        let previous = make_window(&[("exe_name", "Zoom.exe"), ("idle_time_ms", "0")]);
        let current = make_window(&[("exe_name", "Zoom.exe"), ("idle_time_ms", "240000")]);
        let tracking_status = TrackingStatusSnapshot {
            is_tracking_active: true,
            sustained_participation_eligible: true,
            sustained_participation_active: true,
            sustained_participation_kind: None,
        };

        assert!(!should_suspend_active_tracking(
            Some(&previous),
            &current,
            180,
            &tracking_status,
        ));
    }

    #[test]
    fn sustained_participation_timeout_seals_session_at_sustained_boundary() {
        tauri::async_runtime::block_on(async {
            let pool = setup_test_db().await;
            let previous = make_window(&[("exe_name", "Zoom.exe"), ("idle_time_ms", "0")]);
            let timed_out = make_window(&[
                ("exe_name", "Zoom.exe"),
                ("idle_time_ms", "660000"),
                ("is_afk", "true"),
            ]);
            let signal = SustainedParticipationSignalSnapshot {
                is_available: true,
                is_active: true,
                signal_source: Some(crate::domain::tracking::SustainedParticipationSignalSource::SystemMedia),
                source_app_id: Some("Zoom".into()),
                source_app_identity: Some(crate::domain::tracking::SustainedParticipationAppIdentity::Zoom),
                playback_type: Some(crate::domain::tracking::SystemMediaPlaybackType::Video),
            };

            assert!(active_session::start_session(&pool, &previous, 10_000).await.unwrap());
            assert!(should_seal_sustained_participation(
                Some(&previous),
                &timed_out,
                &signal,
                600,
            ));

            let reason = seal_active_sessions_for_passive_participation_timeout(
                &pool,
                &timed_out,
                700_000,
                600,
            )
            .await
            .unwrap();

            let ended: Option<(i64, i64)> = sqlx::query_as(
                "SELECT end_time, duration FROM sessions WHERE end_time IS NOT NULL LIMIT 1",
            )
            .fetch_optional(&pool)
            .await
            .unwrap();

            assert_eq!(reason, Some(TRACKING_REASON_PASSIVE_PARTICIPATION_SEALED));
            assert_eq!(ended, Some((640_000, 630_000)));
        });
    }

    #[test]
    fn sustained_participation_timeout_supports_unknown_audio_signal_matches() {
        let previous = make_window(&[
            ("exe_name", "PotPlayerMini64.exe"),
            ("process_path", r"C:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe"),
            ("idle_time_ms", "0"),
        ]);
        let timed_out = make_window(&[
            ("exe_name", "PotPlayerMini64.exe"),
            ("process_path", r"C:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe"),
            ("idle_time_ms", "660000"),
            ("is_afk", "true"),
        ]);
        let signal = SustainedParticipationSignalSnapshot {
            is_available: true,
            is_active: true,
            signal_source: Some(
                crate::domain::tracking::SustainedParticipationSignalSource::AudioSession,
            ),
            source_app_id: Some("PotPlayerMini64.exe".into()),
            source_app_identity: None,
            playback_type: None,
        };

        assert!(should_seal_sustained_participation(
            Some(&previous),
            &timed_out,
            &signal,
            600,
        ));
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

            assert!(active_session::start_session(&pool, &original, 1_000).await.unwrap());

            let reason = transition::apply_window_transition(
                &pool,
                Some(&original),
                &updated,
                5_000,
                5_000,
                active_session::start_session_for_transition,
            )
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

            assert!(active_session::start_session(&pool, &window, 1_000).await.unwrap());

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

            assert!(active_session::start_session(&pool, &window, 1_000).await.unwrap());

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

    #[test]
    fn tracking_pause_seals_active_session_and_returns_pause_reason() {
        tauri::async_runtime::block_on(async {
            let pool = setup_test_db().await;
            let window = make_window(&[]);

            assert!(active_session::start_session(&pool, &window, 1_000).await.unwrap());

            let reason = seal_active_sessions_for_tracking_pause(&pool, 5_000)
                .await
                .unwrap();

            let ended: Option<(i64, i64)> = sqlx::query_as(
                "SELECT end_time, duration FROM sessions WHERE end_time IS NOT NULL LIMIT 1",
            )
            .fetch_optional(&pool)
            .await
            .unwrap();

            assert_eq!(reason, Some(TRACKING_REASON_TRACKING_PAUSED_SEALED));
            assert_eq!(ended, Some((5_000, 4_000)));
        });
    }

    #[test]
    fn tracking_pause_without_active_session_is_a_noop() {
        tauri::async_runtime::block_on(async {
            let pool = setup_test_db().await;

            let reason = seal_active_sessions_for_tracking_pause(&pool, 5_000)
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
    fn lock_after_tracking_pause_does_not_double_seal_closed_session() {
        tauri::async_runtime::block_on(async {
            let pool = setup_test_db().await;
            let window = make_window(&[]);

            assert!(active_session::start_session(&pool, &window, 1_000).await.unwrap());
            let pause_reason = seal_active_sessions_for_tracking_pause(&pool, 5_000)
                .await
                .unwrap();
            let lock_reason = apply_power_lifecycle_event(&pool, "lock", 8_000)
                .await
                .unwrap();

            let ended_sessions: Vec<(i64, i64)> = sqlx::query_as(
                "SELECT end_time, duration FROM sessions WHERE end_time IS NOT NULL",
            )
            .fetch_all(&pool)
            .await
            .unwrap();

            assert_eq!(pause_reason, Some(TRACKING_REASON_TRACKING_PAUSED_SEALED));
            assert_eq!(lock_reason, None);
            assert_eq!(ended_sessions, vec![(5_000, 4_000)]);
        });
    }

    #[test]
    fn tracking_pause_after_lock_is_a_noop_for_already_closed_session() {
        tauri::async_runtime::block_on(async {
            let pool = setup_test_db().await;
            let window = make_window(&[]);

            assert!(active_session::start_session(&pool, &window, 1_000).await.unwrap());
            let lock_reason = apply_power_lifecycle_event(&pool, "lock", 5_000)
                .await
                .unwrap();
            let pause_reason = seal_active_sessions_for_tracking_pause(&pool, 8_000)
                .await
                .unwrap();

            let ended_sessions: Vec<(i64, i64)> = sqlx::query_as(
                "SELECT end_time, duration FROM sessions WHERE end_time IS NOT NULL",
            )
            .fetch_all(&pool)
            .await
            .unwrap();

            assert_eq!(lock_reason, Some("session-ended-lock"));
            assert_eq!(pause_reason, None);
            assert_eq!(ended_sessions, vec![(5_000, 4_000)]);
        });
    }

    #[test]
    fn lock_after_startup_seal_is_a_noop_for_already_closed_session() {
        tauri::async_runtime::block_on(async {
            let pool = setup_test_db().await;
            let window = make_window(&[]);

            assert!(active_session::start_session(&pool, &window, 1_000).await.unwrap());
            tracker_settings::save_tracker_timestamp(
                &pool,
                tracker_settings::TRACKER_LAST_HEARTBEAT_KEY,
                8_000,
            )
            .await
            .unwrap();

            let startup_reason = startup::seal_startup_active_session_in_pool(&pool, 20_000)
                .await
                .unwrap();
            let lock_reason = apply_power_lifecycle_event(&pool, "lock", 25_000)
                .await
                .unwrap();

            let ended_sessions: Vec<(i64, i64)> = sqlx::query_as(
                "SELECT end_time, duration FROM sessions WHERE end_time IS NOT NULL",
            )
            .fetch_all(&pool)
            .await
            .unwrap();

            assert_eq!(startup_reason, Some(8_000));
            assert_eq!(lock_reason, None);
            assert_eq!(ended_sessions, vec![(8_000, 7_000)]);
        });
    }

    #[test]
    fn suspend_after_startup_seal_is_a_noop_for_already_closed_session() {
        tauri::async_runtime::block_on(async {
            let pool = setup_test_db().await;
            let window = make_window(&[]);

            assert!(active_session::start_session(&pool, &window, 1_000).await.unwrap());
            tracker_settings::save_tracker_timestamp(
                &pool,
                tracker_settings::TRACKER_LAST_HEARTBEAT_KEY,
                8_000,
            )
            .await
            .unwrap();

            let startup_reason = startup::seal_startup_active_session_in_pool(&pool, 20_000)
                .await
                .unwrap();
            let suspend_reason = apply_power_lifecycle_event(&pool, "suspend", 25_000)
                .await
                .unwrap();

            let ended_sessions: Vec<(i64, i64)> = sqlx::query_as(
                "SELECT end_time, duration FROM sessions WHERE end_time IS NOT NULL",
            )
            .fetch_all(&pool)
            .await
            .unwrap();

            assert_eq!(startup_reason, Some(8_000));
            assert_eq!(suspend_reason, None);
            assert_eq!(ended_sessions, vec![(8_000, 7_000)]);
        });
    }

    #[test]
    fn tracking_pause_after_startup_seal_is_a_noop_for_already_closed_session() {
        tauri::async_runtime::block_on(async {
            let pool = setup_test_db().await;
            let window = make_window(&[]);

            assert!(active_session::start_session(&pool, &window, 1_000).await.unwrap());
            tracker_settings::save_tracker_timestamp(
                &pool,
                tracker_settings::TRACKER_LAST_HEARTBEAT_KEY,
                8_000,
            )
            .await
            .unwrap();

            let startup_reason = startup::seal_startup_active_session_in_pool(&pool, 20_000)
                .await
                .unwrap();
            let pause_reason = seal_active_sessions_for_tracking_pause(&pool, 25_000)
                .await
                .unwrap();

            let ended_sessions: Vec<(i64, i64)> = sqlx::query_as(
                "SELECT end_time, duration FROM sessions WHERE end_time IS NOT NULL",
            )
            .fetch_all(&pool)
            .await
            .unwrap();

            assert_eq!(startup_reason, Some(8_000));
            assert_eq!(pause_reason, None);
            assert_eq!(ended_sessions, vec![(8_000, 7_000)]);
        });
    }

    #[test]
    fn startup_self_heal_normalizes_closed_session_duration() {
        tauri::async_runtime::block_on(async {
            let pool = setup_test_db().await;

            pool.execute(
                "INSERT INTO sessions (app_name, exe_name, window_title, start_time, end_time, duration)
                 VALUES ('QQ', 'QQ.exe', 'Chat', 1000, 5000, 99)",
            )
            .await
            .unwrap();

            let affected = sessions::normalize_closed_session_durations(&pool)
                .await
                .unwrap();
            let duration: i64 = sqlx::query_scalar("SELECT duration FROM sessions LIMIT 1")
                .fetch_one(&pool)
                .await
                .unwrap();

            assert_eq!(affected, 1);
            assert_eq!(duration, 4000);
        });
    }
}
