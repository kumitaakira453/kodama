//! コミット一覧と、比較の既定 base の解決。

use crate::domain::models::RevisionList;
use crate::error::KdResult;
use crate::infra::git::Git;

pub fn list(worktree: &str, limit: u32) -> KdResult<RevisionList> {
    let git = Git::new(worktree);
    let default_base = git.default_base_ref(worktree);
    // 分岐元が分かるなら、そのブランチで積んだコミットだけを並べる。
    // 分からなければ絞りようがないので直近から並べる。
    let range = default_base.as_deref().map(|base| format!("{base}..HEAD"));
    Ok(RevisionList {
        commits: git.commit_log(worktree, limit, range.as_deref())?,
        branches: git.local_branches(worktree),
        default_base,
    })
}
