use tauri::State;

use crate::app::{projects, state::AppState, worktrees};
use crate::commands::run_query;
use crate::domain::models::{WorktreeInfo, WorktreeStatus};
use crate::error::KdResult;

#[tauri::command]
pub async fn list_worktrees(
    state: State<'_, AppState>,
    project_id: String,
) -> KdResult<Vec<WorktreeInfo>> {
    let repo = projects::resolve_path(&state, &project_id)?;
    run_query(move || worktrees::list(&repo)).await
}

#[tauri::command]
pub async fn worktree_statuses(
    state: State<'_, AppState>,
    project_id: String,
    paths: Vec<String>,
) -> KdResult<Vec<WorktreeStatus>> {
    let repo = projects::resolve_path(&state, &project_id)?;
    run_query(move || Ok(worktrees::statuses(&repo, &paths))).await
}
