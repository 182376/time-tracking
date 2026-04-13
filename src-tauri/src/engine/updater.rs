use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::data::repositories::update_state;
use crate::data::sqlite_pool::wait_for_sqlite_pool;
use crate::domain::update::{UpdateSnapshot, UpdateStatus};

#[derive(Clone)]
pub struct UpdaterRuntimeState {
    inner: Arc<Mutex<UpdaterStateInner>>,
}

struct UpdaterStateInner {
    snapshot: UpdateSnapshot,
    pending_update: Option<Update>,
}

impl UpdaterRuntimeState {
    pub fn new(current_version: String) -> Self {
        Self {
            inner: Arc::new(Mutex::new(UpdaterStateInner {
                snapshot: UpdateSnapshot::idle(current_version),
                pending_update: None,
            })),
        }
    }

    pub fn snapshot(&self) -> UpdateSnapshot {
        self.with_guard(|inner| inner.snapshot.clone())
    }

    fn set_checking(&self) {
        self.with_guard(|inner| {
            inner.snapshot.status = UpdateStatus::Checking;
            inner.snapshot.error_message = None;
        });
    }

    fn set_available(&self, update: Update) -> UpdateSnapshot {
        self.with_guard(|inner| {
            inner.snapshot.status = UpdateStatus::Available;
            inner.snapshot.latest_version = Some(update.version.clone());
            inner.snapshot.release_notes = update.body.clone();
            inner.snapshot.release_date = update.date.map(|value| value.to_string());
            inner.snapshot.error_message = None;
            inner.pending_update = Some(update);
            inner.snapshot.clone()
        })
    }

    fn set_up_to_date(&self) -> UpdateSnapshot {
        self.with_guard(|inner| {
            inner.snapshot.status = UpdateStatus::UpToDate;
            inner.snapshot.latest_version = None;
            inner.snapshot.release_notes = None;
            inner.snapshot.release_date = None;
            inner.snapshot.error_message = None;
            inner.pending_update = None;
            inner.snapshot.clone()
        })
    }

    fn set_error(&self, message: String) -> UpdateSnapshot {
        self.with_guard(|inner| {
            inner.snapshot.status = UpdateStatus::Error;
            inner.snapshot.error_message = Some(message);
            inner.snapshot.clone()
        })
    }

    fn set_downloading(&self) {
        self.with_guard(|inner| {
            inner.snapshot.status = UpdateStatus::Downloading;
            inner.snapshot.error_message = None;
        });
    }

    fn set_downloaded(&self) {
        self.with_guard(|inner| {
            inner.snapshot.status = UpdateStatus::Downloaded;
            inner.snapshot.error_message = None;
        });
    }

    fn set_installing(&self) {
        self.with_guard(|inner| {
            inner.snapshot.status = UpdateStatus::Installing;
            inner.snapshot.error_message = None;
        });
    }

    fn take_pending_update(&self) -> Option<Update> {
        self.with_guard(|inner| inner.pending_update.take())
    }

    fn restore_pending_update(&self, update: Update) {
        self.with_guard(|inner| {
            inner.pending_update = Some(update);
        });
    }

    fn with_guard<T>(&self, f: impl FnOnce(&mut UpdaterStateInner) -> T) -> T {
        match self.inner.lock() {
            Ok(mut guard) => f(&mut guard),
            Err(poisoned) => {
                let mut guard = poisoned.into_inner();
                f(&mut guard)
            }
        }
    }
}

pub async fn check_for_updates<R: Runtime>(
    app: &AppHandle<R>,
    state: &UpdaterRuntimeState,
    silent: bool,
) -> Result<UpdateSnapshot, String> {
    if silent {
        let pool = wait_for_sqlite_pool(app).await?;
        let today = update_state::current_local_day();
        let last_day = update_state::load_last_auto_check_day(&pool)
            .await
            .map_err(|error| format!("failed to read auto update check state: {error}"))?;
        if last_day.as_deref() == Some(today.as_str()) {
            return Ok(state.snapshot());
        }
        update_state::save_last_auto_check_day(&pool, &today)
            .await
            .map_err(|error| format!("failed to persist auto update check state: {error}"))?;
    }

    state.set_checking();

    let update = app
        .updater()
        .map_err(|error| format!("failed to initialize updater: {error}"))?
        .check()
        .await
        .map_err(|error| format!("failed to check updates: {error}"))?;

    Ok(match update {
        Some(update) => state.set_available(update),
        None => state.set_up_to_date(),
    })
}

pub async fn download_and_install_pending<R: Runtime>(
    _app: &AppHandle<R>,
    state: &UpdaterRuntimeState,
) -> Result<UpdateSnapshot, String> {
    let Some(update) = state.take_pending_update() else {
        return Ok(state.set_error("there is no pending update".to_string()));
    };

    state.set_downloading();
    let callback_state = state.clone();

    let download_result = update
        .download_and_install(
            move |_chunk_length, _content_length| {},
            move || {
                callback_state.set_downloaded();
            },
        )
        .await;

    match download_result {
        Ok(()) => {
            state.set_installing();
            Ok(state.snapshot())
        }
        Err(error) => {
            state.restore_pending_update(update);
            Ok(state.set_error(format!("failed to download/install update: {error}")))
        }
    }
}
