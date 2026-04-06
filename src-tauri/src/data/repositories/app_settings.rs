use crate::domain::settings::{
    parse_boolean_setting, parse_close_behavior, parse_minimize_behavior, DesktopBehaviorSettings,
};
use sqlx::{Pool, Row, Sqlite};

const CLOSE_BEHAVIOR_KEY: &str = "close_behavior";
const MINIMIZE_BEHAVIOR_KEY: &str = "minimize_behavior";
const LAUNCH_AT_LOGIN_KEY: &str = "launch_at_login";
const START_MINIMIZED_KEY: &str = "start_minimized";

pub async fn load_desktop_behavior_settings(
    pool: &Pool<Sqlite>,
) -> Result<DesktopBehaviorSettings, sqlx::Error> {
    let rows = sqlx::query("SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?)")
        .bind(CLOSE_BEHAVIOR_KEY)
        .bind(MINIMIZE_BEHAVIOR_KEY)
        .bind(LAUNCH_AT_LOGIN_KEY)
        .bind(START_MINIMIZED_KEY)
        .fetch_all(pool)
        .await?;

    let mut close_behavior = None;
    let mut minimize_behavior = None;
    let mut launch_at_login = None;
    let mut start_minimized = None;

    for row in rows {
        let key: String = row.get("key");
        let value: String = row.get("value");

        match key.as_str() {
            CLOSE_BEHAVIOR_KEY => close_behavior = Some(parse_close_behavior(&value)),
            MINIMIZE_BEHAVIOR_KEY => {
                minimize_behavior = Some(parse_minimize_behavior(&value));
            }
            LAUNCH_AT_LOGIN_KEY => launch_at_login = Some(parse_boolean_setting(&value, false)),
            START_MINIMIZED_KEY => start_minimized = Some(parse_boolean_setting(&value, true)),
            _ => {}
        }
    }

    Ok(DesktopBehaviorSettings {
        close_behavior: close_behavior.unwrap_or_default(),
        minimize_behavior: minimize_behavior.unwrap_or_default(),
        launch_at_login: launch_at_login.unwrap_or(false),
        start_minimized: start_minimized.unwrap_or(true),
    })
}
