use crate::domain::backup::BackupSession;
use sqlx::{Pool, Row, Sqlite, Transaction};

pub async fn fetch_all_for_backup(pool: &Pool<Sqlite>) -> Result<Vec<BackupSession>, String> {
    let rows = sqlx::query(
        "SELECT id, app_name, exe_name, window_title, start_time, end_time, duration
         FROM sessions
         ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|error| format!("failed to read sessions for backup: {error}"))?;

    Ok(rows
        .into_iter()
        .map(|row| BackupSession {
            id: row.get("id"),
            app_name: row.get("app_name"),
            exe_name: row.get("exe_name"),
            window_title: row.get("window_title"),
            start_time: row.get("start_time"),
            end_time: row.get("end_time"),
            duration: row.get("duration"),
        })
        .collect())
}

pub async fn clear_for_restore(tx: &mut Transaction<'_, Sqlite>) -> Result<(), String> {
    sqlx::query("DELETE FROM sessions")
        .execute(&mut **tx)
        .await
        .map_err(|error| format!("failed to clear sessions before restore: {error}"))?;
    Ok(())
}

pub async fn insert_for_restore(
    tx: &mut Transaction<'_, Sqlite>,
    sessions: &[BackupSession],
) -> Result<(), String> {
    for session in sessions {
        sqlx::query(
            "INSERT INTO sessions (
               id, app_name, exe_name, window_title, start_time, end_time, duration
             ) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(session.id)
        .bind(&session.app_name)
        .bind(&session.exe_name)
        .bind(&session.window_title)
        .bind(session.start_time)
        .bind(session.end_time)
        .bind(session.duration)
        .execute(&mut **tx)
        .await
        .map_err(|error| format!("failed to restore sessions: {error}"))?;
    }

    Ok(())
}
