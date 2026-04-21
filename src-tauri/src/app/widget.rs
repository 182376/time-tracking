use crate::data::repositories::widget_state;
use crate::data::sqlite_pool::wait_for_sqlite_pool;
use crate::domain::widget::{WidgetPlacement, WidgetSide};
use tauri::{
    AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, Position, Runtime, Size,
    WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

pub(crate) const WIDGET_WINDOW_LABEL: &str = "widget";
const WIDGET_TITLE: &str = "Time Tracker Widget";
const WIDGET_EXPANDED_WIDTH_WITH_OBJECT: u32 = 180;
const WIDGET_EXPANDED_WIDTH_COMPACT: u32 = 140;
const WIDGET_EXPANDED_HEIGHT: u32 = 48;
const WIDGET_COLLAPSED_WIDTH: u32 = 34;
const WIDGET_COLLAPSED_HEIGHT: u32 = 48;
const WIDGET_COLLAPSED_VISIBLE_WIDTH: u32 = 24;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct WidgetWindowBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

pub(crate) async fn show_widget_window<R: Runtime>(
    app: &AppHandle<R>,
    preferred_monitor: Option<Monitor>,
) -> Result<(), String> {
    let pool = wait_for_sqlite_pool(app).await?;
    let placement = widget_state::load_widget_placement(&pool)
        .await
        .map_err(|error| format!("failed to load widget placement: {error}"))?;
    apply_widget_layout_internal(app, preferred_monitor, placement, false, false, false).await
}

pub(crate) async fn apply_widget_layout<R: Runtime>(
    app: &AppHandle<R>,
    placement: WidgetPlacement,
    expanded: bool,
    show_object_slot: bool,
) -> Result<(), String> {
    let pool = wait_for_sqlite_pool(app).await?;
    widget_state::save_widget_placement(&pool, placement)
        .await
        .map_err(|error| format!("failed to save widget placement: {error}"))?;
    apply_widget_layout_internal(app, None, placement, expanded, expanded, show_object_slot).await
}

pub(crate) async fn set_widget_window_expanded<R: Runtime>(
    app: &AppHandle<R>,
    expanded: bool,
    show_object_slot: bool,
) -> Result<(), String> {
    let pool = wait_for_sqlite_pool(app).await?;
    let placement = widget_state::load_widget_placement(&pool)
        .await
        .map_err(|error| format!("failed to load widget placement: {error}"))?;
    apply_widget_layout_internal(app, None, placement, expanded, expanded, show_object_slot).await
}

pub(crate) fn close_widget_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(WIDGET_WINDOW_LABEL) {
        let _ = window.hide();
    }
}

pub(crate) fn resolve_widget_monitor<R: Runtime>(
    app: &AppHandle<R>,
    preferred_monitor: Option<Monitor>,
) -> Result<Monitor, String> {
    preferred_monitor
        .or_else(|| {
            app.get_webview_window(crate::app::tray::MAIN_WINDOW_LABEL)
                .and_then(|window| window.current_monitor().ok().flatten())
        })
        .or_else(|| app.primary_monitor().ok().flatten())
        .ok_or_else(|| "failed to resolve widget monitor".to_string())
}

fn apply_widget_bounds<R: Runtime>(
    window: &WebviewWindow<R>,
    bounds: WidgetWindowBounds,
) -> Result<(), String> {
    let _ = window.set_shadow(false);
    window
        .set_size(Size::Physical(PhysicalSize::new(
            bounds.width,
            bounds.height,
        )))
        .map_err(|error| format!("failed to size widget window: {error}"))?;
    window
        .set_position(Position::Physical(PhysicalPosition::new(
            bounds.x, bounds.y,
        )))
        .map_err(|error| format!("failed to position widget window: {error}"))?;
    Ok(())
}

