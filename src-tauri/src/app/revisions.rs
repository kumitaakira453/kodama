//! コミット一覧と、比較の起点の解決。

use crate::domain::models::RevisionList;
use crate::error::KdResult;
use crate::infra::git::Git;

/// `base` を渡すとその ref を起点にする。省略すると分岐元を自分で解く。
pub fn list(worktree: &str, limit: u32, base: Option<String>) -> KdResult<RevisionList> {
    let git = Git::new(worktree);
    let default_base = git.default_base_ref(worktree);
    // 指定が無ければ分岐元。分からなければ絞りようがないので直近から並べる。
    let base = base.filter(|b| !b.is_empty()).or_else(|| default_base.clone());
    let range = base.as_deref().map(|base| format!("{base}..HEAD"));
    Ok(RevisionList {
        commits: git.commit_log(worktree, limit, range.as_deref())?,
        bases: git.base_refs(worktree),
        default_base,
        base,
    })
}
