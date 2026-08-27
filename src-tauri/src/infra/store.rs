//! JSON の原子的な読み書き。
//!
//! 書き込みは同一ディレクトリの一時ファイルへ出してから `rename` する。途中で
//! 落ちても既存ファイルが壊れない。コメントは失うと痛いので必ずここを通す。

use std::io::Write;
use std::path::Path;

use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::error::{KdError, KdResult};

/// ファイルが無ければ `None` を返す。壊れた JSON はエラーにする。
pub fn read_json<T: DeserializeOwned>(path: &Path) -> KdResult<Option<T>> {
    let text = match std::fs::read_to_string(path) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(KdError::new(format!("{} を読めません: {e}", path.display()))),
    };
    if text.trim().is_empty() {
        return Ok(None);
    }
    serde_json::from_str(&text)
        .map(Some)
        .map_err(|e| KdError::new(format!("{} の JSON を解釈できません: {e}", path.display())))
}

pub fn write_json<T: Serialize>(path: &Path, value: &T) -> KdResult<()> {
    let dir = path
        .parent()
        .ok_or_else(|| KdError::new(format!("{} の親ディレクトリがありません", path.display())))?;
    std::fs::create_dir_all(dir)
        .map_err(|e| KdError::new(format!("{} を作成できません: {e}", dir.display())))?;

    let body = serde_json::to_vec_pretty(value)?;
    let tmp = dir.join(format!(
        ".{}.tmp",
        path.file_name().and_then(|n| n.to_str()).unwrap_or("store")
    ));

    let mut file = std::fs::File::create(&tmp)
        .map_err(|e| KdError::new(format!("{} を作成できません: {e}", tmp.display())))?;
    file.write_all(&body)
        .and_then(|_| file.sync_all())
        .map_err(|e| KdError::new(format!("{} に書き込めません: {e}", tmp.display())))?;
    drop(file);

    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        KdError::new(format!("{} を置き換えられません: {e}", path.display()))
    })
}
