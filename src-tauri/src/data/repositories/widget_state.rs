use super::tracker_settings::{load_setting_value, save_setting_value};
use crate::domain::widget::WidgetPlacement;
use sqlx::{Pool, Sqlite};

const WIDGET_SIDE_KEY: &str = "widget_side";
const WIDGET_ANCHOR_Y_KEY: &str = "widget_anchor_y";

pub async fn load_widget_placement(pool: &Pool<Sqlite>) -> Result<WidgetPlacement, sqlx::Error> {
    let side = load_setting_value(pool, WIDGET_SIDE_KEY).await?;
    let anchor_y = load_setting_value(pool, WIDGET_ANCHOR_Y_KEY).await?;

    Ok(WidgetPlacement::from_storage_values(
        side.as_deref(),
        anchor_y.as_deref(),
    ))
}

pub async fn save_widget_placement(
    pool: &Pool<Sqlite>,
    placement: WidgetPlacement,
) -> Result<(), sqlx::Error> {
    save_setting_value(pool, WIDGET_SIDE_KEY, placement.side.as_storage_value()).await?;
    let anchor_y = format!("{:.4}", placement.anchor_y);
    save_setting_value(pool, WIDGET_ANCHOR_Y_KEY, &anchor_y).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{load_widget_placement, save_widget_placement};
    use crate::data::migrations as db_schema;
    use crate::domain::widget::{WidgetPlacement, WidgetSide, DEFAULT_WIDGET_ANCHOR_Y};
    use sqlx::{Executor, SqlitePool};

    async fn setup_test_db() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        pool.execute(db_schema::MIGRATION_1_SQL).await.unwrap();
        pool.execute(db_schema::MIGRATION_2_SQL).await.unwrap();
        pool.execute(db_schema::MIGRATION_3_SQL).await.unwrap();
        pool
    }

    #[test]
    fn widget_placement_repo_round_trips_and_defaults() {
        tauri::async_runtime::block_on(async {
            let pool = setup_test_db().await;

            let defaults = load_widget_placement(&pool).await.unwrap();
            assert_eq!(defaults.side, WidgetSide::Right);
            assert_eq!(defaults.anchor_y, DEFAULT_WIDGET_ANCHOR_Y);

            let saved = WidgetPlacement::new(WidgetSide::Left, 0.66);
            save_widget_placement(&pool, saved).await.unwrap();

            let reloaded = load_widget_placement(&pool).await.unwrap();
            assert_eq!(reloaded.side, WidgetSide::Left);
            assert!((reloaded.anchor_y - 0.66).abs() < 0.001);
        });
    }
}
