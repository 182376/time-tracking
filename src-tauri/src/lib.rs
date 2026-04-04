mod db_schema;
mod icon_extractor;
mod power_watcher;
mod tracker;
mod tracking_runtime;

use std::sync::Arc;
use tokio::time::{sleep, Duration};

#[tauri::command]
fn get_icon(exe_path: String) -> Option<String> {
    icon_extractor::get_icon_base64(&exe_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let runtime_health = Arc::new(tracking_runtime::RuntimeHealthState::default());

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:timetracker.db", db_schema::tracker_migrations())
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_icon,
            tracker::get_current_active_window,
            tracker::cmd_set_afk_timeout
        ])
        .setup(move |app| {
            power_watcher::start(app.handle().clone());

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
