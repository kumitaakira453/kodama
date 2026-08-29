use crate::commands::run_query;
use crate::error::KdResult;
use crate::infra::apps::{self, AppTarget};

/// いま起動できるアプリだけを返す。フロントは判定を持たない。
#[tauri::command]
pub async fn installed_apps() -> KdResult<Vec<AppTarget>> {
    run_query(|| Ok(apps::installed())).await
}

#[tauri::command]
pub async fn open_in_app(
    app_id: String,
    path: String,
    line: Option<u32>,
) -> KdResult<()> {
    run_query(move || apps::open_in(&app_id, &path, line)).await
}