async fn apply_widget_layout_internal<R: Runtime>(
    app: &AppHandle<R>,
    preferred_monitor: Option<Monitor>,
    placement: WidgetPlacement,
    expanded: bool,
    focus_after_show: bool,
    show_object_slot: bool,
) -> Result<(), String> {
    let monitor = resolve_widget_monitor(app, preferred_monitor)?;
    let bounds = resolve_widget_bounds(&monitor, placement, expanded, show_object_slot);

    if let Some(window) = app.get_webview_window(WIDGET_WINDOW_LABEL) {
        apply_widget_bounds(&window, bounds)?;
        let _ = window.show();
        let _ = window.set_focusable(true);
        if focus_after_show {
            let _ = window.set_focus();
        }
        return Ok(());
    }

    let logical_x = f64::from(bounds.x) / monitor.scale_factor();
    let logical_y = f64::from(bounds.y) / monitor.scale_factor();
    let logical_width = f64::from(bounds.width) / monitor.scale_factor();
    let logical_height = f64::from(bounds.height) / monitor.scale_factor();

    let window = WebviewWindowBuilder::new(
        app,
        WIDGET_WINDOW_LABEL,
        WebviewUrl::App("index.html".into()),
    )
    .title(WIDGET_TITLE)
    .position(logical_x, logical_y)
    .inner_size(logical_width, logical_height)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .closable(false)
    .decorations(false)
    .shadow(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .focusable(true)
    .focused(false)
    .visible(false)
    .build()
    .map_err(|error| format!("failed to create widget window: {error}"))?;

    let _ = window.set_focusable(true);
    let _ = window.set_shadow(false);
    window
        .show()
        .map_err(|error| format!("failed to show widget window: {error}"))?;
    if focus_after_show {
        let _ = window.set_focus();
    }
    Ok(())
}

fn resolve_widget_bounds(
    monitor: &Monitor,
    placement: WidgetPlacement,
    expanded: bool,
    show_object_slot: bool,
) -> WidgetWindowBounds {
    let (width, height) = if expanded {
        (
            if show_object_slot {
                WIDGET_EXPANDED_WIDTH_WITH_OBJECT
            } else {
                WIDGET_EXPANDED_WIDTH_COMPACT
            },
            WIDGET_EXPANDED_HEIGHT,
        )
    } else {
        (WIDGET_COLLAPSED_WIDTH, WIDGET_COLLAPSED_HEIGHT)
    };
    let work_area = monitor.work_area();
    resolve_widget_bounds_from_work_area(
        work_area.position.x,
        work_area.position.y,
        work_area.size.width,
        work_area.size.height,
        placement,
        width,
        height,
    )
}

fn resolve_widget_bounds_from_work_area(
    work_x: i32,
    work_y: i32,
    work_width: u32,
    work_height: u32,
    placement: WidgetPlacement,
    width: u32,
    height: u32,
) -> WidgetWindowBounds {
    let max_y_offset = work_height.saturating_sub(height);
    let y_offset = (placement.anchor_y * f64::from(max_y_offset)).round() as i32;
    let y = work_y + y_offset;
    let collapsed_hidden_offset = if width == WIDGET_COLLAPSED_WIDTH {
        (width.saturating_sub(WIDGET_COLLAPSED_VISIBLE_WIDTH)) as i32
    } else {
        0
    };
    let x = match placement.side {
        WidgetSide::Left => work_x - collapsed_hidden_offset,
        WidgetSide::Right => work_x + work_width as i32 - width as i32 + collapsed_hidden_offset,
    };

    WidgetWindowBounds {
        x,
        y,
        width,
        height,
    }
}

#[cfg(test)]
mod tests {
    use super::{resolve_widget_bounds_from_work_area, WidgetWindowBounds};
    use crate::domain::widget::{WidgetPlacement, WidgetSide};

    #[test]
    fn widget_bounds_snap_to_expected_collapsed_edge_and_height() {
        let left = resolve_widget_bounds_from_work_area(
            0,
            0,
            1920,
            1040,
            WidgetPlacement::new(WidgetSide::Left, 0.5),
            34,
            48,
        );
        assert_eq!(
            left,
            WidgetWindowBounds {
                x: -10,
                y: 496,
                width: 34,
                height: 48,
            }
        );

        let right = resolve_widget_bounds_from_work_area(
            0,
            0,
            1920,
            1040,
            WidgetPlacement::new(WidgetSide::Right, 0.0),
            34,
            48,
        );
        assert_eq!(right.x, 1896);
        assert_eq!(right.y, 0);
    }

    #[test]
    fn widget_bounds_snap_to_expected_expanded_edge_and_height() {
        let left = resolve_widget_bounds_from_work_area(
            0,
            0,
            1920,
            1040,
            WidgetPlacement::new(WidgetSide::Left, 0.5),
            148,
            48,
        );
        assert_eq!(
            left,
            WidgetWindowBounds {
                x: 0,
                y: 496,
                width: 148,
                height: 48,
            }
        );

        let right = resolve_widget_bounds_from_work_area(
            0,
            0,
            1920,
            1040,
            WidgetPlacement::new(WidgetSide::Right, 0.0),
            148,
            48,
        );
        assert_eq!(right.x, 1772);
        assert_eq!(right.y, 0);
    }

    #[test]
    fn widget_bounds_snap_to_expected_compact_expanded_width() {
        let right = resolve_widget_bounds_from_work_area(
            0,
            0,
            1920,
            1040,
            WidgetPlacement::new(WidgetSide::Right, 0.0),
            116,
            48,
        );

        assert_eq!(right.x, 1804);
        assert_eq!(right.y, 0);
        assert_eq!(right.width, 116);
    }
}
