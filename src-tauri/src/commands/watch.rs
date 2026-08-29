use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

use tauri::ipc::Channel;

use crate::error::{KdError, KdResult};
use crate::infra::watcher::{self, WatchEvent};
use crate::review::store;

/// 走っている監視。停止できるよう id で持つ。
static WATCHERS: LazyLock<Mutex<HashMap<u64, watcher::Handle>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static NEXT_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

/// 監視を張る。
///
/// 再帰監視の登録はディレクトリを歩くので、大きなリポジトリでは時間がかかる。
/// UI スレッドで走らせると、その間ウィンドウごと固まる。
#[tauri::command]
pub async fn start_watch(worktree: String, channel: Channel<WatchEvent>) -> KdResult<u64> {
    crate::commands::run_query(move || {
        let handle = watcher::watch(&worktree, &store::ledger_path(), move |event| {
            // 送れなくなっていても監視は続ける。次の停止で片付く。
            let _ = channel.send(event);
        })?;

        let id = NEXT_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        WATCHERS
            .lock()
            .map_err(|_| KdError::new("監視の管理に失敗しました。"))?
            .insert(id, handle);
        Ok(id)
    })
    .await
}

#[tauri::command]
pub fn stop_watch(id: u64) {
    if let Ok(mut map) = WATCHERS.lock() {
        if let Some(handle) = map.remove(&id) {
            handle.stop();
        }
    }
}
