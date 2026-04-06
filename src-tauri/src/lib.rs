mod app;
mod commands;
mod db_schema;
mod icon_extractor;
mod power_watcher;
mod tracker;
mod tracking_runtime;

use std::sync::Arc;

use app::state::DesktopBehaviorState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let runtime_health = Arc::new(tracking_runtime::RuntimeHealthState::default());
    let launched_by_autostart = app::was_launched_by_autostart();

    tauri::Builder::default()
        .manage(DesktopBehaviorState::default())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(vec![app::AUTOSTART_ARG.to_string()])
                .build(),
        )
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:timetracker.db", db_schema::tracker_migrations())
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::apps::get_icon,
            tracker::get_current_active_window,
            tracker::cmd_set_afk_timeout,
            commands::settings::cmd_set_desktop_behavior,
            commands::settings::cmd_set_launch_behavior,
            commands::backup::cmd_pick_backup_save_file,
            commands::backup::cmd_pick_backup_file,
            commands::backup::cmd_preview_backup,
            commands::backup::cmd_export_backup,
            commands::backup::cmd_restore_backup
        ])
        .on_menu_event(app::tray::handle_menu_event)
        .on_tray_icon_event(app::tray::handle_tray_icon_event)
        .on_window_event(app::tray::handle_window_event)
        .setup(move |app| Ok(app::setup(app, runtime_health.clone(), launched_by_autostart)?))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
