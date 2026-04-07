use sqlx::{Pool, Sqlite};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_sql::{DbInstances, DbPool};
use tokio::time::{sleep, Duration};

pub const SQLITE_DB_NAME: &str = "sqlite:timetracker.db";

pub async fn wait_for_sqlite_pool<R: Runtime>(app: &AppHandle<R>) -> Result<Pool<Sqlite>, String> {
    let mut wait_cycles: u64 = 0;

    loop {
        if let Some(instances) = app.try_state::<DbInstances>() {
            let instances = instances.0.read().await;
            if let Some(DbPool::Sqlite(pool)) = instances.get(SQLITE_DB_NAME) {
                return Ok(pool.clone());
            }
        }

        wait_cycles += 1;
        if wait_cycles > 300 {
            return Err("sqlite pool not available in time".to_string());
        }

        sleep(Duration::from_millis(100)).await;
    }
}
