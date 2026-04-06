use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BackupMeta {
    pub exported_at_ms: u64,
    pub schema_version: u32,
    pub app_version: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BackupSession {
    pub id: i64,
    pub app_name: String,
    pub exe_name: String,
    pub window_title: Option<String>,
    pub start_time: i64,
    pub end_time: Option<i64>,
    pub duration: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BackupSetting {
    pub key: String,
    pub value: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BackupIconCache {
    pub exe_name: String,
    pub icon_base64: String,
    pub last_updated: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BackupPayload {
    pub version: u32,
    pub meta: BackupMeta,
    pub sessions: Vec<BackupSession>,
    pub settings: Vec<BackupSetting>,
    pub icon_cache: Vec<BackupIconCache>,
}

#[derive(Clone, Debug, Serialize)]
pub struct BackupPreview {
    pub version: u32,
    pub exported_at_ms: u64,
    pub schema_version: u32,
    pub app_version: String,
    pub compatibility_level: String,
    pub compatibility_message: String,
    pub session_count: usize,
    pub setting_count: usize,
    pub icon_cache_count: usize,
}
