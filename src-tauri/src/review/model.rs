//! レビューの指摘のデータモデル。
//!
//! 後から足したフィールドは `#[serde(default)]` を付ける。台帳にフィールドを
//! 足しても、それ以前に書かれたファイルが読めなくなってはいけない。

use serde::{Deserialize, Serialize};

pub const FORMAT_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Side {
    Old,
    New,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Status {
    Open,
    Resolved { by: String, at: i64 },
    /// 対象が消えたので取り下げた。対応したわけではないので resolved と分ける。
    Dropped { by: String, at: i64 },
}

impl Status {
    pub fn is_open(&self) -> bool {
        matches!(self, Status::Open)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: String,
    pub author: String,
    pub body: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Thread {
    /// 8 桁 hex。CLI で打つので短くする。
    pub id: String,
    /// worktree の絶対パス（NFC 正規化済み）。
    pub repo: String,
    /// どの比較に対する指摘か。コミット済みは sha、未コミットは worktree パス。
    pub revision_key: String,
    /// リポジトリからの相対パス。
    pub file: String,
    pub side: Side,
    pub line_start: u32,
    pub line_end: u32,
    /// 指摘時点の該当行の逐語。位置が特定できなくなっても対象を見失わない。
    pub quote: String,
    /// ハンクヘッダ（関数名など）。行番号の代わりに場所を指す手がかりになる。
    #[serde(default)]
    pub context: String,
    /// 指摘時点の内容のハッシュ。現在の内容との対応付けの起点。
    #[serde(default)]
    pub base_hash: String,
    pub status: Status,
    #[serde(default)]
    pub comments: Vec<Comment>,
    pub created_at: i64,
}

/// 指摘の対象が今どうなっているか。
///
/// `Status`（解決したか）とは**別の軸**にする。1 つの列挙にまとめると、
/// 書き換わった指摘が未解決の一覧から抜け落ちて黙って消える。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AnchorState {
    Unchanged,
    /// 行が動いた。値は現在の行番号。
    Moved { line: u32 },
    /// 対象の行が書き換わった。
    Rewritten,
    /// 対象が見つからない。
    Removed,
    /// 未コミットの指摘が、コミットに取り込まれたとみられる。
    Committed { sha: String },
    NoFile,
}

/// 指摘に現在の状態を添えたもの。CLI と GUI がこれを受け取る。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadView {
    pub thread: Thread,
    pub anchor: AnchorState,
    /// 現在の該当行。追えなければ None。
    pub current_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ledger {
    #[serde(default = "default_version")]
    pub format_version: u32,
    #[serde(default)]
    pub threads: Vec<Thread>,
}

fn default_version() -> u32 {
    FORMAT_VERSION
}

impl Default for Ledger {
    fn default() -> Self {
        Self {
            format_version: FORMAT_VERSION,
            threads: Vec::new(),
        }
    }
}

/// 指摘を作るときにフロント / CLI から渡す内容。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadInput {
    pub repo: String,
    pub revision_key: String,
    pub file: String,
    pub side: Side,
    pub line_start: u32,
    pub line_end: u32,
    pub quote: String,
    #[serde(default)]
    pub context: String,
    pub body: String,
    #[serde(default = "default_author")]
    pub author: String,
}

fn default_author() -> String {
    "you".to_string()
}
