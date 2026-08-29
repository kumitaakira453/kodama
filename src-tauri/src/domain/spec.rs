//! 「何と何の差分を見るか」の指定と、その解決結果。

use serde::{Deserialize, Serialize};

/// 比較対象。フロントからは `{ "kind": "commit", "sha": "..." }` の形で渡る。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DiffSpec {
    /// 連続したコミット群の合成差分。`oldest` の第 1 親から `newest` までを見る。
    /// 1 件だけ選んだ場合は oldest と newest が同じ sha になる。
    CommitRange { oldest: String, newest: String },
    /// 2 つの ref の比較。merge_base が true なら base を merge-base に置き換える。
    Range {
        base: String,
        target: String,
        #[serde(default)]
        merge_base: bool,
    },
    /// 分岐点から作業ツリーまで。コミット済みと未コミットをまとめて見る。
    Everything { base: String },
    /// 全未コミット変更。HEAD と作業ツリーの差分に未追跡ファイルを足す。
    Uncommitted,
    /// index と HEAD の差分。
    Staged,
    /// 作業ツリーと index の差分に未追跡ファイルを足す。
    Unstaged,
}

impl DiffSpec {
    /// 未追跡ファイルを差分に含めるか。作業ツリーを見る指定だけが対象。
    pub fn includes_untracked(&self) -> bool {
        matches!(
            self,
            DiffSpec::Everything { .. } | DiffSpec::Uncommitted | DiffSpec::Unstaged
        )
    }
}

/// blob を読む対象。ハンク展開・ファイル全体表示・ハイライトで使う。
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum BlobRef {
    /// 任意の ref のツリー。`git cat-file blob <rev>:<path>` で読む。
    Tree { rev: String },
    /// index。`git cat-file blob :<path>` で読む。
    Index,
    /// 作業ツリー。ファイルを直接読む。
    Worktree,
}

/// 解決済みの比較指定。sha は確定済みで、以降の層は分岐を持たない。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedSpec {
    pub spec: DiffSpec,
    /// コメント・閲覧済みの保存キー。
    pub revision_key: String,
    pub left: BlobRef,
    pub right: BlobRef,
    pub base_label: String,
    pub target_label: String,
    /// 内容が変わり得る指定か。true のときだけファイル監視を張る。
    pub mutable: bool,
    /// `git diff` に渡す引数。
    #[serde(skip)]
    pub diff_args: Vec<String>,
}

/// 保存キーを組み立てる。
///
/// 不変な指定は解決済み sha を持たせるので、ブランチが進んでも当時の比較に
/// コメントが紐付いたまま残る。可変な指定に HEAD の sha を混ぜないのは、
/// 混ぜるとコミットした瞬間に全コメントが行き場を失うため。
pub fn revision_key(spec: &DiffSpec, worktree: &str, left_sha: &str, right_sha: &str) -> String {
    match spec {
        DiffSpec::CommitRange { .. } | DiffSpec::Range { .. } => {
            format!("range:{left_sha}..{right_sha}")
        }
        DiffSpec::Everything { .. } => format!("everything:{worktree}"),
        DiffSpec::Uncommitted => format!("uncommitted:{worktree}"),
        DiffSpec::Staged => format!("staged:{worktree}"),
        DiffSpec::Unstaged => format!("working:{worktree}"),
    }
}
