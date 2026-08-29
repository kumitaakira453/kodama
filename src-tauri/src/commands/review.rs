use crate::commands::run_query;
use crate::domain::ids;
use crate::error::KdResult;
use crate::review::{
    self,
    model::{Status, Thread, ThreadInput, ThreadView},
};

#[tauri::command]
pub async fn list_threads(
    worktree: Option<String>,
    revision_key: Option<String>,
    include_closed: bool,
) -> KdResult<Vec<ThreadView>> {
    run_query(move || {
        review::list(&review::Filter {
            repo: worktree,
            revision_key,
            path_prefix: None,
            include_closed,
        })
    })
    .await
}

#[tauri::command]
pub async fn add_thread(input: ThreadInput) -> KdResult<Thread> {
    run_query(move || review::add(input)).await
}

#[tauri::command]
pub async fn reply_thread(id: String, author: String, body: String) -> KdResult<Thread> {
    run_query(move || review::reply(&id, &author, &body)).await
}

#[tauri::command]
pub async fn resolve_thread(id: String, by: String) -> KdResult<Thread> {
    run_query(move || {
        review::set_status(
            &id,
            Status::Resolved {
                by,
                at: ids::now_millis(),
            },
        )
    })
    .await
}

#[tauri::command]
pub async fn reopen_thread(id: String) -> KdResult<Thread> {
    run_query(move || review::set_status(&id, Status::Open)).await
}

#[tauri::command]
pub async fn drop_thread(id: String, by: String) -> KdResult<Thread> {
    run_query(move || {
        review::set_status(
            &id,
            Status::Dropped {
                by,
                at: ids::now_millis(),
            },
        )
    })
    .await
}
