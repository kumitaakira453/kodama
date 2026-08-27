//! プロジェクトと worktree の DTO。

use serde::{Deserialize, Serialize};

/// 登録された git リポジトリ。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    /// 登録時に生成する安定 ID。パスを変えても紐付けを保つ。
    pub id: String,
    /// 表示名。既定はディレクトリ名。
    pub name: String,
    /// メイン worktree の絶対パス。
    pub path: String,
    pub added_at: i64,
}

/// `git worktree list --porcelain` から得られる静的な情報。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub path: String,
    pub name: String,
    pub branch: Option<String>,
    /// 短縮 sha。
    pub head: Option<String>,
    pub detached: bool,
    pub locked: bool,
    pub bare: bool,
    /// リポジトリのメイン worktree か。
    pub is_main: bool,
}

/// 取得に git 呼び出しが要る動的な情報。一覧の描画を待たせないよう分けている。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeStatus {
    pub path: String,
    pub dirty: bool,
    pub staged_count: i64,
    pub unstaged_count: i64,
    pub untracked_count: i64,
    pub has_upstream: bool,
    /// 上流に対して先行しているコミット数。
    pub ahead: i64,
    /// 上流に対して遅れているコミット数。
    pub behind: i64,
    pub last_commit: Option<CommitInfo>,
    /// 状態取得に失敗した理由。取得できていれば None。
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub sha: String,
    pub short_sha: String,
    pub subject: String,
    pub body: String,
    pub author: String,
    /// committer 日時の epoch 秒。
    pub timestamp: i64,
    /// 相対表記。
    pub relative: String,
}

/// revision セレクタに並べる候補。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionList {
    pub commits: Vec<CommitInfo>,
    pub branches: Vec<String>,
    /// merge-base の算出に使える既定の base ref。見つからなければ None。
    pub default_base: Option<String>,
}
