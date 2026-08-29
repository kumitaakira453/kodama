use crate::app::diffload;
use crate::commands::run_query;
use crate::domain::diff::{DiffFile, DiffResponse};
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

/// 選択された 1 ファイルを構文ハイライト付きで取り直す。
#[tauri::command]
pub async fn file_diff(
    worktree: String,
    spec: DiffSpec,
    path: String,
    context: u32,
) -> KdResult<Option<DiffFile>> {
    run_query(move || diffload::load_file(&worktree, &spec, &path, context)).await
}
