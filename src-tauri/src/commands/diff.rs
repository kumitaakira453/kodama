use crate::app::diffload;
use crate::commands::run_query;
use crate::domain::diff::DiffResponse;
use crate::domain::spec::DiffSpec;
use crate::error::KdResult;

#[tauri::command]
pub async fn load_diff(
    worktree: String,
    spec: DiffSpec,
    context: u32,
) -> KdResult<DiffResponse> {
    run_query(move || diffload::load(&worktree, &spec, context)).await
}
