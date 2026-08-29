//! unified diff のパーサ。
//!
//! 「文字列 → 構造体」の純関数として閉じてあり、フィクスチャで固められる。
//! パスは `diff --git a/... b/...` 行からは取らない。空白を含むパスでは
//! `a/` と `b/` の境目が一意に決まらず、静かに壊れる。`---` / `+++` と
//! `rename from` / `rename to` から取る。

use crate::domain::diff::{DiffFileStatus, DiffHunk, DiffLine, DiffLineKind};

/// パーサが取り出す 1 ファイル分。増減行数や生成判定は上位層で足す。
#[derive(Debug, Clone)]
pub struct ParsedFile {
    pub path: String,
    pub old_path: Option<String>,
    pub status: DiffFileStatus,
    pub binary: bool,
    pub hunks: Vec<DiffHunk>,
    /// このファイル分の生の diff テキスト。閲覧済みマークの陳腐化判定に使う。
    pub raw: String,
}

pub fn parse_patch(text: &str) -> Vec<ParsedFile> {
    let mut files = Vec::new();
    let mut current: Vec<&str> = Vec::new();

    for line in text.lines() {
        if line.starts_with("diff --git ") && !current.is_empty() {
            if let Some(f) = parse_file(&current) {
                files.push(f);
            }
            current.clear();
        }
        current.push(line);
    }
    if !current.is_empty() {
        if let Some(f) = parse_file(&current) {
            files.push(f);
        }
    }
    files
}

fn parse_file(lines: &[&str]) -> Option<ParsedFile> {
    let mut old_path: Option<String> = None;
    let mut new_path: Option<String> = None;
    let mut rename_from: Option<String> = None;
    let mut rename_to: Option<String> = None;
    let mut status: Option<DiffFileStatus> = None;
    let mut binary = false;
    let mut hunks: Vec<DiffHunk> = Vec::new();
    let mut body_start = lines.len();

    for (i, line) in lines.iter().enumerate() {
        if line.starts_with("@@") {
            body_start = i;
            break;
        }
        if let Some(rest) = line.strip_prefix("--- ") {
            old_path = header_path(rest);
        } else if let Some(rest) = line.strip_prefix("+++ ") {
            new_path = header_path(rest);
        } else if let Some(rest) = line.strip_prefix("rename from ") {
            rename_from = Some(unquote(rest));
            status = Some(DiffFileStatus::Renamed);
        } else if let Some(rest) = line.strip_prefix("rename to ") {
            rename_to = Some(unquote(rest));
        } else if let Some(rest) = line.strip_prefix("copy from ") {
            rename_from = Some(unquote(rest));
            status = Some(DiffFileStatus::Copied);
        } else if let Some(rest) = line.strip_prefix("copy to ") {
            rename_to = Some(unquote(rest));
        } else if line.starts_with("new file mode ") {
            status = Some(DiffFileStatus::Added);
        } else if line.starts_with("deleted file mode ") {
            status = Some(DiffFileStatus::Deleted);
        } else if line.starts_with("Binary files ") || line.starts_with("GIT binary patch") {
            binary = true;
        }
    }

    if body_start < lines.len() {
        hunks = parse_hunks(&lines[body_start..]);
    }

    // 変更後のパスを優先し、削除なら変更前のパスを使う。
    let path = rename_to
        .clone()
        .or(new_path.clone())
        .or(old_path.clone())
        .or_else(|| fallback_path(lines))?;

    let old_path = rename_from.clone().or_else(|| {
        // rename 以外で old と new が違うことは無いので、同じなら持たせない。
        old_path.filter(|p| Some(p) != new_path.as_ref())
    });

    let status = status.unwrap_or({
        // mode だけが変わった場合もここに来る。内容の変更が無いことは
        // hunks が空であることで呼び出し側に伝わる。
        DiffFileStatus::Modified
    });

    Some(ParsedFile {
        path,
        old_path,
        status,
        binary,
        hunks,
        raw: lines.join("\n"),
    })
}

