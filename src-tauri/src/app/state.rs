use serde::{Deserialize, Serialize};
use std::sync::Mutex;

pub(crate) const CLOSE_BEHAVIOR_KEY: &str = "close_behavior";
pub(crate) const MINIMIZE_BEHAVIOR_KEY: &str = "minimize_behavior";
pub(crate) const LAUNCH_AT_LOGIN_KEY: &str = "launch_at_login";
pub(crate) const START_MINIMIZED_KEY: &str = "start_minimized";

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum CloseBehavior {
    Exit,
    #[default]
    Tray,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum MinimizeBehavior {
    #[default]
    Taskbar,
    Tray,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct DesktopBehaviorSettings {
    pub(crate) close_behavior: CloseBehavior,
    pub(crate) minimize_behavior: MinimizeBehavior,
    pub(crate) launch_at_login: bool,
    pub(crate) start_minimized: bool,
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
    pub(crate) fn should_keep_tray_visible(self) -> bool {
        self.close_behavior == CloseBehavior::Tray || self.minimize_behavior == MinimizeBehavior::Tray
    }

    pub(crate) fn should_start_minimized_on_autostart(self) -> bool {
        self.launch_at_login && self.start_minimized
    }
}

#[derive(Debug, Default)]
pub(crate) struct DesktopBehaviorState {
    inner: Mutex<DesktopBehaviorSettings>,
}

impl DesktopBehaviorState {
    pub(crate) fn snapshot(&self) -> DesktopBehaviorSettings {
        match self.inner.lock() {
            Ok(guard) => *guard,
            Err(poisoned) => *poisoned.into_inner(),
        }
    }

    pub(crate) fn update_desktop(
        &self,
        close_behavior: CloseBehavior,
        minimize_behavior: MinimizeBehavior,
    ) -> DesktopBehaviorSettings {
        match self.inner.lock() {
            Ok(mut guard) => {
                guard.close_behavior = close_behavior;
                guard.minimize_behavior = minimize_behavior;
                *guard
            }
            Err(poisoned) => {
                let mut guard = poisoned.into_inner();
                guard.close_behavior = close_behavior;
                guard.minimize_behavior = minimize_behavior;
                *guard
            }
        }
    }

    pub(crate) fn update_launch(
        &self,
        launch_at_login: bool,
        start_minimized: bool,
    ) -> DesktopBehaviorSettings {
        match self.inner.lock() {
            Ok(mut guard) => {
                guard.launch_at_login = launch_at_login;
                guard.start_minimized = start_minimized;
                *guard
            }
            Err(poisoned) => {
                let mut guard = poisoned.into_inner();
                guard.launch_at_login = launch_at_login;
                guard.start_minimized = start_minimized;
                *guard
            }
        }
    }
}

pub(crate) fn parse_close_behavior(raw: &str) -> CloseBehavior {
    if raw.trim().eq_ignore_ascii_case("exit") {
        CloseBehavior::Exit
    } else {
        CloseBehavior::Tray
    }
}

pub(crate) fn parse_minimize_behavior(raw: &str) -> MinimizeBehavior {
    if raw.trim().eq_ignore_ascii_case("tray") {
        MinimizeBehavior::Tray
    } else {
        MinimizeBehavior::Taskbar
    }
}

pub(crate) fn parse_boolean_setting(raw: &str, fallback: bool) -> bool {
    match raw.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => true,
        "0" | "false" | "no" | "off" => false,
        _ => fallback,
    }
}
