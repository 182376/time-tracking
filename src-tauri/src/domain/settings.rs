use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CloseBehavior {
    Exit,
    #[default]
    Tray,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MinimizeBehavior {
    #[default]
    Taskbar,
    Tray,
}

#[derive(Clone, Copy, Debug)]
pub struct DesktopBehaviorSettings {
    pub close_behavior: CloseBehavior,
    pub minimize_behavior: MinimizeBehavior,
    pub launch_at_login: bool,
    pub start_minimized: bool,
}

impl Default for DesktopBehaviorSettings {
    fn default() -> Self {
        Self {
            close_behavior: CloseBehavior::Tray,
            minimize_behavior: MinimizeBehavior::Taskbar,
            launch_at_login: false,
            start_minimized: true,
        }
    }
}

impl DesktopBehaviorSettings {
    pub fn should_keep_tray_visible(self) -> bool {
        self.close_behavior == CloseBehavior::Tray || self.minimize_behavior == MinimizeBehavior::Tray
    }

    pub fn should_start_minimized_on_autostart(self) -> bool {
        self.launch_at_login && self.start_minimized
    }
}

pub fn parse_close_behavior(raw: &str) -> CloseBehavior {
    if raw.trim().eq_ignore_ascii_case("exit") {
        CloseBehavior::Exit
    } else {
        CloseBehavior::Tray
    }
}

pub fn parse_minimize_behavior(raw: &str) -> MinimizeBehavior {
    if raw.trim().eq_ignore_ascii_case("tray") {
        MinimizeBehavior::Tray
    } else {
        MinimizeBehavior::Taskbar
    }
}

pub fn parse_boolean_setting(raw: &str, fallback: bool) -> bool {
    match raw.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => true,
        "0" | "false" | "no" | "off" => false,
        _ => fallback,
    }
}