/// `--- a/path` / `+++ b/path` の右辺からパスを取る。`/dev/null` は None。
fn header_path(rest: &str) -> Option<String> {
    let rest = rest.trim_end();
    if rest == "/dev/null" {
        return None;
    }
    let unquoted = unquote(rest);
    // 接頭辞は打ち消し済みの設定で常に `a/` `b/` になる。
    Some(
        unquoted
            .strip_prefix("a/")
            .or_else(|| unquoted.strip_prefix("b/"))
            .unwrap_or(&unquoted)
            .to_string(),
    )
}

/// 制御文字などを含むパスを git は `"..."` で囲んで出す。囲みを外す。
fn unquote(s: &str) -> String {
    let s = s.trim();
    let Some(inner) = s.strip_prefix('"').and_then(|r| r.strip_suffix('"')) else {
        return s.to_string();
    };
    let mut out = String::with_capacity(inner.len());
    let mut chars = inner.chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('n') => out.push('\n'),
            Some('t') => out.push('\t'),
            Some('"') => out.push('"'),
            Some('\\') => out.push('\\'),
            Some(other) => {
                out.push('\\');
                out.push(other);
            }
            None => out.push('\\'),
        }
    }
    out
}

/// `---` / `+++` が無い（内容変更なしの rename や mode 変更のみ）ときの保険。
/// `diff --git a/X b/X` から、前半と後半が同じ長さである性質を使って割る。
fn fallback_path(lines: &[&str]) -> Option<String> {
    let head = lines.first()?.strip_prefix("diff --git ")?;
    let rest = head.strip_prefix("a/")?;
    // `a/<p> b/<p>` の形。後半の ` b/` を、前半と同じ長さになる位置で探す。
    let half = (rest.len().checked_sub(3)?) / 2;
    let candidate = &rest[..half];
    if rest.get(half..) == Some(&format!(" b/{candidate}")) {
        return Some(candidate.to_string());
    }
    // rename などで前後のパスが違う場合はここでは決められない。
    None
}

fn parse_hunks(lines: &[&str]) -> Vec<DiffHunk> {
    let mut hunks: Vec<DiffHunk> = Vec::new();
    let mut old_no = 0u32;
    let mut new_no = 0u32;

    for line in lines {
        if let Some(header) = parse_hunk_header(line) {
            old_no = header.old_start;
            new_no = header.new_start;
            hunks.push(DiffHunk {
                old_start: header.old_start,
                old_lines: header.old_lines,
                new_start: header.new_start,
                new_lines: header.new_lines,
                header: header.context,
                lines: Vec::new(),
                rows: Vec::new(),
            });
            continue;
        }

        let Some(hunk) = hunks.last_mut() else { continue };

        // 直前の行がファイル末尾に改行を持たないことを示す注記。
        if line.starts_with('\\') {
            if let Some(last) = hunk.lines.last_mut() {
                last.no_newline = true;
            }
            continue;
        }

        let mut chars = line.chars();
        let (kind, content) = match chars.next() {
            Some('+') => (DiffLineKind::Add, chars.as_str()),
            Some('-') => (DiffLineKind::Del, chars.as_str()),
            Some(' ') => (DiffLineKind::Context, chars.as_str()),
            // 空行は文脈行の本文が空の場合に起きる。
            None => (DiffLineKind::Context, ""),
            // ハンクの範囲外にある行（余分な出力）は捨てる。
            Some(_) => continue,
        };

        let (old_number, new_number) = match kind {
            DiffLineKind::Context => {
                let pair = (Some(old_no), Some(new_no));
                old_no += 1;
                new_no += 1;
                pair
            }
            DiffLineKind::Del => {
                let pair = (Some(old_no), None);
                old_no += 1;
                pair
            }
            DiffLineKind::Add => {
                let pair = (None, Some(new_no));
                new_no += 1;
                pair
            }
        };

        hunk.lines.push(DiffLine {
            kind,
            old_number,
            new_number,
            content: content.to_string(),
            no_newline: false,
            inline: None,
            tokens: None,
        });
    }

    hunks
}

