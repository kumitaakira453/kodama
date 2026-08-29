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
                    // 対象の行は消えた。同じ位置に来た行が元と似ていれば「書き換え」、
                    // 似ていなければ「消えた」とする。無関係な行を書き換え後として
                    // 見せると、それを直せばよいと誤解させる。
                    let replacement = current_lines.get(new_index);
                    let deleted = base_lines.get(target).copied().unwrap_or("");
                    return match replacement {
                        Some(text) if similar_enough(deleted, text) => Resolved {
                            state: AnchorState::Rewritten,
                            current_text: Some((*text).to_string()),
                        },
                        _ => Resolved {
                            state: AnchorState::Removed,
                            current_text: None,
                        },
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

/// 消えた行と、同じ位置に来た行が「同じものの書き換え」と言えるか。
///
/// 識別子の重なりで測る。文字や語の類似度は、インデントと記号が共通しているだけで
/// 高く出てしまい、`name = "user"` と `return "x"` を似ていると判定する。
/// コードで意味を持つのは識別子なので、そこだけを見る。
fn similar_enough(before: &str, after: &str) -> bool {
    let a = identifiers(before);
    let b = identifiers(after);
    if a.is_empty() || b.is_empty() {
        return false;
    }
    let shared = a.iter().filter(|w| b.contains(*w)).count();
    // 少ない側を分母にする。片方が長くても、元の識別子が残っていれば書き換え。
    shared as f32 / a.len().min(b.len()) as f32 >= 0.34
}

/// 2 文字以上の英数字の並びを識別子とみなす。大文字小文字は無視する。
fn identifiers(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    for c in line.chars() {
        if c.is_alphanumeric() || c == '_' {
            current.push(c.to_ascii_lowercase());
        } else if current.len() >= 2 {
            out.push(std::mem::take(&mut current));
        } else {
            current.clear();
        }
    }
    if current.len() >= 2 {
        out.push(current);
    }
    out.sort();
    out.dedup();
    out
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
    fn インデントと記号が共通なだけでは書き換えと呼ばない() {
        // 元は `name = "user"`、来たのは `return "x"`。空白と引用符は共通だが
        // 識別子が重ならないので、消えたものとして扱う。
        let r = resolve_lines(
            "def hello():\n    name = \"user\"\n    return name\n",
            "def hello():\n    return \"x\"\n",
            2,
        );
        assert_eq!(r.state, AnchorState::Removed);
    }

    #[test]
    fn 無関係な行に置き換わったら削除と分かる() {
        // b が消えて c が繰り上がる。c は b と似ていないので書き換えとは呼ばない。
        let r = resolve_lines("a\nb\nc\n", "a\nc\n", 2);
        assert_eq!(r.state, AnchorState::Removed);
        assert!(r.current_text.is_none());
    }

    #[test]
    fn 対象の行が書き換わったら書き換えと分かる() {
        let r = resolve_lines(
            "    name = \"user\"\n",
            "    name = os.environ[\"NAME\"]\n",
            1,
        );
        assert_eq!(r.state, AnchorState::Rewritten);
        assert!(r.current_text.is_some());
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
