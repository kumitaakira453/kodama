//! git CLI アダプタ。
//!
//! libgit2 は使わず CLI を叩く。ユーザーの `~/.gitconfig` が出力形式を変えていても
//! パーサが壊れないよう、書式に影響する設定は呼び出しごとに打ち消す。

use crate::domain::models::{CommitInfo, WorktreeInfo};
use crate::error::{KdError, KdResult};
use crate::infra::shell::capture;

/// フィールド区切り。ファイル名やコミット本文に現れない制御文字を使う。
const SEP: char = '\u{1f}';

/// 出力形式に影響するユーザー設定を打ち消す。1 つでも漏れるとパーサが黙って壊れる。
///
/// - `core.quotePath=false` … 日本語ファイル名が `\346\227\245` にならない
/// - `diff.noprefix=false` / `diff.mnemonicPrefix=false` … `a/` `b/` の接頭辞を固定する
/// - `diff.external=` … 外部 diff ツールへの差し替えを無効化する
const CONFIG_OVERRIDES: [&str; 8] = [
    "-c",
    "core.quotePath=false",
    "-c",
    "diff.noprefix=false",
    "-c",
    "diff.mnemonicPrefix=false",
    "-c",
    "diff.external=",
];

/// 空ツリーの sha。最初のコミットには親が無く `<sha>^` が解決できないので、
/// その場合の比較元として使う。
pub const EMPTY_TREE: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

pub struct Git {
    repo: String,
}

impl Git {
    pub fn new(repo: &str) -> Self {
        Self {
            repo: repo.to_string(),
        }
    }

    /// `git -C <cwd> <CONFIG_OVERRIDES> <args...>` を組み立てて実行する。
    fn run(&self, cwd: &str, args: &[&str], check: bool) -> KdResult<String> {
        let mut cmd: Vec<&str> = vec!["git", "-C", cwd];
        cmd.extend_from_slice(&CONFIG_OVERRIDES);
        cmd.extend_from_slice(args);
        capture(&cmd, None, check)
    }

    fn run_repo(&self, args: &[&str], check: bool) -> KdResult<String> {
        let repo = self.repo.clone();
        self.run(&repo, args, check)
    }

    /// git リポジトリの作業ツリーかどうか。登録時の検証に使う。
    pub fn is_worktree(&self) -> bool {
        self.run_repo(&["rev-parse", "--is-inside-work-tree"], false)
            .map(|o| o.trim() == "true")
            .unwrap_or(false)
    }

    /// リポジトリのトップレベル（メインではなく、指定パスが属する worktree のルート）。
    pub fn toplevel(&self) -> KdResult<String> {
        let out = self.run_repo(&["rev-parse", "--show-toplevel"], true)?;
        let t = out.trim();
        if t.is_empty() {
            return Err(KdError::new(
                "git リポジトリのルートを特定できませんでした。",
            ));
        }
        Ok(t.to_string())
    }

    pub fn worktrees(&self) -> KdResult<Vec<WorktreeInfo>> {
        let out = self.run_repo(&["worktree", "list", "--porcelain"], true)?;
        let mut items: Vec<WorktreeInfo> = Vec::new();
        let mut cur: Option<WorktreeInfo> = None;

        for line in out.lines() {
            if let Some(path) = line.strip_prefix("worktree ") {
                if let Some(w) = cur.take() {
                    items.push(w);
                }
                cur = Some(WorktreeInfo {
                    path: path.to_string(),
                    name: basename(path),
                    branch: None,
                    head: None,
                    detached: false,
                    locked: false,
                    bare: false,
                    is_main: false,
                });
                continue;
            }
            let Some(w) = cur.as_mut() else { continue };
            if let Some(head) = line.strip_prefix("HEAD ") {
                w.head = Some(head.chars().take(9).collect());
            } else if let Some(b) = line.strip_prefix("branch ") {
                w.branch = Some(b.trim_start_matches("refs/heads/").to_string());
            } else if line == "detached" {
                w.detached = true;
            } else if line.starts_with("locked") {
                w.locked = true;
            } else if line == "bare" {
                w.bare = true;
            }
        }
        if let Some(w) = cur.take() {
            items.push(w);
        }

        // `worktree list` の先頭が常にメイン worktree。
        if let Some(first) = items.first_mut() {
            first.is_main = true;
        }
        Ok(items)
    }

    /// `git status --porcelain` の集計。(staged, unstaged, untracked)。
    pub fn status_counts(&self, worktree: &str) -> (i64, i64, i64) {
        let out = self
            .run(worktree, &["status", "--porcelain"], false)
            .unwrap_or_default();
        let mut staged = 0;
        let mut unstaged = 0;
        let mut untracked = 0;
        for line in out.lines() {
            let mut chars = line.chars();
            let (Some(index), Some(tree)) = (chars.next(), chars.next()) else {
                continue;
            };
            if index == '?' && tree == '?' {
                untracked += 1;
                continue;
            }
            if index != ' ' {
                staged += 1;
            }
            if tree != ' ' {
                unstaged += 1;
            }
        }
        (staged, unstaged, untracked)
    }

