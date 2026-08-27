//! split 表示用の行対応付け。
//!
//! ここで確定させた対応は行内差分の算出元にもなる。フロントで組み直すと
//! 行内差分の「どの行とどの行を比べたか」と食い違う余地が生まれる。

use crate::domain::diff::{DiffLine, DiffLineKind, DiffRow};

/// ハンク内の行列から左右のペアを作る。
///
/// 削除の連なりと追加の連なりを添字の順に突き合わせ、余った側は片側だけの行にする。
pub fn build_rows(lines: &[DiffLine]) -> Vec<DiffRow> {
    let mut rows = Vec::new();
    let mut i = 0;

    while i < lines.len() {
        match lines[i].kind {
            DiffLineKind::Context => {
                rows.push(DiffRow {
                    left: Some(i),
                    right: Some(i),
                });
                i += 1;
            }
            DiffLineKind::Del | DiffLineKind::Add => {
                let dels_start = i;
                while i < lines.len() && lines[i].kind == DiffLineKind::Del {
                    i += 1;
                }
                let dels_end = i;
                let adds_start = i;
                while i < lines.len() && lines[i].kind == DiffLineKind::Add {
                    i += 1;
                }
                let adds_end = i;

                let dels = dels_start..dels_end;
                let adds = adds_start..adds_end;
                let paired = dels.len().min(adds.len());

                for k in 0..paired {
                    rows.push(DiffRow {
                        left: Some(dels_start + k),
                        right: Some(adds_start + k),
                    });
                }
                for k in paired..dels.len() {
                    rows.push(DiffRow {
                        left: Some(dels_start + k),
                        right: None,
                    });
                }
                for k in paired..adds.len() {
                    rows.push(DiffRow {
                        left: None,
                        right: Some(adds_start + k),
                    });
                }
            }
        }
    }

    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(kind: DiffLineKind) -> DiffLine {
        DiffLine {
            kind,
            old_number: None,
            new_number: None,
            content: String::new(),
            no_newline: false,
            inline: None,
            tokens: None,
        }
    }

    #[test]
    fn 文脈行は左右に同じ行を置く() {
        let lines = vec![line(DiffLineKind::Context)];
        let rows = build_rows(&lines);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].left, Some(0));
        assert_eq!(rows[0].right, Some(0));
    }

    #[test]
    fn 同数の削除と追加を横並びにする() {
        let lines = vec![
            line(DiffLineKind::Del),
            line(DiffLineKind::Del),
            line(DiffLineKind::Add),
            line(DiffLineKind::Add),
        ];
        let rows = build_rows(&lines);
        assert_eq!(rows.len(), 2);
        assert_eq!((rows[0].left, rows[0].right), (Some(0), Some(2)));
        assert_eq!((rows[1].left, rows[1].right), (Some(1), Some(3)));
    }

    #[test]
    fn 追加のみは右だけに出す() {
        let lines = vec![line(DiffLineKind::Add), line(DiffLineKind::Add)];
        let rows = build_rows(&lines);
        assert_eq!(rows.len(), 2);
        assert_eq!((rows[0].left, rows[0].right), (None, Some(0)));
        assert_eq!((rows[1].left, rows[1].right), (None, Some(1)));
    }

    #[test]
    fn 削除のみは左だけに出す() {
        let lines = vec![line(DiffLineKind::Del)];
        let rows = build_rows(&lines);
        assert_eq!((rows[0].left, rows[0].right), (Some(0), None));
    }

    #[test]
    fn 不均等なときは余りを片側に流す() {
        // 削除 3 に対し追加 1。先頭 1 組だけ横並びで、残り 2 行は左のみ。
        let lines = vec![
            line(DiffLineKind::Del),
            line(DiffLineKind::Del),
            line(DiffLineKind::Del),
            line(DiffLineKind::Add),
        ];
        let rows = build_rows(&lines);
        assert_eq!(rows.len(), 3);
        assert_eq!((rows[0].left, rows[0].right), (Some(0), Some(3)));
        assert_eq!((rows[1].left, rows[1].right), (Some(1), None));
        assert_eq!((rows[2].left, rows[2].right), (Some(2), None));
    }

    #[test]
    fn 文脈を挟んだ変更を別の塊として扱う() {
        let lines = vec![
            line(DiffLineKind::Context),
            line(DiffLineKind::Del),
            line(DiffLineKind::Add),
            line(DiffLineKind::Context),
            line(DiffLineKind::Add),
        ];
        let rows = build_rows(&lines);
        assert_eq!(rows.len(), 4);
        assert_eq!((rows[1].left, rows[1].right), (Some(1), Some(2)));
        assert_eq!((rows[3].left, rows[3].right), (None, Some(4)));
    }
}
