//! syntect のスコープを描画に必要な粒度まで畳む対応表。
//!
//! 生スコープ（`source.rust meta.function.rust keyword.other.fn.rust`）をそのまま
//! 送るとペイロードが肥大するうえ、フロントに構文体系の知識が漏れる。13 種の
//! `TokenKind` に落とし、色の割り当ては CSS の責務にする。

use crate::domain::diff::TokenKind;

/// スコープ接頭辞と種別の対応。**上から順に照合するので、具体的なものを先に置く。**
/// 例えば `constant.numeric` は `constant` より前になければ数値が定数に飲まれる。
pub const SCOPE_MAP: &[(&str, TokenKind)] = &[
    ("comment", TokenKind::Comment),
    // クォートは `punctuation.definition.string` になる。文字列本体と色が割れると
    // 引用符だけ浮くので、先に文字列として拾う。
    ("punctuation.definition.string", TokenKind::String),
    ("string", TokenKind::String),
    ("constant.numeric", TokenKind::Number),
    ("constant.character", TokenKind::String),
    ("constant", TokenKind::Constant),
    ("keyword.operator", TokenKind::Operator),
    ("keyword", TokenKind::Keyword),
    // `storage.type` は C の `int` のような型名だけでなく、Rust の `let` や `fn`、
    // JS の `const` といった宣言キーワードにも付く。宣言を型として色付けすると
    // 読み違えるので、まとめてキーワード扱いにする。実際の型名は
    // `entity.name.type` / `support.type` で拾える。
    ("storage", TokenKind::Keyword),
    ("entity.name.function", TokenKind::Function),
    ("entity.name.tag", TokenKind::Tag),
    ("entity.name.type", TokenKind::Type),
    ("entity.name.class", TokenKind::Type),
    ("entity.name.namespace", TokenKind::Type),
    ("entity.other.attribute-name", TokenKind::Attribute),
    ("entity.other.inherited-class", TokenKind::Type),
    ("support.function", TokenKind::Function),
    ("support.class", TokenKind::Type),
    ("support.type", TokenKind::Type),
    ("support.constant", TokenKind::Constant),
    ("variable.function", TokenKind::Function),
    ("variable.parameter", TokenKind::Variable),
    ("variable", TokenKind::Variable),
    ("punctuation", TokenKind::Punctuation),
];
