//! 差分の構造化表現。
//!
//! `InlineRange` と `Token` のオフセットはすべて **UTF-16 コードユニット**単位で
//! 表す。JS の文字列インデックスにそのまま使えるため、TS 側に変換ロジックが
//! 生まれない。バイト単位のままだと日本語や絵文字を含む行で位置がずれる。

use serde::Serialize;

use crate::domain::spec::ResolvedSpec;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DiffFileStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    Untracked,
    TypeChanged,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DiffLineKind {
    Context,
    Add,
    Del,
}

/// 行内で変化した範囲。ここに含まれない範囲は反対側の行と一致している。
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InlineRange {
    pub start: u32,
    pub len: u32,
}

/// 構文の種別。色そのものではなく種別を返し、テーマは CSS の責務にする。
/// ダーク/ライトの切替で Rust を呼び直さずに済む。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TokenKind {
    Keyword,
    String,
    Comment,
    Number,
    Function,
    Type,
    Variable,
    Constant,
    Operator,
    Punctuation,
    Tag,
    Attribute,
    Plain,
}

/// 構文トークン 1 個。隣接する同種トークンはマージ済み。
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Token {
    pub start: u32,
    pub len: u32,
    pub kind: TokenKind,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub kind: DiffLineKind,
    pub old_number: Option<u32>,
    pub new_number: Option<u32>,
    /// 先頭の `+` `-` 空白 を除いた本文。
    pub content: String,
    /// `\ No newline at end of file` が続く行。
    pub no_newline: bool,
    pub inline: Option<Vec<InlineRange>>,
    pub tokens: Option<Vec<Token>>,
}

/// split 表示の 1 行。値は同一 hunk の `lines` へのインデックス。
///
/// ペアリングを Rust 側で確定させるのは、行内差分が「どの行とどの行を比較した
/// 結果か」と不可分だから。フロントで再計算すると食い違う余地が生まれる。
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffRow {
    pub left: Option<usize>,
    pub right: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    /// `@@` の後ろに付く関数名などの文脈。
    pub header: String,
    /// unified 表示はこの順に描く。
    pub lines: Vec<DiffLine>,
    /// split 表示はこの順に描く。
    pub rows: Vec<DiffRow>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffFile {
    /// 変更後のパス。削除なら変更前のパス。
    pub path: String,
    /// rename / copy 元。それ以外は None。
    pub old_path: Option<String>,
    pub status: DiffFileStatus,
    pub additions: i64,
    pub deletions: i64,
    pub binary: bool,
    /// 自動折りたたみの対象か。
    pub generated: bool,
    /// syntect が選んだ構文の名前。判別できなければ None。
    pub syntax: Option<String>,
    /// hunks を省いた場合に true。ファイル選択時に取り直す。
    pub truncated: bool,
    /// 閲覧済みマークの陳腐化判定に使う、この差分内容のハッシュ。
    pub diff_hash: String,
    pub hunks: Vec<DiffHunk>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffResponse {
    pub resolved: ResolvedSpec,
    pub files: Vec<DiffFile>,
    /// 変更量が大きく hunks を省いた場合に true。
    pub truncated: bool,
}

/// 文字列の先頭から `byte` バイト目までが UTF-16 で何コードユニットになるか。
pub fn utf16_len(s: &str) -> u32 {
    s.encode_utf16().count() as u32
}
