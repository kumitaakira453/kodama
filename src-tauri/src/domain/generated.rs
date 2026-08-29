//! 生成ファイルの判定。
//!
//! lock ファイルやビルド生成物は、レビューで読む対象ではないのに変更行数が
//! 大きい。既定で畳んでおかないと、目的の変更まで延々スクロールすることになる。

/// ファイル名そのものが生成物を表すもの。
const NAMES: &[&str] = &[
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
    "Cargo.lock",
    "poetry.lock",
    "uv.lock",
    "Gemfile.lock",
    "composer.lock",
    "go.sum",
    "Podfile.lock",
    "flake.lock",
];

/// 拡張子。
const SUFFIXES: &[&str] = &[".lock", ".min.js", ".min.css", ".map", ".snap"];

/// この名前のディレクトリを含むパスは生成物とみなす。
const DIRS: &[&str] = &[
    "node_modules",
    "dist",
    "build",
    "vendor",
    "__snapshots__",
    ".next",
    "target",
];

/// パスだけで判定する。git の属性を引く前の安価な足切り。
pub fn looks_generated(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path);
    if NAMES.contains(&name) {
        return true;
    }
    if SUFFIXES.iter().any(|s| name.ends_with(s)) {
        return true;
    }
    path.split('/').any(|seg| DIRS.contains(&seg))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lock_ファイルを生成物とみなす() {
        assert!(looks_generated("package-lock.json"));
        assert!(looks_generated("backend/bff/uv.lock"));
        assert!(looks_generated("src-tauri/Cargo.lock"));
    }

    #[test]
    fn ビルド生成物のディレクトリを含むパスを拾う() {
        assert!(looks_generated("frontend/dist/index.js"));
        assert!(looks_generated("node_modules/react/index.js"));
        assert!(looks_generated("src/__snapshots__/a.test.tsx.snap"));
    }

    #[test]
    fn 普通のソースは生成物にしない() {
        assert!(!looks_generated("src/App.tsx"));
        assert!(!looks_generated("backend/bff/app/models.py"));
        // ディレクトリ名の一部が一致するだけでは拾わない。
        assert!(!looks_generated("src/distribution/index.ts"));
        assert!(!looks_generated("src/building/plan.md"));
    }

    #[test]
    fn 日本語のパスでも誤判定しない() {
        assert!(!looks_generated("docs/設計書.md"));
    }
}
