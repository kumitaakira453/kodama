//! 閲覧済みマーク。
//!
//! 差分から作り直せる派生情報なので、失っても困らない state ディレクトリに置く。
//! 印を付けた時点の差分ハッシュを控えておき、現在のものと違えば `Stale` として
//! 未閲覧に戻す。真偽値だけで持つと「読んだあとに変わった」が黙って消える。

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::domain::ids;
use crate::error::KdResult;
use crate::infra::{paths, store};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ViewedStatus {
    Unviewed,
    Viewed,
    /// 閲覧後に差分が変わった。未閲覧として扱いつつ、変化があったことを示す。
    Stale,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewedState {
    pub file: String,
    pub status: ViewedStatus,
}

/// 比較対象のキー → ファイル → 印を付けた時点の差分ハッシュ。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(transparent)]
struct Book {
    marks: HashMap<String, HashMap<String, String>>,
}

fn path() -> std::path::PathBuf {
    paths::state_dir().join("viewed.json")
}

fn load() -> Book {
    // 壊れていても起動を止めない。印は付け直せる。
    store::read_json::<Book>(&path())
        .ok()
        .flatten()
        .unwrap_or_default()
}

/// 現在の差分ハッシュと突き合わせて状態を返す。
pub fn list(revision_key: &str, current: &HashMap<String, String>) -> Vec<ViewedState> {
    let book = load();
    let marks = book.marks.get(revision_key);
    current
        .iter()
        .map(|(file, hash)| {
            let status = match marks.and_then(|m| m.get(file)) {
                Some(saved) if saved == hash => ViewedStatus::Viewed,
                Some(_) => ViewedStatus::Stale,
                None => ViewedStatus::Unviewed,
            };
            ViewedState {
                file: file.clone(),
                status,
            }
        })
        .collect()
}

pub fn set(revision_key: &str, file: &str, diff_hash: &str, viewed: bool) -> KdResult<()> {
    let mut book = load();
    let entry = book.marks.entry(revision_key.to_string()).or_default();
    if viewed {
        entry.insert(file.to_string(), diff_hash.to_string());
    } else {
        entry.remove(file);
    }
    store::write_json(&path(), &book)
}

/// この比較の印をすべて外す。
pub fn clear(revision_key: &str) -> KdResult<()> {
    let mut book = load();
    book.marks.remove(revision_key);
    store::write_json(&path(), &book)
}

/// 差分の内容から印のキーになるハッシュを作る。
pub fn hash_of(diff_text: &str) -> String {
    ids::diff_hash(diff_text)
}
