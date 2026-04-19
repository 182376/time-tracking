use super::metadata;
use crate::data::repositories::sessions;
use crate::platform::windows::foreground as tracker;
use sqlx::{Pool, Sqlite};
use std::future::Future;
use std::pin::Pin;

pub(crate) async fn start_session_with_continuity_group_start_time(
    pool: &Pool<Sqlite>,
    window: &tracker::WindowInfo,
    start_time: i64,
    continuity_group_start_time: i64,
) -> Result<bool, sqlx::Error> {
    let continuity_group_start_time = continuity_group_start_time.min(start_time);
    let app_name = metadata::map_app_name(&window.exe_name, &window.process_path);
    let did_start = sessions::start_session(
        pool,
        &app_name,
        &window.exe_name,
        &window.title,
        start_time,
        continuity_group_start_time,
    )
    .await?;
    if !did_start {
        return Ok(false);
    }

    if !window.exe_name.is_empty() {
        let pool = pool.clone();
        let exe_name = window.exe_name.clone();
        let process_path = window.process_path.clone();
        let hwnd = window.hwnd.clone();
        let root_owner_hwnd = window.root_owner_hwnd.clone();

        tauri::async_runtime::spawn(async move {
            if let Err(error) = metadata::ensure_icon_cache(
                &pool,
                &exe_name,
                &process_path,
                &root_owner_hwnd,
                &hwnd,
            )
            .await
            {
                eprintln!("[tracker] failed to update icon cache: {error}");
            }
        });
    }

    Ok(did_start)
}

#[cfg(test)]
pub(crate) async fn start_session(
    pool: &Pool<Sqlite>,
    window: &tracker::WindowInfo,
    start_time: i64,
) -> Result<bool, sqlx::Error> {
    start_session_with_continuity_group_start_time(pool, window, start_time, start_time).await
}

pub(crate) fn start_session_for_transition<'a>(
    pool: &'a Pool<Sqlite>,
    window: &'a tracker::WindowInfo,
    start_time: i64,
    continuity_group_start_time: i64,
) -> Pin<Box<dyn Future<Output = Result<bool, sqlx::Error>> + Send + 'a>> {
    Box::pin(start_session_with_continuity_group_start_time(
        pool,
        window,
        start_time,
        continuity_group_start_time,
    ))
}
