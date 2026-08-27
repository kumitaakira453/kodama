use crate::app::revisions;
use crate::commands::run_query;
use crate::domain::models::RevisionList;
use crate::error::KdResult;

#[tauri::command]
pub async fn list_revisions(worktree: String, limit: u32) -> KdResult<RevisionList> {
    run_query(move || revisions::list(&worktree, limit)).await
}
