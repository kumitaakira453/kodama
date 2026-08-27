//! worktree の列挙と状態収集。
//!
//! 一覧（`worktree list` 1 回）と状態（worktree ごとに git 数回）を分けている。
//! 一覧は即座に返し、状態は後追いで埋めることで、worktree が多くても待たせない。

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use crate::domain::models::{WorktreeInfo, WorktreeStatus};
use crate::error::KdResult;
use crate::infra::git::Git;

/// 状態収集の同時実行数。git プロセスを増やしすぎても I/O 待ちで頭打ちになる。
const MAX_WORKERS: usize = 8;

pub fn list(repo: &str) -> KdResult<Vec<WorktreeInfo>> {
    let mut items = Git::new(repo).worktrees()?;
    // bare リポジトリは差分を持たないので一覧から外す。
    items.retain(|w| !w.bare);
    Ok(items)
}

/// 複数 worktree の状態をワーカースレッドで分担して集める。
pub fn statuses(repo: &str, paths: &[String]) -> Vec<WorktreeStatus> {
    if paths.is_empty() {
        return Vec::new();
    }
    let workers = MAX_WORKERS.min(paths.len());
    let cursor = AtomicUsize::new(0);
    let results: Mutex<Vec<Option<WorktreeStatus>>> = Mutex::new(vec![None; paths.len()]);

    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| {
                let git = Git::new(repo);
                loop {
                    let i = cursor.fetch_add(1, Ordering::Relaxed);
                    let Some(path) = paths.get(i) else { break };
                    // git 呼び出しはロックの外で行い、書き戻すときだけ短く掴む。
                    let status = collect(&git, path);
                    if let Ok(mut slots) = results.lock() {
                        slots[i] = Some(status);
                    }
                }
            });
        }
    });

    // ワーカーが panic して poison していても、書けた分は取り出して返す。
    results
        .into_inner()
        .unwrap_or_else(|e| e.into_inner())
        .into_iter()
        .zip(paths)
        .map(|(status, path)| status.unwrap_or_else(|| unavailable(path)))
        .collect()
}

fn collect(git: &Git, path: &str) -> WorktreeStatus {
    let (staged, unstaged, untracked) = git.status_counts(path);
    let (has_upstream, ahead, behind) = git.upstream_status(path);
    WorktreeStatus {
        path: path.to_string(),
        dirty: staged + unstaged + untracked > 0,
        staged_count: staged,
        unstaged_count: unstaged,
        untracked_count: untracked,
        has_upstream,
        ahead,
        behind,
        last_commit: git.last_commit(path),
        error: None,
    }
}

/// ワーカーが結果を書けなかった場合の穴埋め。UI に「取得できなかった」と出す。
fn unavailable(path: &str) -> WorktreeStatus {
    WorktreeStatus {
        path: path.to_string(),
        dirty: false,
        staged_count: 0,
        unstaged_count: 0,
        untracked_count: 0,
        has_upstream: false,
        ahead: 0,
        behind: 0,
        last_commit: None,
        error: Some("状態を取得できませんでした。".to_string()),
    }
}
