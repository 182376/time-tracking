use crate::app::state::{
    parse_boolean_setting, parse_close_behavior, parse_minimize_behavior, DesktopBehaviorSettings,
    DesktopBehaviorState, CLOSE_BEHAVIOR_KEY, LAUNCH_AT_LOGIN_KEY, MINIMIZE_BEHAVIOR_KEY,
    START_MINIMIZED_KEY,
};
use crate::app::tray::{apply_tray_visibility, setup_tray, MAIN_WINDOW_LABEL};
use crate::engine::tracking_runtime;
use crate::platform::windows::power;
use sqlx::{Pool, Row, Sqlite};
use std::sync::Arc;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
use tauri_plugin_sql::{DbInstances, DbPool};
use tokio::time::{sleep, Duration};

const DB_NAME: &str = "sqlite:timetracker.db";
pub const AUTOSTART_ARG: &str = "--autostart";

pub fn was_launched_by_autostart() -> bool {
    std::env::args().any(|arg| arg == AUTOSTART_ARG)
}

pub(crate) fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

pub(crate) fn apply_autostart<R: Runtime>(
    app: &AppHandle<R>,
    launch_at_login: bool,
) -> Result<(), String> {
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

pub(crate) async fn wait_for_sqlite_pool<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Pool<Sqlite>, String> {
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

pub(crate) async fn load_desktop_behavior_settings(
    pool: &Pool<Sqlite>,
) -> Result<DesktopBehaviorSettings, sqlx::Error> {
    let rows = sqlx::query("SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?)")
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

pub(crate) async fn sync_desktop_behavior_from_storage<R: Runtime>(
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

pub fn setup(
    app: &mut tauri::App,
    runtime_health: Arc<tracking_runtime::RuntimeHealthState>,
    launched_by_autostart: bool,
) -> tauri::Result<()> {
    power::start(app.handle().clone());

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
        if let Err(error) =
            sync_desktop_behavior_from_storage(behavior_sync_handle, launched_by_autostart).await
        {
            eprintln!("[tray] failed to sync desktop behavior from storage: {error}");
        }
    });

    let app_handle = app.handle().clone();
    let runtime_state = runtime_health.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            if let Err(error) = tracking_runtime::run(app_handle.clone(), runtime_state.clone()).await {
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
                tracking_runtime::watch(watchdog_handle.clone(), watchdog_state.clone()).await
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
}

