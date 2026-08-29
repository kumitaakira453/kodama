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

/// 画像を data URL で読む。差分の本文が読めない画像を並べて見せるのに使う。
#[tauri::command]
pub async fn read_image(
    worktree: String,
    spec: DiffSpec,
    path: String,
    side: crate::app::diffload::BlobSide,
) -> KdResult<Option<String>> {
    run_query(move || crate::app::image::read(&worktree, &spec, &path, side)).await
}

/// ハンクの外の行を読む。展開ボタンが使う。
#[tauri::command]
pub async fn read_lines(
    worktree: String,
    spec: DiffSpec,
    path: String,
    side: crate::app::diffload::BlobSide,
    from: u32,
    to: u32,
) -> KdResult<Vec<String>> {
    run_query(move || diffload::read_lines(&worktree, &spec, &path, side, from, to)).await
}