    /// (upstream 設定あり, ahead, behind)。
    pub fn upstream_status(&self, worktree: &str) -> (bool, i64, i64) {
        let upstream = self
            .run(
                worktree,
                &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
                false,
            )
            .unwrap_or_default();
        if upstream.trim().is_empty() {
            return (false, 0, 0);
        }
        let out = self
            .run(
                worktree,
                &["rev-list", "--left-right", "--count", "@{u}...HEAD"],
                false,
            )
            .unwrap_or_default();
        let nums: Vec<i64> = out
            .split_whitespace()
            .filter_map(|s| s.parse().ok())
            .collect();
        (
            true,
            nums.get(1).copied().unwrap_or(0),
            nums.first().copied().unwrap_or(0),
        )
    }

    pub fn last_commit(&self, worktree: &str) -> Option<CommitInfo> {
        let fmt = format!("--format=%H{SEP}%h{SEP}%s{SEP}%an{SEP}%ct{SEP}%cr{SEP}%b");
        let out = self
            .run(worktree, &["log", "-1", "-z", &fmt], false)
            .unwrap_or_default();
        parse_commits(&out).into_iter().next()
    }

    /// 直近のコミット一覧。revision セレクタに並べる。
    pub fn commit_log(&self, worktree: &str, limit: u32) -> KdResult<Vec<CommitInfo>> {
        let fmt = format!("--format=%H{SEP}%h{SEP}%s{SEP}%an{SEP}%ct{SEP}%cr{SEP}%b");
        let count = format!("-{limit}");
        let out = self.run(worktree, &["log", &count, "-z", &fmt], false)?;
        Ok(parse_commits(&out))
    }

    /// ローカルブランチ名を最終コミットの新しい順に返す。
    pub fn local_branches(&self, worktree: &str) -> Vec<String> {
        self.run(
            worktree,
            &[
                "for-each-ref",
                "--sort=-committerdate",
                "--format=%(refname:short)",
                "refs/heads/",
            ],
            false,
        )
        .unwrap_or_default()
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(str::to_string)
        .collect()
    }

    pub fn ref_exists(&self, worktree: &str, r#ref: &str) -> bool {
        self.run(worktree, &["rev-parse", "--verify", "--quiet", r#ref], false)
            .map(|o| !o.trim().is_empty())
            .unwrap_or(false)
    }

    /// 比較の既定 base として使える ref を探す。リポジトリごとに既定ブランチ名が
    /// 違うため決め打ちにせず、上流の HEAD から順に候補を試す。
    pub fn default_base_ref(&self, worktree: &str) -> Option<String> {
        let head = self
            .run(worktree, &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], false)
            .unwrap_or_default();
        let head = head.trim();
        if !head.is_empty() && self.ref_exists(worktree, head) {
            return Some(head.to_string());
        }
        for candidate in [
            "origin/main",
            "origin/master",
            "origin/develop",
            "main",
            "master",
            "develop",
        ] {
            if self.ref_exists(worktree, candidate) {
                return Some(candidate.to_string());
            }
        }
        None
    }

    pub fn merge_base(&self, worktree: &str, base: &str, target: &str) -> Option<String> {
        let out = self
            .run(worktree, &["merge-base", base, target], false)
            .ok()?;
        let t = out.trim();
        (!t.is_empty()).then(|| t.to_string())
    }

    /// ref を完全な sha に解決する。
    pub fn rev_parse(&self, worktree: &str, r#ref: &str) -> KdResult<String> {
        let out = self.run(worktree, &["rev-parse", r#ref], true)?;
        let t = out.trim();
        if t.is_empty() {
            return Err(KdError::new(format!("{} を解決できません。", r#ref)));
        }
        Ok(t.to_string())
    }

    /// コミットの第 1 親。親が無い（最初のコミット）なら空ツリーを返す。
    pub fn first_parent(&self, worktree: &str, sha: &str) -> String {
        self.run(worktree, &["rev-parse", "--verify", "--quiet", &format!("{sha}^")], false)
            .ok()
            .map(|o| o.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| EMPTY_TREE.to_string())
    }
}

fn basename(path: &str) -> String {
    path.trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or(path)
        .to_string()
}

/// `log -z` の NUL 区切り出力をパースする。コミット本文に改行が含まれても
/// レコード境界が壊れない。
fn parse_commits(out: &str) -> Vec<CommitInfo> {
    out.split('\0')
        .filter(|rec| !rec.trim().is_empty())
        .filter_map(|rec| {
            let parts: Vec<&str> = rec.split(SEP).collect();
            if parts.len() < 6 {
                return None;
            }
            Some(CommitInfo {
                sha: parts[0].trim_start_matches('\n').to_string(),
                short_sha: parts[1].to_string(),
                subject: parts[2].to_string(),
                author: parts[3].to_string(),
                timestamp: parts[4].parse().unwrap_or(0),
                relative: parts[5].to_string(),
                body: parts.get(6).unwrap_or(&"").trim().to_string(),
            })
        })
        .collect()
}
