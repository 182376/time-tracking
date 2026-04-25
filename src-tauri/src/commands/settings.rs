use crate::app::desktop_behavior;
use crate::app::state::DesktopBehaviorState;
use crate::data::repositories::classification_settings::{
    commit_classification_setting_mutations, ClassificationSettingMutation,
};
use crate::data::sqlite_pool::{
    is_recoverable_sqlite_error, reopen_sqlite_pool, wait_for_sqlite_pool,
};
use tauri::{AppHandle, State};

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassificationSettingMutationDto {
    key: String,
    value: Option<String>,
}

impl From<ClassificationSettingMutationDto> for ClassificationSettingMutation {
    fn from(value: ClassificationSettingMutationDto) -> Self {
        Self {
            key: value.key,
            value: value.value,
        }
    }
}

#[tauri::command]
pub fn cmd_set_desktop_behavior(
    close_behavior: String,
    minimize_behavior: String,
    app: AppHandle,
    desktop_behavior_state: State<DesktopBehaviorState>,
) -> Result<(), String> {
    desktop_behavior::set_desktop_behavior(
        &app,
        &desktop_behavior_state,
        &close_behavior,
        &minimize_behavior,
    );
    Ok(())
}

#[tauri::command]
pub fn cmd_set_launch_behavior(
    launch_at_login: bool,
    start_minimized: bool,
    app: AppHandle,
    desktop_behavior_state: State<DesktopBehaviorState>,
) -> Result<(), String> {
    desktop_behavior::set_launch_behavior(
        &app,
        &desktop_behavior_state,
        launch_at_login,
        start_minimized,
    )
}

#[tauri::command]
pub async fn cmd_commit_classification_settings(
    mutations: Vec<ClassificationSettingMutationDto>,
    app: AppHandle,
) -> Result<(), String> {
    let mutations = mutations
        .into_iter()
        .map(ClassificationSettingMutation::from)
        .collect::<Vec<_>>();

    let pool = wait_for_sqlite_pool(&app).await?;
    match commit_classification_setting_mutations(&pool, &mutations).await {
        Ok(()) => Ok(()),
        Err(error) if is_recoverable_sqlite_error(&error) => {
            let reopened_pool = reopen_sqlite_pool(&app).await?;
            commit_classification_setting_mutations(&reopened_pool, &mutations).await
        }
        Err(error) => Err(error),
    }
}
