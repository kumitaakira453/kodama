//! レビューの指摘を扱う操作層。GUI と CLI が同じ関数を通る。

pub mod anchor;
pub mod format;
pub mod model;
pub mod snapshot;
pub mod store;

use crate::domain::ids;
use crate::error::{KdError, KdResult};
use crate::domain::spec::BlobRef;
use crate::infra::git::Git;
use crate::review::model::{
    AnchorState, Comment, Status, Thread, ThreadInput, ThreadView,
};

/// 一覧の絞り込み。ファイル名だけでは絞り込みキーとして成立しない。
/// 同じパスでも worktree と比較対象が違えば別物になる。
#[derive(Debug, Clone, Default)]
pub struct Filter {
    /// この worktree に属する指摘に絞る。
    pub repo: Option<String>,
    /// この比較対象の指摘に絞る。
    pub revision_key: Option<String>,
    /// リポジトリ相対パスの前方一致。repo の中での二次的な絞り込み。
    pub path_prefix: Option<String>,
    /// 解決済み・取り下げも含める。
    pub include_closed: bool,
}

pub fn list(filter: &Filter) -> KdResult<Vec<ThreadView>> {
    let ledger = store::load()?;
    let repo = filter.repo.as_deref().map(store::normalize_path);

    let mut views: Vec<ThreadView> = ledger
        .threads
        .into_iter()
        .filter(|t| filter.include_closed || t.status.is_open())
        .filter(|t| match &repo {
            Some(r) => store::is_under(&t.repo, r) || store::is_under(r, &t.repo),
            None => true,
        })
        .filter(|t| match &filter.revision_key {
            Some(k) => &t.revision_key == k,
            None => true,
        })
        .filter(|t| match &filter.path_prefix {
            Some(p) => t.file.starts_with(p.trim_start_matches("./")),
            None => true,
        })
        .map(|thread| {
            let resolved = resolve_anchor(&thread);
            ThreadView {
                thread,
                anchor: resolved.state,
                current_text: resolved.current_text,
            }
        })
        .collect();

    // ファイル順、その中では作成順。CLI の出力でファイル見出しが 1 回で済む。
    views.sort_by(|a, b| {
        a.thread
            .file
            .cmp(&b.thread.file)
            .then(a.thread.created_at.cmp(&b.thread.created_at))
    });
    Ok(views)
}

pub fn get(id: &str) -> KdResult<ThreadView> {
    let ledger = store::load()?;
    let thread = ledger
        .threads
        .into_iter()
        .find(|t| t.id == id)
        .ok_or_else(|| KdError::new(format!("指摘 #{id} が見つかりません。")))?;
    let resolved = resolve_anchor(&thread);
    Ok(ThreadView {
        thread,
        anchor: resolved.state,
        current_text: resolved.current_text,
    })
}

/// 指摘を作る。指摘した時点のファイル内容を控えて対応付けの起点にする。
pub fn add(input: ThreadInput) -> KdResult<Thread> {
    let repo = store::normalize_path(&input.repo);
    let base_hash = std::fs::read_to_string(std::path::Path::new(&repo).join(&input.file))
        .ok()
        .map(|text| snapshot::put(&text))
        .transpose()?
        .unwrap_or_default();

    let now = ids::now_millis();
    store::update(|ledger| {
        let id = fresh_id(ledger, &input.file);
        let thread = Thread {
            id,
            repo,
            revision_key: input.revision_key,
            file: input.file,
            side: input.side,
            line_start: input.line_start,
            line_end: input.line_end,
            quote: input.quote,
            context: input.context,
            base_hash,
            status: Status::Open,
            comments: vec![Comment {
                id: ids::short_id("comment"),
                author: input.author,
                body: input.body,
                created_at: now,
            }],
            created_at: now,
        };
        ledger.threads.push(thread.clone());
        Ok(thread)
    })
}

pub fn reply(id: &str, author: &str, body: &str) -> KdResult<Thread> {
    store::update(|ledger| {
        let thread = find_mut(ledger, id)?;
        thread.comments.push(Comment {
            id: ids::short_id(id),
            author: author.to_string(),
            body: body.to_string(),
            created_at: ids::now_millis(),
        });
        Ok(thread.clone())
    })
}

pub fn set_status(id: &str, status: Status) -> KdResult<Thread> {
    store::update(|ledger| {
        let thread = find_mut(ledger, id)?;
        thread.status = status;
        Ok(thread.clone())
    })
}

fn find_mut<'a>(
    ledger: &'a mut model::Ledger,
    id: &str,
) -> KdResult<&'a mut Thread> {
    ledger
        .threads
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or_else(|| KdError::new(format!("指摘 #{id} が見つかりません。")))
}

fn fresh_id(ledger: &model::Ledger, seed: &str) -> String {
    loop {
        let id = ids::short_id(seed);
        if !ledger.threads.iter().any(|t| t.id == id) {
            return id;
        }
    }
}

fn read_current(thread: &Thread) -> Option<String> {
    std::fs::read_to_string(std::path::Path::new(&thread.repo).join(&thread.file)).ok()
}

/// 未コミットの変更だけを見る比較か。
///
/// コミットを含む比較は、コミットしても中身が空にならない。取り込まれたか
/// どうかを問うのは、未コミット側だけを見ている指摘に限る。
fn is_pending_scope(revision_key: &str) -> bool {
    ["uncommitted:", "staged:", "working:"]
        .iter()
        .any(|prefix| revision_key.starts_with(prefix))
}

/// 未コミットの変更に付けた指摘が、そのあとコミットへ取り込まれていないか。
///
/// 取り込まれると、その比較からは何も見えなくなる。行そのものは残っている
/// ので追跡自体は成功し、「指摘した時点のまま」と出てしまう。どこへ行ったの
/// かを状態にしないと、対応済みなのか放置なのか判断できない。
///
/// 消したのか取り込まれたのかは、コミット側に本文が在るかで分ける。
fn committed_into(thread: &Thread) -> Option<AnchorState> {
    if !is_pending_scope(&thread.revision_key) || thread.quote.is_empty() {
        return None;
    }
    let git = Git::new(&thread.repo);
    // 変更がまだ残っているなら、取り込まれていない。
    if git.has_pending_change(&thread.repo, &thread.file) {
        return None;
    }
    let head = git.read_blob(
        &thread.repo,
        &BlobRef::Tree {
            rev: "HEAD".to_string(),
        },
        &thread.file,
    )?;
    if !head.contains(&thread.quote) {
        return None;
    }
    git.last_commit_touching(&thread.repo, &thread.file)
        .map(|sha| AnchorState::Committed { sha })
}

/// 追跡の結果に、コミットへ取り込まれた事実を重ねる。
fn resolve_anchor(thread: &Thread) -> anchor::Resolved {
    let current = read_current(thread);
    let mut resolved = anchor::resolve(thread, current.as_deref());
    if let Some(state) = committed_into(thread) {
        resolved.state = state;
    }
    resolved
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 未コミットを見る比較だけを対象にする() {
        assert!(is_pending_scope("uncommitted:/repo"));
        assert!(is_pending_scope("staged:/repo"));
        assert!(is_pending_scope("working:/repo"));
        // コミットを含む比較は、コミットしても中身が空にならない。
        assert!(!is_pending_scope("range:aaa..bbb"));
        assert!(!is_pending_scope("everything:/repo"));
    }
}
