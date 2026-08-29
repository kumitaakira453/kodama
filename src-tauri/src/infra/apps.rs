//! 外部アプリの検出と起動。
//!
//! `opener` プラグインの `openPath` は内部で `open -a` を detached 起動するため
//! 終了コードが取れない。アプリ未インストール時に無反応になり、原因も分からない。
//! 自前で `status()` を取り、失敗を呼び出し側へ返す。
//!
//! 押しても無反応になりうる項目はそもそもメニューに出さない。実際に起動できる
//! ものだけを列挙する。

use std::path::PathBuf;
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
    /// `/Applications` に置かれるアプリケーションバンドルの名前。
    bundle: &'static str,
}

const EDITORS: &[Editor] = &[
    Editor {
        id: "vscode",
        label: "VS Code",
        command: "code",
        args: &["-g", "%file:%line"],
        bundle: "Visual Studio Code",
    },
    Editor {
        id: "zed",
        label: "Zed",
        command: "zed",
        args: &["%file:%line"],
        bundle: "Zed",
    },
];

/// 起動の手段。どちらで開けるかで行番号を渡せるかが変わる。
enum Launch {
    /// PATH 上の実行ファイル。行番号を渡せる。
    Cli(String),
    /// アプリケーションバンドル。`open` は引数をアプリへ届けるだけなので、
    /// 位置の指定はできない。
    Bundle,
}

/// いま起動できるものだけを返す。
pub fn installed() -> Vec<AppTarget> {
    let mut out: Vec<AppTarget> = EDITORS
        .iter()
        .filter_map(|editor| {
            let launch = launcher(editor)?;
            Some(AppTarget {
                id: editor.id.to_string(),
                label: editor.label.to_string(),
                supports_line: matches!(launch, Launch::Cli(_)),
            })
        })
        .collect();

    // Finder は macOS に必ずある。
    out.push(AppTarget {
        id: "finder".to_string(),
        label: "Finder で表示".to_string(),
        supports_line: false,
    });
    out
}

pub fn open_in(app_id: &str, path: &str, line: Option<u32>) -> KdResult<()> {
    if app_id == "finder" {
        return run(
            "/usr/bin/open",
            &["-R".to_string(), "--".to_string(), path.to_string()],
        );
    }

    let editor = EDITORS
        .iter()
        .find(|e| e.id == app_id)
        .ok_or_else(|| KdError::new(format!("{app_id} は扱えません。")))?;

    match launcher(editor) {
        Some(Launch::Cli(bin)) => {
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
        Some(Launch::Bundle) => run(
            "/usr/bin/open",
            &[
                "-a".to_string(),
                editor.bundle.to_string(),
                "--".to_string(),
                path.to_string(),
            ],
        ),
        None => Err(KdError::new(format!(
            "{} が見つかりません。インストールされているか確認してください。",
            editor.label
        ))),
    }
}

/// CLI があれば行番号まで渡せるので優先する。無ければバンドルを探す。
///
/// バンドルも見るのは、GUI から起動したアプリの PATH がログインシェルより
/// 狭く、`code` や `zed` のシムが入っていても見えない場合があるため。
fn launcher(editor: &Editor) -> Option<Launch> {
    if let Some(bin) = which(editor.command) {
        return Some(Launch::Cli(bin));
    }
    bundle_exists(editor.bundle).then_some(Launch::Bundle)
}

fn bundle_exists(name: &str) -> bool {
    let mut roots = vec![PathBuf::from("/Applications")];
    if let Some(home) = std::env::var_os("HOME") {
        roots.push(PathBuf::from(home).join("Applications"));
    }
    roots
        .iter()
        .any(|root| root.join(format!("{name}.app")).exists())
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
