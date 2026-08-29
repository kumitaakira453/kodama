//! 指摘した時点のファイル内容を控える。
//!
//! 現在の内容から引用文字列を探す方式は採らない。指摘に応えて書き換えられた
//! 瞬間に位置を失う — この機能がいちばん働くべき場面で失敗する。基準版を
//! 持っておき「基準版 → 対応付け → 現在」で辿れるようにする。
//!
//! ファイル名が内容のハッシュそのものなので、同じ内容は 1 つに畳まれ、
//! 何度書いても結果が変わらない。キャッシュの無効化を考える必要もない。

use std::path::PathBuf;

use crate::domain::ids;
use crate::error::{KdError, KdResult};
use crate::review::store::review_dir;

fn snapshots_dir() -> PathBuf {
    review_dir().join("snapshots")
}

/// 内容を控えてハッシュを返す。既にあれば書かない。
pub fn put(text: &str) -> KdResult<String> {
    let id = ids::hash(text);
    let dir = snapshots_dir();
    std::fs::create_dir_all(&dir)
        .map_err(|e| KdError::new(format!("{} を作成できません: {e}", dir.display())))?;
    let path = dir.join(&id);
    if !path.exists() {
        std::fs::write(&path, text)
            .map_err(|e| KdError::new(format!("{} に書き込めません: {e}", path.display())))?;
    }
    Ok(id)
}

/// 控えを取り出す。無ければ None。
pub fn get(id: &str) -> Option<String> {
    // ID は hex に限る。`../` のような値でディレクトリの外へ出られないようにする。
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    std::fs::read_to_string(snapshots_dir().join(id)).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 経路をさかのぼる_id_を弾く() {
        assert!(get("../../etc/passwd").is_none());
        assert!(get("not-hex").is_none());
        assert!(get("").is_none());
    }
}
