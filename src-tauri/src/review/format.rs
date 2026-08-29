//! CLI の出力整形。
//!
//! 読み手は AI なので、JSON より字数が少なく読みやすい Markdown を既定にする。
//! どの状態でも**指摘した時点の逐語引用を必ず添える**。位置が特定できなくなっても
//! 対象を見失わないため。

use crate::review::model::{AnchorState, Status, ThreadView};

pub const EMPTY_MESSAGE: &str = "未解決の指摘はありません。";

pub fn threads_markdown(views: &[ThreadView]) -> String {
    if views.is_empty() {
        return EMPTY_MESSAGE.to_string();
    }

    let mut out = String::new();
    let mut current_file = "";

    for view in views {
        if view.thread.file != current_file {
            if !out.is_empty() {
                out.push('\n');
            }
            out.push_str(&format!("## {}\n\n", view.thread.file));
            current_file = &view.thread.file;
        }
        out.push_str(&thread_markdown(view));
        out.push('\n');
    }
    out.trim_end().to_string()
}

fn thread_markdown(view: &ThreadView) -> String {
    let t = &view.thread;
    let mut out = String::new();

    out.push_str(&format!(
        "### 指摘 #{} — {}\n",
        t.id,
        headline(&view.anchor, &t.status)
    ));

    if !t.context.is_empty() {
        out.push_str(&format!("場所: {}\n", t.context));
    }
    out.push_str(&format!("比較: {}\n", describe_revision(&t.revision_key)));

    out.push_str(&format!(
        "\n指摘時の行（{}）:\n",
        line_range(t.line_start, t.line_end)
    ));
    out.push_str(&fence(&t.quote, language_of(&t.file)));

    // 現在の内容は「書き換わった」ときだけ出す。未変更なら引用と同じで、
    // 二度出しても字数が増えるだけになる。
    if matches!(view.anchor, AnchorState::Rewritten) {
        if let Some(text) = &view.current_text {
            out.push_str("\n同じ位置の現在の行:\n");
            out.push_str(&fence(text, language_of(&t.file)));
        }
    }

    if matches!(view.anchor, AnchorState::Removed | AnchorState::NoFile) {
        out.push_str("\n※ 対象が見つからないので、内容を見て対応済みか判断してください。\n");
    }

    if !t.comments.is_empty() {
        out.push_str("\n会話:\n");
        for c in &t.comments {
            // 改行は箇条書きの継続行に畳む。
            let body = c.body.trim().replace('\n', "\n  ");
            out.push_str(&format!("- {}: {}\n", c.author, body));
        }
    }

    out
}

/// 状態を毎回自然言語で書く。AI が列挙子の意味を推測しなくてよい。
fn headline(anchor: &AnchorState, status: &Status) -> String {
    let base = match anchor {
        AnchorState::Unchanged => "対象は指摘した時点のままです".to_string(),
        AnchorState::Moved { line } => {
            format!("対象は指摘のあと移動しています（現在 {line} 行目）")
        }
        AnchorState::Rewritten => "対象は指摘のあと書き換わっています".to_string(),
        AnchorState::Removed => "対象は消えています".to_string(),
        AnchorState::Committed { sha } => {
            format!("対象はコミット {} に取り込まれています", short(sha))
        }
        AnchorState::NoFile => "ファイルが見つかりません".to_string(),
    };
    match status {
        Status::Open => base,
        Status::Resolved { by, .. } => format!("{base}（解決済み / {by}）"),
        Status::Dropped { by, .. } => format!("{base}（取り下げ / {by}）"),
    }
}

fn describe_revision(key: &str) -> String {
    match key.split_once(':') {
        Some(("uncommitted", path)) => format!("{} の未コミット変更", basename(path)),
        Some(("staged", path)) => format!("{} のステージ済み変更", basename(path)),
        Some(("working", path)) => format!("{} の未ステージ変更", basename(path)),
        Some(("range", range)) => format!("コミット {range}"),
        _ => key.to_string(),
    }
}

fn line_range(start: u32, end: u32) -> String {
    if start == end {
        start.to_string()
    } else {
        format!("{start}-{end}")
    }
}

fn fence(text: &str, lang: &str) -> String {
    format!("```{lang}\n{}\n```\n", text.trim_end_matches('\n'))
}

