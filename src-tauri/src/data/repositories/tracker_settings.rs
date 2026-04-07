use crate::domain::settings::parse_boolean_setting;
use sqlx::{Pool, Row, Sqlite};

pub const TRACKER_LAST_HEARTBEAT_KEY: &str = "__tracker_last_heartbeat_ms";
pub const TRACKER_LAST_SUCCESSFUL_SAMPLE_KEY: &str = "__tracker_last_successful_sample_ms";
pub const TRACKER_LAST_STARTUP_SELF_HEAL_AT_KEY: &str = "__tracker_last_startup_self_heal_at_ms";
pub const TRACKER_LAST_STARTUP_SELF_HEAL_SUMMARY_KEY: &str = "__tracker_last_startup_self_heal_summary";

const TRACKING_PAUSED_KEY: &str = "tracking_paused";
pub const APP_OVERRIDE_KEY_PREFIX: &str = "__app_override::";

#[derive(Clone, Debug, serde::Deserialize, Default)]
struct StoredAppOverride {
    #[serde(rename = "captureTitle")]
    capture_title: Option<bool>,
}

pub async fn load_tracking_paused_setting(pool: &Pool<Sqlite>) -> Result<bool, sqlx::Error> {
    let row = sqlx::query("SELECT value FROM settings WHERE key = ? LIMIT 1")
        .bind(TRACKING_PAUSED_KEY)
        .fetch_optional(pool)
        .await?;

    Ok(row
        .and_then(|row| row.try_get::<String, _>("value").ok())
        .map(|value| parse_boolean_setting(&value, false))
        .unwrap_or(false))
}

pub async fn save_tracking_paused_setting(
    pool: &Pool<Sqlite>,
    tracking_paused: bool,
) -> Result<(), sqlx::Error> {
    let value = if tracking_paused { "1" } else { "0" };
    save_setting_value(pool, TRACKING_PAUSED_KEY, value).await
}

pub async fn load_capture_window_title_setting_for_app(
    pool: &Pool<Sqlite>,
    exe_name: &str,
) -> Result<bool, sqlx::Error> {
    let Some(canonical_exe_name) = normalize_exe_setting_key(exe_name) else {
        return Ok(true);
    };

    let setting_key = format!("{APP_OVERRIDE_KEY_PREFIX}{canonical_exe_name}");
    let row = sqlx::query("SELECT value FROM settings WHERE key = ? LIMIT 1")
        .bind(setting_key)
        .fetch_optional(pool)
        .await?;

    let Some(raw_value) = row.and_then(|row| row.try_get::<String, _>("value").ok()) else {
        return Ok(true);
    };

    let parsed_override = serde_json::from_str::<StoredAppOverride>(&raw_value).ok();
    Ok(parsed_override
        .and_then(|override_value| override_value.capture_title)
        .unwrap_or(true))
}

pub async fn load_afk_timeout_secs(
    pool: &Pool<Sqlite>,
    default_afk_timeout_secs: u64,
) -> Result<u64, sqlx::Error> {
    let row = sqlx::query("SELECT value FROM settings WHERE key = ? LIMIT 1")
        .bind("afk_timeout_secs")
        .fetch_optional(pool)
        .await?;

    Ok(row
        .and_then(|row| row.try_get::<String, _>("value").ok())
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(default_afk_timeout_secs))
}

pub async fn load_tracker_timestamp(
    pool: &Pool<Sqlite>,
    key: &str,
) -> Result<Option<i64>, sqlx::Error> {
    let row = sqlx::query("SELECT value FROM settings WHERE key = ? LIMIT 1")
        .bind(key)
        .fetch_optional(pool)
        .await?;

    Ok(row
        .and_then(|row| row.try_get::<String, _>("value").ok())
        .and_then(|value| value.parse::<i64>().ok()))
}

pub async fn save_tracker_timestamp(
    pool: &Pool<Sqlite>,
    key: &str,
    timestamp_ms: i64,
) -> Result<(), sqlx::Error> {
    save_setting_value(pool, key, &timestamp_ms.to_string()).await
}

pub async fn save_setting_value(
    pool: &Pool<Sqlite>,
    key: &str,
    value: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await?;

    Ok(())
}

fn normalize_exe_setting_key(exe_name: &str) -> Option<String> {
    let trimmed = exe_name.trim().trim_matches('"');
    if trimmed.is_empty() {
        return None;
    }

    let mut key = trimmed.to_ascii_lowercase();
    if !key.ends_with(".exe") {
        key.push_str(".exe");
    }

    Some(key)
}
