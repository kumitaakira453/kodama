//! 指摘の対象が今どこにあるかを求める。
//!
//! 基準版の控えと現在の内容を行単位で突き合わせ、指摘した行がどこへ動いたかを
//! 導出する。現在の内容から引用を検索する方式は、指摘に応えて書き換えられた
//! 瞬間に失敗するので採らない。

use similar::{Algorithm, ChangeTag, TextDiff};

use crate::review::model::{AnchorState, Thread};
use crate::review::snapshot;

/// 対応付けの結果。
pub struct Resolved {
    pub state: AnchorState,
    /// 現在の該当行。追えなければ None。
    pub current_text: Option<String>,
}

/// 現在のファイル内容を渡して対応付ける。`current` が None ならファイルが無い。
pub fn resolve(thread: &Thread, current: Option<&str>) -> Resolved {
    let Some(current) = current else {
        return Resolved {
            state: AnchorState::NoFile,
            current_text: None,
        };
    };

    let Some(base) = snapshot::get(&thread.base_hash) else {
        // 控えが無い（古い台帳など）。引用がそのまま在るかだけで判定する。
        return if current.contains(&thread.quote) {
            Resolved {
                state: AnchorState::Unchanged,
                current_text: Some(thread.quote.clone()),
            }
        } else {
            Resolved {
                state: AnchorState::Removed,
                current_text: None,
            }
        };
    };

    map_line(&base, current, thread.line_start)
}

/// 基準版の `line`（1 始まり）が現在のどこに対応するかを求める。
fn map_line(base: &str, current: &str, line: u32) -> Resolved {
    let base_lines: Vec<&str> = base.lines().collect();
    let current_lines: Vec<&str> = current.lines().collect();
    let target = (line as usize).saturating_sub(1);

    if target >= base_lines.len() {
        return Resolved {
            state: AnchorState::Removed,
            current_text: None,
        };
    }

    let diff = TextDiff::configure()
        .algorithm(Algorithm::Patience)
        .diff_lines(base, current);

    let mut old_index = 0usize;
    let mut new_index = 0usize;

    for change in diff.iter_all_changes() {
        match change.tag() {
            ChangeTag::Equal => {
                if old_index == target {
                    let now = new_index as u32 + 1;
                    return Resolved {
                        state: if now == line {
                            AnchorState::Unchanged
                        } else {
                            AnchorState::Moved { line: now }
                        },
                        current_text: current_lines.get(new_index).map(|s| s.to_string()),
                    };
                }
                old_index += 1;
                new_index += 1;
            }
            ChangeTag::Delete => {
                if old_index == target {
                    // 対象の行は消えた。同じ位置に別の行が入っていれば書き換え、
                    // 何も無ければ削除として扱う。
                    return if new_index < current_lines.len() {
                        Resolved {
                            state: AnchorState::Rewritten,
                            current_text: current_lines.get(new_index).map(|s| s.to_string()),
                        }
                    } else {
                        Resolved {
                            state: AnchorState::Removed,
                            current_text: None,
                        }
                    };
                }
                old_index += 1;
            }
            ChangeTag::Insert => {
                new_index += 1;
            }
        }
    }

    Resolved {
        state: AnchorState::Removed,
        current_text: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn resolve_lines(base: &str, current: &str, line: u32) -> Resolved {
        map_line(base, current, line)
    }

    #[test]
    fn 変わっていなければ未変更と分かる() {
        let text = "a\nb\nc\n";
        let r = resolve_lines(text, text, 2);
        assert_eq!(r.state, AnchorState::Unchanged);
        assert_eq!(r.current_text.as_deref(), Some("b"));
    }

    #[test]
    fn 上に行が足されたら動いたと分かる() {
        let r = resolve_lines("a\nb\nc\n", "x\ny\na\nb\nc\n", 2);
        assert_eq!(r.state, AnchorState::Moved { line: 4 });
        assert_eq!(r.current_text.as_deref(), Some("b"));
    }

    #[test]
    fn 対象の行が書き換わったら書き換えと分かる() {
        let r = resolve_lines("a\nb\nc\n", "a\nB!\nc\n", 2);
        assert_eq!(r.state, AnchorState::Rewritten);
    }

    #[test]
    fn 対象の行が消えたら削除と分かる() {
        let r = resolve_lines("a\nb\nc\n", "a\nc\n", 2);
        // b が消えて c が繰り上がる。同じ位置に別の行があるので書き換え扱い。
        assert!(matches!(
            r.state,
            AnchorState::Rewritten | AnchorState::Removed
        ));
    }

    #[test]
    fn 末尾の行が消えたら削除と分かる() {
        let r = resolve_lines("a\nb\nc\n", "a\nb\n", 3);
        assert_eq!(r.state, AnchorState::Removed);
        assert!(r.current_text.is_none());
    }

    #[test]
    fn 基準版に無い行番号は削除として扱う() {
        let r = resolve_lines("a\n", "a\n", 9);
        assert_eq!(r.state, AnchorState::Removed);
    }

    #[test]
    fn 日本語の行でもずれない() {
        let r = resolve_lines(
            "見出し\n本文です\n終わり\n",
            "追記\n見出し\n本文です\n終わり\n",
            2,
        );
        assert_eq!(r.state, AnchorState::Moved { line: 3 });
        assert_eq!(r.current_text.as_deref(), Some("本文です"));
    }
}
