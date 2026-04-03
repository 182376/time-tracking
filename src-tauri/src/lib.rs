mod icon_extractor;
mod tracker;


use tauri::Emitter;
use tauri_plugin_sql::{Migration, MigrationKind};
use std::time::Duration;

#[tauri::command]
fn get_icon(exe_path: String) -> Option<String> {
    icon_extractor::get_icon_base64(&exe_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: "
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    app_name TEXT NOT NULL,
                    exe_name TEXT NOT NULL,
                    window_title TEXT,
                    start_time INTEGER NOT NULL,
                    end_time INTEGER,
                    duration INTEGER
                );
                CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(start_time);

                CREATE TABLE IF NOT EXISTS icon_cache (
                    exe_name TEXT PRIMARY KEY,
                    icon_base64 TEXT NOT NULL,
                    last_updated INTEGER
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_settings_table",
            sql: "
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "dedupe_active_sessions_and_enforce_single_active",
            sql: "
                UPDATE sessions
                SET end_time = start_time,
                    duration = 0
                WHERE end_time IS NULL
                  AND id NOT IN (
                    SELECT id
                    FROM sessions
                    WHERE end_time IS NULL
                    ORDER BY start_time DESC, id DESC
                    LIMIT 1
                  );

                CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_single_active
                ON sessions((1))
                WHERE end_time IS NULL;
            ",
            kind: MigrationKind::Up,
        }
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().add_migrations("sqlite:timetracker.db", migrations).build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_icon,
            tracker::get_current_active_window,
            tracker::cmd_set_afk_timeout
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    let window_info = tracker::get_active_window();
                    println!("Emitting: {:?}", window_info);
                    let _ = app_handle.emit("active-window-changed", window_info);
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
