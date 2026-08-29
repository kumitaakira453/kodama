//! コミット一覧と、比較の既定 base の解決。

use crate::domain::models::RevisionList;
use crate::error::KdResult;
use crate::infra::git::Git;

pub fn list(worktree: &str, limit: u32) -> KdResult<RevisionList> {
    let git = Git::new(worktree);
    let default_base = git.default_base_ref(worktree);
    let branch_shas = default_base
        .as_deref()
        .map(|base| git.branch_commits(worktree, base, limit))
        .unwrap_or_default();
    Ok(RevisionList {
        commits: git.commit_log(worktree, limit)?,
        branches: git.local_branches(worktree),
        default_base,
        branch_shas,
    })
}
