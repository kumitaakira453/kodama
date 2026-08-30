//! syntect による構文解析。
//!
//! `ParseState` は行をまたいで状態を持つ逐次パーサなので、ファイルの 1 行目から
//! 順に食わせる。こうしないと、ハンクより上で開いた `/*` や `"""` が見えず、
//! その先の色が全部崩れる。行単位でパーサを呼び直す方式は採らない。

use std::sync::LazyLock;

use syntect::parsing::{ParseState, Scope, ScopeStack, SyntaxReference, SyntaxSet};
use syntect::util::LinesWithEndings;

use crate::domain::diff::{Token, TokenKind};
use crate::domain::scope::SCOPE_MAP;

/// バンドル済みの構文定義。読み込みに 100ms 前後かかるので 1 度だけ作る。
///
/// syntect の既定セットは Sublime の標準パックそのままで、TypeScript も JSX も
/// 入っていない。TS/TSX のリポジトリではどの行にも色が付かない。two-face が
/// 束ねている拡張セット（bat と同じ出所）に差し替えて、実際に読むファイルを
/// 覆う。既定セットは含まれているので、これまで色が付いていた言語は変わらない。
static SYNTAXES: LazyLock<SyntaxSet> = LazyLock::new(two_face::syntax::extra_newlines);

/// 対応表を `Scope` に変換したもの。文字列比較より前置判定の方が速い。
static MATCHERS: LazyLock<Vec<(Scope, TokenKind)>> = LazyLock::new(|| {
    SCOPE_MAP
        .iter()
        .filter_map(|(name, kind)| Scope::new(name).ok().map(|s| (s, *kind)))
        .collect()
});

/// これを超えるファイルはハイライトしない。描画より先に解析で時間を食う。
const MAX_LINES: usize = 20_000;
const MAX_BYTES: usize = 2 * 1024 * 1024;

pub struct Highlighted {
    /// 構文の名前。UI に「どの言語として解釈したか」を出すために持つ。
    pub syntax: String,
    /// 0 始まりの行索引。`lines[n]` が n+1 行目。
    pub lines: Vec<Vec<Token>>,
}

/// ファイル全体を先頭から解析し、行ごとのトークン列にする。
///
/// 構文を判別できない、または上限を超える場合は None。呼び出し側はプレーン描画に
/// フォールバックする。
/// どの構文定義にも登録されていない拡張子を、近い定義へ寄せる。
///
/// `.jsx` はどのパックにも紐づいていないが、JSX は TypeScriptReact がそのまま
/// 読める。拡張子が登録されていないだけで色を諦めると、React のリポジトリに
/// 穴が空く。
const ALIASES: &[(&str, &str)] = &[
    ("jsx", "TypeScriptReact"),
    ("mjs", "JavaScript"),
    ("cjs", "JavaScript"),
];

fn by_alias<'a>(syntaxes: &'a SyntaxSet, path: &str) -> Option<&'a SyntaxReference> {
    let ext = path.rsplit_once('.')?.1;
    let (_, name) = ALIASES.iter().find(|(e, _)| *e == ext)?;
    syntaxes.find_syntax_by_name(name)
}

pub fn highlight_file(path: &str, text: &str) -> Option<Highlighted> {
    if text.len() > MAX_BYTES {
        return None;
    }
    let syntaxes = &*SYNTAXES;
    let syntax = syntaxes
        .find_syntax_for_file(path)
        .ok()
        .flatten()
        .or_else(|| by_alias(syntaxes, path))
        .or_else(|| syntaxes.find_syntax_by_first_line(text.lines().next().unwrap_or("")))?;
    if syntax.name == "Plain Text" {
        return None;
    }

    let mut state = ParseState::new(syntax);
    let mut stack = ScopeStack::new();
    let mut lines: Vec<Vec<Token>> = Vec::new();

    for line in LinesWithEndings::from(text) {
        if lines.len() >= MAX_LINES {
            return None;
        }
        // 解析に失敗した行は色を諦め、状態は保ったまま次へ進む。ファイル全体を
        // 捨てるより、その行だけプレーンになる方が害が小さい。
        let ops = match state.parse_line(line, syntaxes) {
            Ok(ops) => ops,
            Err(_) => {
                lines.push(Vec::new());
                continue;
            }
        };
        lines.push(tokens_for_line(line, &ops, &mut stack));
    }

    Some(Highlighted {
        syntax: syntax.name.clone(),
        lines,
    })
}

fn tokens_for_line(
    line: &str,
    ops: &[(usize, syntect::parsing::ScopeStackOp)],
    stack: &mut ScopeStack,
) -> Vec<Token> {
    // 改行はトークンに含めない。行の本文と長さを一致させる。
    let body_len = line.trim_end_matches(['\n', '\r']).len();
    let mut tokens: Vec<Token> = Vec::new();
    let mut last = 0usize;
    let mut kind = kind_of(stack);

    for (offset, op) in ops {
        let offset = (*offset).min(body_len);
        if offset > last {
            push(&mut tokens, line, last, offset, kind);
            last = offset;
        }
        if stack.apply(op).is_err() {
            // スタックが壊れたらこの行の残りは既定色にする。
            break;
        }
        kind = kind_of(stack);
    }
    if last < body_len {
        push(&mut tokens, line, last, body_len, kind);
    }

    tokens
}

