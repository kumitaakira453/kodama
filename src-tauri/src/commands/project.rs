use tauri::State;

use crate::app::{projects, state::AppState};
use crate::domain::models::Project;
use crate::error::KdResult;

#[tauri::command]
pub fn list_projects(state: State<'_, AppState>) -> KdResult<Vec<Project>> {
    projects::list(&state)
}

#[tauri::command]
pub fn add_project(state: State<'_, AppState>, path: String) -> KdResult<Project> {
    projects::add(&state, &path)
}

#[tauri::command]
pub fn remove_project(state: State<'_, AppState>, id: String) -> KdResult<()> {
    projects::remove(&state, &id)
}

#[tauri::command]
pub fn rename_project(state: State<'_, AppState>, id: String, name: String) -> KdResult<Project> {
    projects::rename(&state, &id, &name)
}
