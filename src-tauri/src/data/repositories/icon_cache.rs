use crate::domain::backup::BackupIconCache;
use sqlx::{Pool, Row, Sqlite, Transaction};

pub async fn fetch_all_for_backup(pool: &Pool<Sqlite>) -> Result<Vec<BackupIconCache>, String> {
    let rows = sqlx::query("SELECT exe_name, icon_base64, last_updated FROM icon_cache")
        .fetch_all(pool)
        .await
        .map_err(|error| format!("failed to read icon cache for backup: {error}"))?;

    Ok(rows
        .into_iter()
        .map(|row| BackupIconCache {
            exe_name: row.get("exe_name"),
            icon_base64: row.get("icon_base64"),
            last_updated: row.get("last_updated"),
        })
        .collect())
}

pub async fn clear_for_restore(tx: &mut Transaction<'_, Sqlite>) -> Result<(), String> {
    sqlx::query("DELETE FROM icon_cache")
        .execute(&mut **tx)
        .await
        .map_err(|error| format!("failed to clear icon cache before restore: {error}"))?;
    Ok(())
}

pub async fn insert_for_restore(
    tx: &mut Transaction<'_, Sqlite>,
    icon_cache: &[BackupIconCache],
) -> Result<(), String> {
    for icon in icon_cache {
        sqlx::query("INSERT INTO icon_cache (exe_name, icon_base64, last_updated) VALUES (?, ?, ?)")
            .bind(&icon.exe_name)
            .bind(&icon.icon_base64)
            .bind(icon.last_updated)
            .execute(&mut **tx)
            .await
            .map_err(|error| format!("failed to restore icon cache: {error}"))?;
    }

    Ok(())
}
