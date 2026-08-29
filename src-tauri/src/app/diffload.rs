//! 比較指定の解決と、差分の取得・構造化。

use crate::domain::diff::{DiffFile, DiffFileStatus, DiffHunk, DiffLineKind, DiffResponse};
use crate::domain::ids;
use crate::domain::rows::build_rows;
use crate::domain::spec::{revision_key, BlobRef, DiffSpec, ResolvedSpec};
use crate::error::{KdError, KdResult};
use crate::infra::git::{Git, EMPTY_TREE};
use crate::app::highlight;
use crate::infra::inline;
use crate::infra::patch::{parse_patch, ParsedFile};

/// 1 ファイルの hunks を保持する上限。これを超えたら本文を捨てて truncated にする。
const MAX_LINES_PER_FILE: usize = 50_000;

/// 比較指定を解決し、git に渡す引数まで確定させる。
pub fn resolve(worktree: &str, spec: &DiffSpec) -> KdResult<ResolvedSpec> {
    let git = Git::new(worktree);

    match spec {
        DiffSpec::CommitRange { oldest, newest } => {
            let newest_sha = git.rev_parse(worktree, newest)?;
            // 選んだ範囲の変更を含めるため、最古のコミット「の親」から見る。
            // 最初のコミットには親が無いので空ツリーに差し替える。
            let base_sha = git.first_parent(worktree, oldest);
            let base_label = if base_sha == EMPTY_TREE {
                "リポジトリの開始".to_string()
            } else {
                short(&base_sha)
            };
            Ok(ResolvedSpec {
                spec: spec.clone(),
                revision_key: revision_key(spec, worktree, &base_sha, &newest_sha),
                left: BlobRef::Tree { rev: base_sha.clone() },
                right: BlobRef::Tree { rev: newest_sha.clone() },
                base_label,
                target_label: short(&newest_sha),
                mutable: false,
                diff_args: vec![base_sha, newest_sha],
            })
        }

        DiffSpec::Range {
            base,
            target,
            merge_base,
        } => {
            let target_sha = git.rev_parse(worktree, target)?;
            let base_sha = if *merge_base {
                git.merge_base(worktree, base, target).ok_or_else(|| {
                    KdError::new(format!("{base} と {target} の共通祖先が見つかりません。"))
                })?
            } else {
                git.rev_parse(worktree, base)?
            };
            Ok(ResolvedSpec {
                spec: spec.clone(),
                revision_key: revision_key(spec, worktree, &base_sha, &target_sha),
                left: BlobRef::Tree { rev: base_sha.clone() },
                right: BlobRef::Tree { rev: target_sha.clone() },
                base_label: base.clone(),
                target_label: target.clone(),
                mutable: false,
                diff_args: vec![base_sha, target_sha],
            })
        }

        DiffSpec::Uncommitted => Ok(ResolvedSpec {
            spec: spec.clone(),
            revision_key: revision_key(spec, worktree, "", ""),
            left: BlobRef::Tree {
                rev: "HEAD".to_string(),
            },
            right: BlobRef::Worktree,
            base_label: "HEAD".to_string(),
            target_label: "作業ツリー".to_string(),
            mutable: true,
            diff_args: vec!["HEAD".to_string()],
        }),

        DiffSpec::Staged => Ok(ResolvedSpec {
            spec: spec.clone(),
            revision_key: revision_key(spec, worktree, "", ""),
            left: BlobRef::Tree {
                rev: "HEAD".to_string(),
            },
            right: BlobRef::Index,
            base_label: "HEAD".to_string(),
            target_label: "index".to_string(),
            mutable: true,
            diff_args: vec!["--cached".to_string(), "HEAD".to_string()],
        }),

        DiffSpec::Unstaged => Ok(ResolvedSpec {
            spec: spec.clone(),
            revision_key: revision_key(spec, worktree, "", ""),
            left: BlobRef::Index,
            right: BlobRef::Worktree,
            base_label: "index".to_string(),
            target_label: "作業ツリー".to_string(),
            mutable: true,
            diff_args: Vec::new(),
        }),
    }
}

