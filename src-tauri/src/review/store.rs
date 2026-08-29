//! 台帳の読み書き。
//!
//! GUI と CLI が同じファイルを同時に触る。read-modify-write をロック内で完結
//! させないと、片方の書き込みがもう片方に上書きされて消える。
//!
//! Tauri を参照しない。ビルドグラフを引かずに `cargo test` で回せる。

use std::path::{Path, PathBuf};

use unicode_normalization::UnicodeNormalization;

use crate::error::{KdError, KdResult};
use crate::review::model::{Ledger, FORMAT_VERSION};

/// ロック取得の再試行間隔と上限。合計 5 秒待って諦める。
const RETRY_WAIT_MS: u64 = 50;
const RETRY_LIMIT: u32 = 100;
/// これより古いロックは異常終了の残骸とみなす。持ち主が落ちても永久に詰まらない。
const STALE_LOCK_SECS: u64 = 30;

pub fn review_dir() -> PathBuf {
    crate::infra::paths::data_dir().join("review")
}

pub fn ledger_path() -> PathBuf {
    review_dir().join("store.json")
}

fn lock_path() -> PathBuf {
    review_dir().join("store.json.lock")
}

/// 台帳を読む。無ければ空、壊れていればエラー。
pub fn load() -> KdResult<Ledger> {
    load_from(&ledger_path())
}

fn load_from(path: &Path) -> KdResult<Ledger> {
    let text = match std::fs::read_to_string(path) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Ledger::default()),
        Err(e) => return Err(KdError::new(format!("{} を読めません: {e}", path.display()))),
    };
    if text.trim().is_empty() {
        return Ok(Ledger::default());
    }
    serde_json::from_str(&text)
        .map_err(|e| KdError::new(format!("{} の JSON を解釈できません: {e}", path.display())))
}

/// 台帳を書き換える。ロックを取ってから読み直すので、他プロセスの更新を潰さない。
pub fn update<T>(f: impl FnOnce(&mut Ledger) -> KdResult<T>) -> KdResult<T> {
    let dir = review_dir();
    std::fs::create_dir_all(&dir)
        .map_err(|e| KdError::new(format!("{} を作成できません: {e}", dir.display())))?;

    let _lock = Lock::acquire(&lock_path())?;
    let path = ledger_path();
    let mut ledger = load_from(&path)?;
    let value = f(&mut ledger)?;
    ledger.format_version = FORMAT_VERSION;
    write_atomic(&path, &serde_json::to_vec_pretty(&ledger)?)?;
    Ok(value)
}

fn write_atomic(path: &Path, body: &[u8]) -> KdResult<()> {
    let dir = path
        .parent()
        .ok_or_else(|| KdError::new(format!("{} の親ディレクトリがありません", path.display())))?;
    let tmp = dir.join("store.tmp");
    std::fs::write(&tmp, body)
        .map_err(|e| KdError::new(format!("{} に書き込めません: {e}", tmp.display())))?;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        KdError::new(format!("{} を置き換えられません: {e}", path.display()))
    })
}

struct Lock {
    path: PathBuf,
}

impl Lock {
    fn acquire(path: &Path) -> KdResult<Self> {
        for _ in 0..RETRY_LIMIT {
            match std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(path)
            {
                Ok(_) => {
                    return Ok(Self {
                        path: path.to_path_buf(),
                    })
                }
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                    if is_stale(path) {
                        let _ = std::fs::remove_file(path);
                        continue;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(RETRY_WAIT_MS));
                }
                Err(e) => {
                    return Err(KdError::new(format!(
                        "{} を作成できません: {e}",
                        path.display()
                    )))
                }
            }
        }
        Err(KdError::new(
            "台帳が他の処理に使われています。しばらく待って試してください。",
        ))
    }
}

fn is_stale(path: &Path) -> bool {
    let Ok(meta) = std::fs::metadata(path) else {
        return false;
    };
    let Ok(modified) = meta.modified() else {
        return false;
    };
    modified
        .elapsed()
        .map(|d| d.as_secs() > STALE_LOCK_SECS)
        .unwrap_or(false)
}

impl Drop for Lock {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

/// パスを台帳のキーに直す。
///
/// macOS のファイル名は NFD で作られることがあり、そのままキーにすると同じ
/// ファイルが別物として扱われて指摘が 0 件になる。
pub fn normalize_path(path: &str) -> String {
    let expanded = crate::infra::paths::expanduser(path);
    let canonical = expanded.canonicalize().unwrap_or(expanded);
    canonical.to_string_lossy().nfc().collect()
}

/// `child` が `parent` の配下か。`/a/bb` を `/a/b` の配下と誤判定しない。
pub fn is_under(child: &str, parent: &str) -> bool {
    if child == parent {
        return true;
    }
    let parent = parent.trim_end_matches('/');
    child.starts_with(parent) && child.as_bytes().get(parent.len()) == Some(&b'/')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 配下の判定が接頭辞だけで誤爆しない() {
        assert!(is_under("/a/b/c.txt", "/a/b"));
        assert!(is_under("/a/b", "/a/b"));
        assert!(!is_under("/a/bb/c.txt", "/a/b"));
        assert!(!is_under("/x/y", "/a/b"));
    }

    #[test]
    fn 末尾のスラッシュがあっても配下と判定する() {
        assert!(is_under("/a/b/c.txt", "/a/b/"));
    }

    #[test]
    fn 欠けたフィールドがあっても台帳を読める() {
        // threads も format_version も無い最小の JSON。将来フィールドを足しても
        // 過去のファイルが読めなくなってはいけない。
        let ledger: Ledger = serde_json::from_str("{}").expect("空の台帳を読める");
        assert_eq!(ledger.format_version, FORMAT_VERSION);
        assert!(ledger.threads.is_empty());
    }

    #[test]
    fn 指摘の任意フィールドが無くても読める() {
        let json = r#"{
            "threads": [{
                "id": "a1b2c3d4",
                "repo": "/tmp/repo",
                "revisionKey": "uncommitted:/tmp/repo",
                "file": "src/a.rs",
                "side": "new",
                "lineStart": 1,
                "lineEnd": 1,
                "quote": "let a = 1;",
                "status": { "kind": "open" },
                "createdAt": 0
            }]
        }"#;
        let ledger: Ledger = serde_json::from_str(json).expect("読める");
        let t = &ledger.threads[0];
        assert_eq!(t.context, "");
        assert!(t.comments.is_empty());
    }
}