fn basename(path: &str) -> &str {
    path.trim_end_matches('/').rsplit('/').next().unwrap_or(path)
}

fn short(sha: &str) -> String {
    sha.chars().take(7).collect()
}

/// コードフェンスの言語。拡張子から引くだけで、外れても害はない。
fn language_of(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "rs" => "rust",
        "ts" => "ts",
        "tsx" => "tsx",
        "js" | "mjs" | "cjs" => "js",
        "jsx" => "jsx",
        "py" => "python",
        "go" => "go",
        "rb" => "ruby",
        "java" => "java",
        "kt" => "kotlin",
        "swift" => "swift",
        "sh" | "bash" | "zsh" => "bash",
        "sql" => "sql",
        "css" | "scss" => "css",
        "html" => "html",
        "json" => "json",
        "yml" | "yaml" => "yaml",
        "toml" => "toml",
        "md" => "markdown",
        _ => "",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::review::model::{Comment, Side, Thread};

    fn view(anchor: AnchorState) -> ThreadView {
        ThreadView {
            thread: Thread {
                id: "a3f10000".into(),
                repo: "/tmp/repo".into(),
                revision_key: "uncommitted:/tmp/repo/feature-upload".into(),
                file: "src/app.py".into(),
                side: Side::New,
                line_start: 34,
                line_end: 34,
                quote: "    button = get(\"user:upload\")".into(),
                context: "def render_with_file".into(),
                base_hash: String::new(),
                status: Status::Open,
                comments: vec![Comment {
                    id: "c1".into(),
                    author: "汲田 晶".into(),
                    body: "name の指定が追随していない".into(),
                    created_at: 0,
                }],
                created_at: 0,
            },
            anchor,
            current_text: Some("    button = get(\"featuresMember:upload\")".into()),
        }
    }

    #[test]
    fn 指摘が無ければ一行で返す() {
        assert_eq!(threads_markdown(&[]), EMPTY_MESSAGE);
    }

    #[test]
    fn どの状態でも指摘時の引用を必ず出す() {
        for anchor in [
            AnchorState::Unchanged,
            AnchorState::Moved { line: 37 },
            AnchorState::Rewritten,
            AnchorState::Removed,
            AnchorState::Committed {
                sha: "a1b2c3d4e5".into(),
            },
            AnchorState::NoFile,
        ] {
            let out = threads_markdown(&[view(anchor.clone())]);
            assert!(
                out.contains("button = get(\"user:upload\")"),
                "引用が無い: {anchor:?}\n{out}"
            );
        }
    }

    #[test]
    fn 状態を自然言語で書く() {
        let out = threads_markdown(&[view(AnchorState::Moved { line: 37 })]);
        assert!(out.contains("現在 37 行目"), "{out}");
    }

    #[test]
    fn 現在の行は書き換わったときだけ出す() {
        let rewritten = threads_markdown(&[view(AnchorState::Rewritten)]);
        assert!(rewritten.contains("同じ位置の現在の行"));

        let unchanged = threads_markdown(&[view(AnchorState::Unchanged)]);
        assert!(
            !unchanged.contains("同じ位置の現在の行"),
            "未変更で二度出している: {unchanged}"
        );
    }

    #[test]
    fn 追えないときは判断を促す注記を添える() {
        let out = threads_markdown(&[view(AnchorState::Removed)]);
        assert!(out.contains("対応済みか判断してください"), "{out}");
    }

    #[test]
    fn ファイル見出しはファイルごとに一度だけ出す() {
        let mut a = view(AnchorState::Unchanged);
        let mut b = view(AnchorState::Unchanged);
        b.thread.id = "b0000000".into();
        a.thread.created_at = 1;
        b.thread.created_at = 2;
        let out = threads_markdown(&[a, b]);
        assert_eq!(out.matches("## src/app.py").count(), 1, "{out}");
    }

    #[test]
    fn 比較対象を読める形にする() {
        let out = threads_markdown(&[view(AnchorState::Unchanged)]);
        assert!(out.contains("feature-upload の未コミット変更"), "{out}");
    }

    #[test]
    fn 解決済みは見出しに示す() {
        let mut v = view(AnchorState::Unchanged);
        v.thread.status = Status::Resolved {
            by: "AI".into(),
            at: 0,
        };
        let out = threads_markdown(&[v]);
        assert!(out.contains("解決済み / AI"), "{out}");
    }
}
