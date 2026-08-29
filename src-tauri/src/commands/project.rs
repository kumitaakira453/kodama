use tauri::{AppHandle, Manager, State};

use crate::app::{projects, state::AppState};
use crate::domain::models::Project;
use crate::error::KdResult;

#[tauri::command]
pub fn list_projects(state: State<'_, AppState>) -> KdResult<Vec<Project>> {
    projects::list(&state)
}

/// フォルダを登録する。
///
/// git を数回叩くうえ、ネットワークボリュームだと canonicalize だけで待つ。
/// UI スレッドで走らせるとウィンドウごと固まるので、ワーカーへ逃がす。
#[tauri::command]
pub async fn add_project(app: AppHandle, path: String) -> KdResult<Project> {
    crate::commands::run_query(move || projects::add(&app.state::<AppState>(), &path)).await
}

#[tauri::command]
pub fn remove_project(state: State<'_, AppState>, id: String) -> KdResult<()> {
    projects::remove(&state, &id)
}

#[tauri::command]
pub fn rename_project(state: State<'_, AppState>, id: String, name: String) -> KdResult<Project> {
    projects::rename(&state, &id, &name)
}

#[tauri::command]
pub fn reorder_projects(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> KdResult<Vec<Project>> {
    projects::reorder(&state, &ids)
}
