//! 差分の行に構文トークンを配る。
//!
//! 旧ファイルと新ファイルを**別々に**解析し、行の出自で使い分ける。複数行構文の
//! 状態はそのバージョンのファイル全体の文脈でしか決まらないため、片方を基準に
//! すると必ずもう片方が誤った色になる。たとえば新側でブロックコメントを開いた
//! なら、その中の行は新側では沈み、旧側では通常のコードとして色が付くのが正しい。

use crate::domain::diff::{DiffFile, DiffLineKind};
use crate::domain::spec::ResolvedSpec;
use crate::infra::git::Git;
use crate::infra::syntax::{highlight_file, Highlighted};

pub fn apply(git: &Git, worktree: &str, resolved: &ResolvedSpec, file: &mut DiffFile) {
    if file.binary || file.truncated || file.hunks.is_empty() {
        return;
    }

    let old_path = file.old_path.as_deref().unwrap_or(&file.path);
    let old = git
        .read_blob(worktree, &resolved.left, old_path)
        .and_then(|text| highlight_file(old_path, &text));
    let new = git
        .read_blob(worktree, &resolved.right, &file.path)
        .and_then(|text| highlight_file(&file.path, &text));

    file.syntax = new
        .as_ref()
        .or(old.as_ref())
        .map(|h| h.syntax.clone());

    if old.is_none() && new.is_none() {
        return;
    }

    for hunk in &mut file.hunks {
        for line in &mut hunk.lines {
            // 削除行は旧ファイル、追加行と文脈行は新ファイルの解析結果を引く。
            let (source, number) = match line.kind {
                DiffLineKind::Del => (old.as_ref(), line.old_number),
                _ => (new.as_ref(), line.new_number),
            };
            let Some((source, number)) = source.zip(number) else {
                continue;
            };
            line.tokens = tokens_at(source, number, &line.content);
        }
    }
}

/// 行番号に対応するトークンを取り出す。
///
/// git が返した本文と、全文から切り出した行の長さが食い違ったら諦める。
/// 食い違ったまま重ねると強調位置がずれるので、その行だけプレーンに落とす。
fn tokens_at(
    source: &Highlighted,
    number: u32,
    content: &str,
) -> Option<Vec<crate::domain::diff::Token>> {
    let tokens = source.lines.get(number.checked_sub(1)? as usize)?;
    if tokens.is_empty() {
        return None;
    }
    let covered: u32 = tokens.iter().map(|t| t.len).sum();
    let expected = content.encode_utf16().count() as u32;
    if covered > expected {
        return None;
    }
    Some(tokens.clone())
}
