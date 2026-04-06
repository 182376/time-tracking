use crate::app::{now_ms, wait_for_sqlite_pool};
use crate::app::state::{parse_boolean_setting, CloseBehavior, DesktopBehaviorSettings, DesktopBehaviorState, MinimizeBehavior};
use crate::tracking_runtime;
use sqlx::{Pool, Row, Sqlite};
use tauri::{
    menu::{Menu, MenuEvent, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime, Window, WindowEvent,
};

pub(crate) const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_ID: &str = "main";
const TRAY_MENU_SHOW_ID: &str = "tray-show-main";
const TRAY_MENU_TOGGLE_PAUSE_ID: &str = "tray-toggle-pause";
const TRAY_MENU_QUIT_ID: &str = "tray-quit";
const TRACKING_PAUSED_KEY: &str = "tracking_paused";

pub(crate) fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub(crate) fn apply_tray_visibility<R: Runtime>(app: &AppHandle<R>, settings: DesktopBehaviorSettings) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        if let Err(error) = tray.set_visible(settings.should_keep_tray_visible()) {
            eprintln!("[tray] failed to apply visibility: {error}");
        }
    }
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
        "INSERT INTO settings (key, value) VALUES (?, ?)\n         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
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

pub(crate) fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
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

pub(crate) fn handle_tray_icon_event<R: Runtime>(app: &AppHandle<R>, event: TrayIconEvent) {
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

pub(crate) fn handle_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
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

pub(crate) fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
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
