pub mod project;
pub mod worktree;

use crate::error::{KdError, KdResult};

/// git 呼び出しはブロッキングなので、UI スレッドを止めないようワーカーで走らせる。
pub async fn run_query<T, F>(f: F) -> KdResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> KdResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| KdError::new(format!("処理を実行できませんでした: {e}")))?
}