struct HunkHeader {
    old_start: u32,
    old_lines: u32,
    new_start: u32,
    new_lines: u32,
    context: String,
}

/// `@@ -12,7 +12,9 @@ fn foo()` を読む。
fn parse_hunk_header(line: &str) -> Option<HunkHeader> {
    let rest = line.strip_prefix("@@ ")?;
    let (ranges, context) = rest.split_once(" @@")?;
    let (old, new) = ranges.split_once(' ')?;
    let (old_start, old_lines) = parse_range(old.strip_prefix('-')?)?;
    let (new_start, new_lines) = parse_range(new.strip_prefix('+')?)?;
    Some(HunkHeader {
        old_start,
        old_lines,
        new_start,
        new_lines,
        context: context.trim().to_string(),
    })
}

/// `12,7` または `12`（行数 1 の省略形）。
fn parse_range(s: &str) -> Option<(u32, u32)> {
    match s.split_once(',') {
        Some((start, count)) => Some((start.parse().ok()?, count.parse().ok()?)),
        None => Some((s.parse().ok()?, 1)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 行を組み立てる。文字列リテラルの `\` 行継続は次行の先頭空白まで食うため、
    /// 先頭 1 文字が意味を持つ diff のフィクスチャでは使えない。
    fn patch_of(lines: &[&str]) -> String {
        format!("{}\n", lines.join("\n"))
    }

    #[test]
    fn 通常の変更を読む() {
        let patch = patch_of(&[
            "diff --git a/src/main.rs b/src/main.rs",
            "index 1111111..2222222 100644",
            "--- a/src/main.rs",
            "+++ b/src/main.rs",
            "@@ -1,3 +1,4 @@ fn main()",
            " let a = 1;",
            "-let b = 2;",
            "+let b = 3;",
            "+let c = 4;",
        ]);
        let files = parse_patch(&patch);
        assert_eq!(files.len(), 1);
        let f = &files[0];
        assert_eq!(f.path, "src/main.rs");
        assert_eq!(f.status, DiffFileStatus::Modified);
        assert_eq!(f.hunks.len(), 1);

        let h = &f.hunks[0];
        assert_eq!(h.header, "fn main()");
        assert_eq!(h.lines.len(), 4);
        assert_eq!(h.lines[0].kind, DiffLineKind::Context);
        assert_eq!(h.lines[0].old_number, Some(1));
        assert_eq!(h.lines[0].new_number, Some(1));
        assert_eq!(h.lines[1].kind, DiffLineKind::Del);
        assert_eq!(h.lines[1].old_number, Some(2));
        assert_eq!(h.lines[1].new_number, None);
        assert_eq!(h.lines[3].content, "let c = 4;");
        // 文脈行が new=1、追加 2 行が new=2 と new=3 になる。
        assert_eq!(h.lines[2].new_number, Some(2));
        assert_eq!(h.lines[3].new_number, Some(3));
    }

    #[test]
    fn 空白を含むパスを取り違えない() {
        let patch = "diff --git a/my dir/a b.txt b/my dir/a b.txt\n\
index 1111111..2222222 100644\n\
--- a/my dir/a b.txt\n\
+++ b/my dir/a b.txt\n\
@@ -1 +1 @@\n\
-old\n\
+new\n";
        let files = parse_patch(patch);
        assert_eq!(files[0].path, "my dir/a b.txt");
        assert_eq!(files[0].old_path, None);
    }

    #[test]
    fn 日本語のパスをそのまま読む() {
        let patch = "diff --git a/docs/設計書.md b/docs/設計書.md\n\
--- a/docs/設計書.md\n\
+++ b/docs/設計書.md\n\
@@ -1 +1 @@\n\
-古い\n\
+新しい\n";
        let files = parse_patch(patch);
        assert_eq!(files[0].path, "docs/設計書.md");
        assert_eq!(files[0].hunks[0].lines[1].content, "新しい");
    }

    #[test]
    fn rename_を検出する() {
        let patch = "diff --git a/old.rs b/new.rs\n\
similarity index 92%\n\
rename from old.rs\n\
rename to new.rs\n\
index 1111111..2222222 100644\n\
--- a/old.rs\n\
+++ b/new.rs\n\
@@ -1 +1 @@\n\
-a\n\
+b\n";
        let files = parse_patch(patch);
        assert_eq!(files[0].path, "new.rs");
        assert_eq!(files[0].old_path.as_deref(), Some("old.rs"));
        assert_eq!(files[0].status, DiffFileStatus::Renamed);
    }

    #[test]
    fn 内容変更なしの_rename_もパスが取れる() {
        let patch = "diff --git a/old.rs b/new.rs\n\
similarity index 100%\n\
rename from old.rs\n\
rename to new.rs\n";
        let files = parse_patch(patch);
        assert_eq!(files[0].path, "new.rs");
        assert_eq!(files[0].old_path.as_deref(), Some("old.rs"));
        assert!(files[0].hunks.is_empty());
    }

    #[test]
    fn 新規と削除を区別する() {
        let patch = "diff --git a/new.txt b/new.txt\n\
new file mode 100644\n\
--- /dev/null\n\
+++ b/new.txt\n\
@@ -0,0 +1,2 @@\n\
+one\n\
+two\n\
diff --git a/gone.txt b/gone.txt\n\
deleted file mode 100644\n\
--- a/gone.txt\n\
+++ /dev/null\n\
@@ -1,1 +0,0 @@\n\
-bye\n";
        let files = parse_patch(patch);
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].path, "new.txt");
        assert_eq!(files[0].status, DiffFileStatus::Added);
        assert_eq!(files[1].path, "gone.txt");
        assert_eq!(files[1].status, DiffFileStatus::Deleted);
    }

    #[test]
    fn 改行なしの注記を直前の行に付ける() {
        let patch = "diff --git a/a.txt b/a.txt\n\
--- a/a.txt\n\
+++ b/a.txt\n\
@@ -1 +1 @@\n\
-old\n\
\\ No newline at end of file\n\
+new\n\
\\ No newline at end of file\n";
        let files = parse_patch(patch);
        let lines = &files[0].hunks[0].lines;
        assert!(lines[0].no_newline);
        assert!(lines[1].no_newline);
    }

    #[test]
    fn バイナリを検出する() {
        let patch = "diff --git a/logo.png b/logo.png\n\
index 1111111..2222222 100644\n\
Binary files a/logo.png and b/logo.png differ\n";
        let files = parse_patch(patch);
        assert_eq!(files[0].path, "logo.png");
        assert!(files[0].binary);
    }

    #[test]
    fn 複数ハンクの行番号が連続する() {
        let patch = patch_of(&[
            "diff --git a/a.txt b/a.txt",
            "--- a/a.txt",
            "+++ b/a.txt",
            "@@ -1,2 +1,2 @@",
            " one",
            "-two",
            "+TWO",
            "@@ -10,2 +10,3 @@",
            " ten",
            "+eleven",
        ]);
        let files = parse_patch(&patch);
        let hunks = &files[0].hunks;
        assert_eq!(hunks.len(), 2);
        assert_eq!(hunks[1].lines[0].old_number, Some(10));
        assert_eq!(hunks[1].lines[1].new_number, Some(11));
        assert_eq!(hunks[1].lines[1].old_number, None);
    }

    #[test]
    fn 空の文脈行を落とさない() {
        // 文脈行が空行のとき、git は先頭の空白 1 文字だけの行を出す。
        let patch = patch_of(&[
            "diff --git a/a.txt b/a.txt",
            "--- a/a.txt",
            "+++ b/a.txt",
            "@@ -1,3 +1,3 @@",
            " one",
            " ",
            "-three",
            "+THREE",
        ]);
        let files = parse_patch(&patch);
        let lines = &files[0].hunks[0].lines;
        assert_eq!(lines.len(), 4);
        assert_eq!(lines[1].content, "");
        assert_eq!(lines[1].kind, DiffLineKind::Context);
        assert_eq!(lines[2].old_number, Some(3));
    }
}