/// バイト範囲を UTF-16 コードユニット範囲に直して積む。隣接する同種はまとめる。
fn push(tokens: &mut Vec<Token>, line: &str, start: usize, end: usize, kind: TokenKind) {
    if kind == TokenKind::Plain && tokens.is_empty() {
        // 先頭の未分類はそのまま既定色でよいので、トークンを作らない。
        return;
    }
    let Some(text) = line.get(start..end) else {
        return;
    };
    let len = text.encode_utf16().count() as u32;
    if len == 0 {
        return;
    }
    if let Some(last) = tokens.last_mut() {
        if last.kind == kind && last.start + last.len == utf16_upto(line, start) {
            last.len += len;
            return;
        }
    }
    tokens.push(Token {
        start: utf16_upto(line, start),
        len,
        kind,
    });
}

fn utf16_upto(line: &str, byte: usize) -> u32 {
    line.get(..byte)
        .map(|s| s.encode_utf16().count() as u32)
        .unwrap_or(0)
}

/// スタックの上から順に対応表と照合し、最初に当たった種別を返す。
fn kind_of(stack: &ScopeStack) -> TokenKind {
    for scope in stack.scopes.iter().rev() {
        for (matcher, kind) in MATCHERS.iter() {
            if matcher.is_prefix_of(*scope) {
                return *kind;
            }
        }
    }
    TokenKind::Plain
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kinds(path: &str, text: &str, line_index: usize) -> Vec<(String, TokenKind)> {
        let h = highlight_file(path, text).expect("ハイライトできる");
        let line = text.lines().nth(line_index).unwrap_or("");
        let units: Vec<u16> = line.encode_utf16().collect();
        h.lines[line_index]
            .iter()
            .map(|t| {
                let s = String::from_utf16(
                    &units[t.start as usize..(t.start + t.len) as usize],
                )
                .unwrap_or_default();
                (s, t.kind)
            })
            .collect()
    }

    #[test]
    fn キーワードと文字列を区別する() {
        let out = kinds("a.rs", "let s = \"hi\";\n", 0);
        assert!(
            out.iter()
                .any(|(s, k)| s.trim() == "let" && *k == TokenKind::Keyword),
            "let がキーワード: {out:?}"
        );
        assert!(
            out.iter()
                .any(|(s, k)| s.contains("hi") && *k == TokenKind::String),
            "文字列リテラル: {out:?}"
        );
    }

    #[test]
    fn 行をまたぐブロックコメントが後続行でも色を保つ() {
        // 2 行目はコメントの中。行単位で解析するとここが素の色になってしまう。
        let text = "/* start\nstill comment\n*/ let x = 1;\n";
        let out = kinds("a.rs", text, 1);
        assert!(
            out.iter().all(|(_, k)| *k == TokenKind::Comment),
            "2 行目全体がコメント: {out:?}"
        );
    }

    #[test]
    fn 行をまたぐ文字列リテラルが後続行でも色を保つ() {
        let text = "x = \"\"\"\nstill string\n\"\"\"\n";
        let out = kinds("a.py", text, 1);
        assert!(
            out.iter().all(|(_, k)| *k == TokenKind::String),
            "2 行目全体が文字列: {out:?}"
        );
    }

    #[test]
    fn 日本語を含む行でも範囲がずれない() {
        let text = "// 日本語のコメント\nlet a = 1;\n";
        let h = highlight_file("a.rs", text).expect("ハイライトできる");
        let line = "// 日本語のコメント";
        let total: u32 = h.lines[0].iter().map(|t| t.len).sum();
        assert_eq!(total as usize, line.encode_utf16().count());
    }

    #[test]
    fn 未知の拡張子では諦める() {
        assert!(highlight_file("a.unknownext", "hello\n").is_none());
    }

    /// 既定の構文セットには TypeScript も JSX も無く、TS のリポジトリでは
    /// 1 行も色が付かなかった。日常的に読む拡張子を並べて取りこぼしを防ぐ。
    #[test]
    fn 日常的に読む拡張子を覆う() {
        for (path, text) in [
            ("a.ts", "const x: number = 1;\n"),
            ("a.tsx", "const A = () => <div />;\n"),
            ("a.jsx", "const A = () => <div />;\n"),
            ("a.vue", "<template><div /></template>\n"),
            ("a.svelte", "<script>let a = 1;</script>\n"),
            ("a.toml", "[package]\nname = \"a\"\n"),
            ("a.kt", "fun main() {}\n"),
            ("a.swift", "let x = 1\n"),
            ("a.dart", "void main() {}\n"),
            ("a.tf", "resource \"a\" \"b\" {}\n"),
            ("a.zig", "const x = 1;\n"),
            ("Dockerfile", "FROM alpine\n"),
            ("a.graphql", "query { a }\n"),
            ("a.proto", "message A {}\n"),
        ] {
            assert!(highlight_file(path, text).is_some(), "色が付かない: {path}");
        }
    }
}
