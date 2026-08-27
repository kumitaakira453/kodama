//! 設定ファイルの中身。`~/.config/kodama/config.json` に入る。

use serde::{Deserialize, Serialize};

use crate::domain::models::Project;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ViewMode {
    Split,
    Unified,
}

/// 外部アプリの起動方法。行番号を渡せるかがここで決まる。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LaunchKind {
    /// PATH 上の実行ファイルを直接起動する。行番号指定が使える。
    Cli,
    /// `open -a <名前>` で起動する。行番号は渡せない。
    MacApp,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorSpec {
    pub id: String,
    pub label: String,
    pub kind: LaunchKind,
    /// Cli なら実行ファイル名、MacApp ならアプリ名。
    pub command: String,
    /// `%file` と `%line` を置換して渡す引数。
    pub args_template: Vec<String>,
}

/// フロントに返す「今この環境で起動できるアプリ」。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppTarget {
    pub id: String,
    pub label: String,
    /// 行番号を指定して開けるか。UI の文言に使う。
    pub supports_line: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub view_mode: ViewMode,
    pub context_lines: u32,
    pub word_diff: bool,
    pub syntax_highlight: bool,
    pub auto_collapse_generated: bool,
    /// 生成ファイル扱いにする glob。既定パターンに追加される。
    pub generated_patterns: Vec<String>,
    /// 起動候補。空なら既定の一覧を使う。
    pub editors: Vec<EditorSpec>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            view_mode: ViewMode::Split,
            context_lines: 3,
            word_diff: true,
            syntax_highlight: true,
            auto_collapse_generated: true,
            generated_patterns: Vec::new(),
            editors: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[serde(default = "config_version")]
    pub version: u32,
    #[serde(default)]
    pub projects: Vec<Project>,
    #[serde(default)]
    pub settings: Settings,
}

fn config_version() -> u32 {
    1
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: config_version(),
            projects: Vec::new(),
            settings: Settings::default(),
        }
    }
}
