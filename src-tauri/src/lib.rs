mod app;
mod commands;
mod data;
mod domain;
mod engine;
mod platform;

use std::sync::Arc;

use app::state::DesktopBehaviorState;
use engine::updater::UpdaterRuntimeState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(debug_assertions)]
    let context = tauri::generate_context!("tauri.dev.conf.json");
    #[cfg(not(debug_assertions))]
    let context = tauri::generate_context!();
    let runtime_health = Arc::new(engine::tracking_runtime::RuntimeHealthState::default());
    let launched_by_autostart = app::runtime::was_launched_by_autostart();
    let app_version = context.package_info().version.to_string();
    let app_identifier = context.config().identifier.clone();

    if let Err(error) = tauri::async_runtime::block_on(
        data::sqlite_pool::repair_legacy_migration_history(&app_identifier),
    ) {
        eprintln!("[sql] failed to repair legacy migration history: {error}");
    }

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            app::tray::show_main_window(app);
        }));
    }

    builder
        .manage(DesktopBehaviorState::default())
        .manage(UpdaterRuntimeState::new(app_version))
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(vec![app::runtime::AUTOSTART_ARG.to_string()])
                .build(),
        )
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(data::sqlite_pool::SQLITE_DB_NAME, data::migrations::tracker_migrations())
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::apps::get_icon,
            commands::tracking::get_current_active_window,
            commands::tracking::cmd_set_idle_timeout,
            commands::settings::cmd_set_desktop_behavior,
            commands::settings::cmd_set_launch_behavior,
            commands::update::cmd_get_update_snapshot,
            commands::update::cmd_check_for_updates,
            commands::update::cmd_download_update,
            commands::update::cmd_install_update,
            commands::backup::cmd_pick_backup_save_file,
            commands::backup::cmd_pick_backup_file,
            commands::backup::cmd_preview_backup,
            commands::backup::cmd_export_backup,
            commands::backup::cmd_restore_backup
        ])
        .on_menu_event(app::tray::handle_menu_event)
        .on_tray_icon_event(app::tray::handle_tray_icon_event)
        .on_window_event(app::tray::handle_window_event)
        .setup(move |app| Ok(app::runtime::setup(app, runtime_health.clone(), launched_by_autostart)?))
        .run(context)
        .expect("error while running tauri application");
}
