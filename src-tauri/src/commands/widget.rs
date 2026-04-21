use crate::app::{tray, widget};
use crate::data::repositories::widget_state;
use crate::data::sqlite_pool::wait_for_sqlite_pool;
use crate::domain::widget::{WidgetPlacement, WidgetSide};
use tauri::AppHandle;

#[tauri::command]
pub async fn cmd_get_widget_placement(app: AppHandle) -> Result<WidgetPlacement, String> {
    let pool = wait_for_sqlite_pool(&app).await?;
    widget_state::load_widget_placement(&pool)
        .await
        .map_err(|error| format!("failed to load widget placement: {error}"))
}

#[tauri::command]
pub async fn cmd_set_widget_placement(
    side: WidgetSide,
    anchor_y: f64,
    app: AppHandle,
) -> Result<(), String> {
    let pool = wait_for_sqlite_pool(&app).await?;
    widget_state::save_widget_placement(&pool, WidgetPlacement::new(side, anchor_y))
        .await
        .map_err(|error| format!("failed to save widget placement: {error}"))
}

#[tauri::command]
pub async fn cmd_apply_widget_layout(
    side: WidgetSide,
    anchor_y: f64,
    expanded: bool,
    show_object_slot: bool,
    app: AppHandle,
) -> Result<(), String> {
    widget::apply_widget_layout(
        &app,
        WidgetPlacement::new(side, anchor_y),
        expanded,
        show_object_slot,
    )
    .await
}

#[tauri::command]
pub async fn cmd_set_widget_expanded(
    expanded: bool,
    show_object_slot: bool,
    app: AppHandle,
) -> Result<(), String> {
    widget::set_widget_window_expanded(&app, expanded, show_object_slot).await
}

#[tauri::command]
pub fn cmd_show_main_window(app: AppHandle) {
    tray::show_main_window(&app);
}

#[tauri::command]
pub fn cmd_hide_widget_window(app: AppHandle) {
    widget::close_widget_window(&app);
}

#[tauri::command]
pub async fn cmd_toggle_tracking_paused(app: AppHandle) -> Result<(), String> {
    tray::toggle_tracking_paused(app).await
}

#[tauri::command]
pub async fn cmd_show_widget_window(app: AppHandle) -> Result<(), String> {
    widget::show_widget_window(&app, None).await
}
