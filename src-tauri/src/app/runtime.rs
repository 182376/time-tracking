use crate::app::state::DesktopBehaviorState;
use crate::app::tray::{apply_tray_visibility, setup_tray, MAIN_WINDOW_LABEL};
use crate::data::sqlite_pool::wait_for_sqlite_pool;
use crate::data::repositories::app_settings;
use crate::engine::tracking_runtime;
use crate::engine::updater::{self, UpdaterRuntimeState};
use crate::platform::windows::power;
use std::sync::Arc;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
use tokio::time::{sleep, Duration};

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
        #[cfg(all(debug_assertions, target_os = "windows"))]
        {
            let executable_path = std::env::current_exe()
                .ok()
                .map(|path| path.display().to_string())
                .unwrap_or_else(|| "<unknown>".to_string());
            return Err(format!(
                "autostart enable blocked in debug build on Windows to avoid registering a debug executable path ({executable_path}). Please enable launch-at-login from the installed release build."
            ));
        }

        #[cfg(not(all(debug_assertions, target_os = "windows")))]
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

pub(crate) async fn sync_desktop_behavior_from_storage<R: Runtime>(
    app: AppHandle<R>,
    launched_by_autostart: bool,
) -> Result<(), String> {
    let pool = wait_for_sqlite_pool(&app).await?;
    let loaded = app_settings::load_desktop_behavior_settings(&pool)
        .await
        .map_err(|error| format!("failed to load desktop behavior settings: {error}"))?;

    let state = app.state::<DesktopBehaviorState>();
    state.update_desktop(loaded.close_behavior, loaded.minimize_behavior);
    let next = state.update_launch(loaded.launch_at_login, loaded.start_minimized);

    if let Err(error) = apply_autostart(&app, next.launch_at_login) {
        eprintln!("[tray] failed to apply autostart setting: {error}");
    }
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

    let updater_handle = app.handle().clone();
    let updater_state: UpdaterRuntimeState = {
        let state = updater_handle.state::<UpdaterRuntimeState>();
        (*state).clone()
    };
    tauri::async_runtime::spawn(async move {
        updater::run_startup_auto_check(updater_handle, updater_state).await;
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
