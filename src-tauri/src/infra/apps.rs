//! 外部アプリの検出と起動。
//!
//! `opener` プラグインの `openPath` は内部で `open -a` を detached 起動するため
//! 終了コードが取れない。アプリ未インストール時に無反応になり、原因も分からない。
//! 自前で `status()` を取り、失敗を呼び出し側へ返す。
//!
//! 押しても無反応になりうる項目はそもそもメニューに出さない。実際に起動できる
//! ものだけを列挙する。

use std::process::Command;

use serde::Serialize;

use crate::error::{KdError, KdResult};

/// 起動できるアプリ。フロントはこの配列をそのまま並べるだけでよい。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppTarget {
    pub id: String,
    pub label: String,
    /// 行番号を指定して開けるか。UI の文言に使う。
    pub supports_line: bool,
}

struct Editor {
    id: &'static str,
    label: &'static str,
    /// PATH 上の実行ファイル名。
    command: &'static str,
    /// `%file` と `%line` を置換して渡す引数。
    args: &'static [&'static str],
}

const EDITORS: &[Editor] = &[
    Editor {
        id: "vscode",
        label: "VS Code",
        command: "code",
        args: &["-g", "%file:%line"],
    },
    Editor {
        id: "cursor",
        label: "Cursor",
        command: "cursor",
        args: &["-g", "%file:%line"],
    },
    Editor {
        id: "zed",
        label: "Zed",
        command: "zed",
        args: &["%file:%line"],
    },
    Editor {
        id: "sublime",
        label: "Sublime Text",
        command: "subl",
        args: &["%file:%line"],
    },
    Editor {
        id: "idea",
        label: "IntelliJ IDEA",
        command: "idea",
        args: &["--line", "%line", "%file"],
    },
];

/// いま起動できるものだけを返す。
pub fn installed() -> Vec<AppTarget> {
    let mut out: Vec<AppTarget> = EDITORS
        .iter()
        .filter(|e| which(e.command).is_some())
        .map(|e| AppTarget {
            id: e.id.to_string(),
            label: e.label.to_string(),
            supports_line: true,
        })
        .collect();

    // Finder とターミナルは macOS に必ずある。
    out.push(AppTarget {
        id: "finder".to_string(),
        label: "Finder で表示".to_string(),
        supports_line: false,
    });
    out.push(AppTarget {
        id: "terminal".to_string(),
        label: "ターミナルで開く".to_string(),
        supports_line: false,
    });
    out
}

pub fn open_in(app_id: &str, path: &str, line: Option<u32>) -> KdResult<()> {
    match app_id {
        "finder" => run("/usr/bin/open", &["-R".to_string(), path.to_string()]),
        "terminal" => run(
            "/usr/bin/open",
            &["-a".to_string(), "Terminal".to_string(), path.to_string()],
        ),
        _ => {
            let editor = EDITORS
                .iter()
                .find(|e| e.id == app_id)
                .ok_or_else(|| KdError::new(format!("{app_id} は扱えません。")))?;
            let bin = which(editor.command).ok_or_else(|| {
                KdError::new(format!(
                    "{} が見つかりません。コマンド `{}` を PATH に通してください。",
                    editor.label, editor.command
                ))
            })?;
            let args: Vec<String> = editor
                .args
                .iter()
                .map(|a| {
                    a.replace("%file", path)
                        .replace("%line", &line.unwrap_or(1).to_string())
                })
                .collect();
            run(&bin, &args)
        }
    }
}

fn run(program: &str, args: &[String]) -> KdResult<()> {
    let status = Command::new(program)
        .args(args)
        .status()
        .map_err(|e| KdError::new(format!("{program} を起動できませんでした: {e}")))?;
    if status.success() {
        return Ok(());
    }
    Err(KdError::new(format!(
        "{program} の起動に失敗しました（終了コード {}）。",
        status.code().unwrap_or(-1)
    )))
}

/// PATH 上の実行ファイルを探す。`fix_path()` を先に呼んでおくこと。
fn which(command: &str) -> Option<String> {
    let path = std::env::var("PATH").ok()?;
    for dir in path.split(':') {
        if dir.is_empty() {
            continue;
        }
        let candidate = std::path::Path::new(dir).join(command);
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    None
}
