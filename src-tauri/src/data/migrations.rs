use tauri_plugin_sql::{Migration, MigrationKind};

pub const MIGRATION_1_SQL: &str = "
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_name TEXT NOT NULL,
        exe_name TEXT NOT NULL,
        window_title TEXT,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        duration INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(start_time);

    CREATE TABLE IF NOT EXISTS icon_cache (
        exe_name TEXT PRIMARY KEY,
        icon_base64 TEXT NOT NULL,
        last_updated INTEGER
    );
";

pub const MIGRATION_2_SQL: &str = "
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
";

pub const MIGRATION_3_SQL: &str = "
    UPDATE sessions
    SET end_time = start_time,
        duration = 0
    WHERE end_time IS NULL
      AND id NOT IN (
        SELECT id
        FROM sessions
        WHERE end_time IS NULL
        ORDER BY start_time DESC, id DESC
        LIMIT 1
      );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_single_active
    ON sessions((1))
    WHERE end_time IS NULL;
";

// Compatibility no-op migration for environments that already recorded v4.
// Keeping this version prevents startup failure when migration history exists.
pub const MIGRATION_4_SQL: &str = "
    SELECT 1;
";

// Compatibility no-op migration for environments that already recorded v5.
pub const MIGRATION_5_SQL: &str = "
    SELECT 1;
";

// Compatibility no-op migration for environments that already recorded v6.
pub const MIGRATION_6_SQL: &str = "
    SELECT 1;
";

pub fn tracker_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: MIGRATION_1_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_settings_table",
            sql: MIGRATION_2_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "dedupe_active_sessions_and_enforce_single_active",
            sql: MIGRATION_3_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "compatibility_noop_for_existing_v4_history",
            sql: MIGRATION_4_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "compatibility_noop_for_existing_v5_history",
            sql: MIGRATION_5_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "compatibility_noop_for_existing_v6_history",
            sql: MIGRATION_6_SQL,
            kind: MigrationKind::Up,
        },
    ]
}
