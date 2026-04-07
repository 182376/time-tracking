use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TrackingDataChangedPayload {
    pub reason: String,
    pub changed_at_ms: u64,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct WindowTransitionDecision {
    pub reason: &'static str,
    pub should_end_previous: bool,
    pub should_start_next: bool,
    pub should_refresh_metadata: bool,
    pub end_time_override: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WindowSessionIdentity {
    pub app_key: String,
    pub instance_key: String,
}

#[derive(Clone, Debug)]
pub struct ActiveSessionSnapshot {
    pub start_time: i64,
    pub exe_name: String,
    pub window_title: String,
}
