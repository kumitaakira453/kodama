//! ファイル監視。
//!
//! 作業ツリーの変更と、レビュー台帳の変更を見る。台帳は CLI（AI 側）から
//! 書き換わるので、diff を見ながら直させる運用では即座に反映したい。

use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_full::new_debouncer;
use serde::Serialize;

use crate::error::{KdError, KdResult};

/// 変更が落ち着くまで待つ時間。保存のたびに再取得すると git を叩きすぎる。
const DEBOUNCE: Duration = Duration::from_millis(300);

/// これらを含むパスは無視する。除外しないと FSEvents が嵐になる。
const IGNORED: &[&str] = &[
    "node_modules",
    "target",
    ".venv",
    "dist",
    "build",
    ".next",
    ".git/objects",
    ".git/logs",
];

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum WatchKind {
    /// 作業ツリーのファイルが変わった。
    Files,
    /// レビュー台帳が変わった（CLI からの返信・解決など）。
    Ledger,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchEvent {
    pub kind: WatchKind,
}

/// 監視を始める。`on_event` は変更がまとまってから呼ばれる。
///
/// 返す `Handle` を落とすと監視が止まる。
pub struct Handle {
    _thread: std::thread::JoinHandle<()>,
    stop: mpsc::Sender<()>,
}

impl Handle {
    pub fn stop(self) {
        let _ = self.stop.send(());
    }
}

pub fn watch(
    worktree: &str,
    ledger: &Path,
    on_event: impl Fn(WatchEvent) + Send + 'static,
) -> KdResult<Handle> {
    let (tx, rx) = mpsc::channel();
    let (stop_tx, stop_rx) = mpsc::channel::<()>();

    let mut debouncer = new_debouncer(DEBOUNCE, None, tx)
        .map_err(|e| KdError::new(format!("ファイル監視を開始できません: {e}")))?;

    // 直下のディレクトリごとに張り、重いものは最初から外す。まとめて 1 回で
    // 再帰登録すると、除外したいものまで歩いてから捨てることになる。
    let worktree_path = PathBuf::from(worktree);
    let mut watched = 0usize;
    if let Ok(entries) = std::fs::read_dir(&worktree_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if is_ignored(&path) {
                continue;
            }
            // .git は直下だけ見る。index や HEAD の変化は拾いたいが、
            // objects まで歩くと数十万ファイルを登録することになる。
            let shallow =
                !path.is_dir() || path.file_name().is_some_and(|n| n == ".git");
            let mode = if shallow {
                RecursiveMode::NonRecursive
            } else {
                RecursiveMode::Recursive
            };
            if debouncer.watch(&path, mode).is_ok() {
                watched += 1;
            }
        }
    }
    // 直下を読めなかったときは、まとめて張るしかない。
    if watched == 0 {
        debouncer
            .watch(&worktree_path, RecursiveMode::Recursive)
            .map_err(|e| KdError::new(format!("{worktree} を監視できません: {e}")))?;
    }

    // 台帳はまだ無いことがある。親ディレクトリを見ておけば作成も拾える。
    let ledger_dir = ledger.parent().map(Path::to_path_buf);
    if let Some(dir) = &ledger_dir {
        let _ = std::fs::create_dir_all(dir);
        let _ = debouncer.watch(dir, RecursiveMode::NonRecursive);
    }

    let ledger = ledger.to_path_buf();
    let thread = std::thread::spawn(move || {
        // debouncer をこのスレッドで保持する。落とすと監視が止まる。
        let _keep = debouncer;
        loop {
            if stop_rx.try_recv().is_ok() {
                return;
            }
            match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(Ok(events)) => {
                    let mut files = false;
                    let mut ledger_changed = false;
                    for event in events {
                        for path in &event.paths {
                            if path == &ledger {
                                ledger_changed = true;
                            } else if !is_ignored(path) && path.starts_with(&worktree_path) {
                                files = true;
                            }
                        }
                    }
                    if ledger_changed {
                        on_event(WatchEvent {
                            kind: WatchKind::Ledger,
                        });
                    }
                    if files {
                        on_event(WatchEvent {
                            kind: WatchKind::Files,
                        });
                    }
                }
                Ok(Err(errors)) => {
                    for e in errors {
                        log::warn!("ファイル監視でエラー: {e}");
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => return,
            }
        }
    });

    Ok(Handle {
        _thread: thread,
        stop: stop_tx,
    })
}

fn is_ignored(path: &Path) -> bool {
    let text = path.to_string_lossy();
    IGNORED.iter().any(|ig| text.contains(ig))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 重い階層を無視する() {
        assert!(is_ignored(Path::new("/repo/node_modules/react/index.js")));
        assert!(is_ignored(Path::new("/repo/src-tauri/target/debug/x")));
        assert!(is_ignored(Path::new("/repo/.git/objects/ab/cdef")));
    }

    #[test]
    fn 普通のソースは無視しない() {
        assert!(!is_ignored(Path::new("/repo/src/App.tsx")));
        assert!(!is_ignored(Path::new("/repo/docs/設計書.md")));
    }
}
