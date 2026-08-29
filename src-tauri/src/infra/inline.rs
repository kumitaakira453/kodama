//! 行内差分の計算。
//!
//! 対になった削除行と追加行を語単位で比べ、変化した範囲を返す。範囲の単位は
//! UTF-16 コードユニットで、`Token` と同じ座標系に乗る。TS 側はこの 2 つを
//! 区間として重ねるだけでよく、片方をもう片方に合わせる変換が要らない。

use std::time::Duration;

use similar::{Algorithm, ChangeTag, TextDiff};

use crate::domain::diff::InlineRange;

/// これより長い行は語単位の比較を諦める。minify 済みの 1 行などで時間を食う。
const MAX_LEN: usize = 2000;
/// 似ていない行ペアは、行内差分を出しても全部が強調されて読めなくなる。
const MIN_RATIO: f32 = 0.3;
/// 病的な入力での打ち切り。
const TIMEOUT: Duration = Duration::from_millis(50);

/// (削除行側の範囲, 追加行側の範囲)。計算しなかった場合は両方 None。
pub fn compute(old: &str, new: &str) -> (Option<Vec<InlineRange>>, Option<Vec<InlineRange>>) {
    if old == new || old.len() > MAX_LEN || new.len() > MAX_LEN {
        return (None, None);
    }

    let diff = TextDiff::configure()
        .algorithm(Algorithm::Patience)
        .timeout(TIMEOUT)
        .diff_unicode_words(old, new);

    if diff.ratio() < MIN_RATIO {
        return (None, None);
    }

    let mut old_ranges = Vec::new();
    let mut new_ranges = Vec::new();
    let mut old_pos: u32 = 0;
    let mut new_pos: u32 = 0;

    for change in diff.iter_all_changes() {
        let len = utf16_len(change.value());
        match change.tag() {
            ChangeTag::Equal => {
                old_pos += len;
                new_pos += len;
            }
            ChangeTag::Delete => {
                push(&mut old_ranges, old_pos, len);
                old_pos += len;
            }
            ChangeTag::Insert => {
                push(&mut new_ranges, new_pos, len);
                new_pos += len;
            }
        }
    }

    // 片側が全く変わっていないなら、その側に帯を出す意味がない。
    (
        (!old_ranges.is_empty()).then_some(old_ranges),
        (!new_ranges.is_empty()).then_some(new_ranges),
    )
}

/// 直前の範囲と隣接していれば繋ぐ。語ごとに帯が切れて縞にならない。
fn push(ranges: &mut Vec<InlineRange>, start: u32, len: u32) {
    if len == 0 {
        return;
    }
    if let Some(last) = ranges.last_mut() {
        if last.start + last.len == start {
            last.len += len;
            return;
        }
    }
    ranges.push(InlineRange { start, len });
}

fn utf16_len(s: &str) -> u32 {
    s.encode_utf16().count() as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 変わった語だけを範囲にする() {
        let (old, new) = compute("let value = 1;", "let value = 2;");
        let old = old.expect("削除側の範囲");
        let new = new.expect("追加側の範囲");
        // 変化しているのは "1" と "2" の 1 文字ずつ。
        assert_eq!(old.len(), 1);
        assert_eq!(new.len(), 1);
        assert_eq!(old[0].len, 1);
        assert_eq!(new[0].len, 1);
        assert_eq!(&"let value = 1;"[old[0].start as usize..], "1;");
    }

    #[test]
    fn 同じ行では計算しない() {
        assert_eq!(compute("same", "same"), (None, None));
    }

    #[test]
    fn 似ていない行では出さない() {
        let (old, new) = compute("完全に別の内容です", "abcdefghij klmnop");
        assert!(old.is_none());
        assert!(new.is_none());
    }

    #[test]
    fn 日本語は語の境界で切る() {
        let (_, new) = compute("これは古い説明です", "これは新しい説明です");
        let new = new.expect("追加側の範囲");
        // 文字単位でバラバラにならず、変化した語のまとまりとして返る。
        assert!(!new.is_empty());
        assert!(new.len() <= 2);
    }

    #[test]
    fn 絵文字を含んでも位置がずれない() {
        let old = "status: 🍎 ok";
        let new = "status: 🍎 ng";
        let (_, ranges) = compute(old, new);
        let ranges = ranges.expect("追加側の範囲");
        let units: Vec<u16> = new.encode_utf16().collect();
        let r = ranges[0];
        let slice = String::from_utf16(&units[r.start as usize..(r.start + r.len) as usize])
            .expect("UTF-16 の切り出し");
        assert_eq!(slice, "ng");
    }

    #[test]
    fn 極端に長い行は諦める() {
        let long = "x".repeat(MAX_LEN + 1);
        assert_eq!(compute(&long, "short"), (None, None));
    }

    #[test]
    fn 連続して挿入された語をひとつの帯にまとめる() {
        // 挿入が途切れずに続くなら、語ごとに縞にならず 1 本の帯になる。
        let (_, new) = compute("a d", "a X Y d");
        let new = new.expect("追加側の範囲");
        assert_eq!(new.len(), 1);
        let inserted = &"a X Y d"[new[0].start as usize..(new[0].start + new[0].len) as usize];
        assert_eq!(inserted, "X Y ");
    }

    #[test]
    fn 変化のあいだに同じ語が挟まれば帯を分ける() {
        // 空白が変わっていないので、そこで帯を切る方が「何が変わったか」に忠実。
        let (_, new) = compute("a b c d", "a X Y d");
        let new = new.expect("追加側の範囲");
        assert_eq!(new.len(), 2);
    }
}
