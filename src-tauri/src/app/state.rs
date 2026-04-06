use crate::domain::settings::{CloseBehavior, DesktopBehaviorSettings, MinimizeBehavior};
use std::sync::Mutex;

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
