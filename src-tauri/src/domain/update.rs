use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum UpdateStatus {
    Idle,
    Checking,
    UpToDate,
    Available,
    Downloading,
    Downloaded,
    Installing,
    Error,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UpdateSnapshot {
    pub current_version: String,
    pub status: UpdateStatus,
    pub latest_version: Option<String>,
    pub release_notes: Option<String>,
    pub release_date: Option<String>,
    pub error_message: Option<String>,
}

impl UpdateSnapshot {
    pub fn idle(current_version: String) -> Self {
        Self {
            current_version,
            status: UpdateStatus::Idle,
            latest_version: None,
            release_notes: None,
            release_date: None,
            error_message: None,
        }
    }
}