pub fn load(worktree: &str, spec: &DiffSpec, context: u32) -> KdResult<DiffResponse> {
    let resolved = resolve(worktree, spec)?;
    let git = Git::new(worktree);

    let patch = git.diff_patch(worktree, &resolved.diff_args, context, None)?;
    let mut files: Vec<DiffFile> = parse_patch(&patch).into_iter().map(to_dto).collect();

    if spec.includes_untracked() {
        for path in git.untracked_paths(worktree) {
            // 未追跡ファイルは通常の diff に現れない。空との比較で全追加として出す。
            match git.untracked_patch(worktree, &path, context) {
                Ok(text) => {
                    for mut f in parse_patch(&text).into_iter().map(to_dto) {
                        f.path = path.clone();
                        f.status = DiffFileStatus::Untracked;
                        files.push(f);
                    }
                }
                Err(e) => log::warn!("{path} の差分を取得できませんでした: {e}"),
            }
        }
    }

    files.sort_by(|a, b| a.path.cmp(&b.path));
    let truncated = files.iter().any(|f| f.truncated);

    Ok(DiffResponse {
        resolved,
        files,
        truncated,
    })
}

fn to_dto(parsed: ParsedFile) -> DiffFile {
    let mut hunks = parsed.hunks;
    let total: usize = hunks.iter().map(|h| h.lines.len()).sum();

    // 極端に大きいファイルは本文を捨てる。描けない量を送っても固まるだけ。
    let truncated = total > MAX_LINES_PER_FILE;
    if truncated {
        hunks.clear();
    }

    let mut additions = 0;
    let mut deletions = 0;
    for hunk in &mut hunks {
        for line in &hunk.lines {
            match line.kind {
                DiffLineKind::Add => additions += 1,
                DiffLineKind::Del => deletions += 1,
                DiffLineKind::Context => {}
            }
        }
        hunk.rows = build_rows(&hunk.lines);
        apply_inline(hunk);
    }

    DiffFile {
        path: parsed.path,
        old_path: parsed.old_path,
        status: parsed.status,
        additions,
        deletions,
        binary: parsed.binary,
        generated: false,
        syntax: None,
        truncated,
        diff_hash: ids::diff_hash(&parsed.raw),
        hunks,
    }
}

/// 1 ファイルだけを取り直し、構文ハイライトを付ける。
///
/// ハイライトはファイル全文の読み出しと解析が要る。一覧の取得で全ファイル分を
/// 走らせると変更が多い比較で待たされるので、選択されたファイルだけに絞る。
pub fn load_file(
    worktree: &str,
    spec: &DiffSpec,
    path: &str,
    context: u32,
) -> KdResult<Option<DiffFile>> {
    let resolved = resolve(worktree, spec)?;
    let git = Git::new(worktree);

    let untracked = spec.includes_untracked() && is_untracked(&git, worktree, path);
    let patch = if untracked {
        git.untracked_patch(worktree, path, context)?
    } else {
        git.diff_patch(worktree, &resolved.diff_args, context, Some(path))?
    };

    let Some(mut file) = parse_patch(&patch).into_iter().map(to_dto).next() else {
        return Ok(None);
    };
    // `--no-index` の出力は作業ツリー上のパスに解決されるので、呼ばれたパスに戻す。
    file.path = path.to_string();
    if untracked {
        file.status = DiffFileStatus::Untracked;
    }
    highlight::apply(&git, worktree, &resolved, &mut file);
    Ok(Some(file))
}

fn is_untracked(git: &Git, worktree: &str, path: &str) -> bool {
    git.untracked_paths(worktree).iter().any(|p| p == path)
}

/// 対になった削除行と追加行に、行内で変化した範囲を書き込む。
///
/// 対応付けは `build_rows` が確定させたものをそのまま使う。ここで別の組み合わせを
/// 作ると、split 表示で横に並んでいる行と強調範囲の算出元が食い違う。
fn apply_inline(hunk: &mut DiffHunk) {
    for row in hunk.rows.clone() {
        let (Some(l), Some(r)) = (row.left, row.right) else {
            continue;
        };
        if hunk.lines[l].kind != DiffLineKind::Del || hunk.lines[r].kind != DiffLineKind::Add {
            continue;
        }
        let (old_ranges, new_ranges) =
            inline::compute(&hunk.lines[l].content, &hunk.lines[r].content);
        hunk.lines[l].inline = old_ranges;
        hunk.lines[r].inline = new_ranges;
    }
}

fn short(sha: &str) -> String {
    sha.chars().take(7).collect()
}
