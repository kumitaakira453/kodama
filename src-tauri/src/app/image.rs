//! 画像ファイルの読み出し。
//!
//! 差分の本文が読めない画像は、変更前後を並べて見せるほかない。blob を
//! data URL に直して返し、フロントはそのまま `<img>` に載せる。

use crate::app::diffload;
use crate::domain::spec::{BlobRef, DiffSpec};
use crate::error::KdResult;
use crate::infra::git::Git;

/// data URL に載せる上限。これを超えるものは開かない。
///
/// data URL は文字列として webview へ渡るので、大きいほど IPC と描画が重い。
/// 差分の確認に要る解像度ならこの範囲に収まる。
const MAX_BYTES: usize = 8 * 1024 * 1024;

/// 画像として扱う拡張子と、その MIME。
const KINDS: &[(&str, &str)] = &[
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("gif", "image/gif"),
    ("webp", "image/webp"),
    ("avif", "image/avif"),
    ("bmp", "image/bmp"),
    ("ico", "image/x-icon"),
    ("svg", "image/svg+xml"),
];

/// パスから MIME を引く。画像でなければ None。
pub fn mime_of(path: &str) -> Option<&'static str> {
    let ext = path.rsplit('.').next()?.to_ascii_lowercase();
    KINDS
        .iter()
        .find(|(name, _)| *name == ext)
        .map(|(_, mime)| *mime)
}

/// 変更前 / 変更後の画像を data URL で読む。
///
/// その側に存在しない（追加・削除）場合は None。読めないときも None にして、
/// 片側だけでも見せられるようにする。
pub fn read(
    worktree: &str,
    spec: &DiffSpec,
    path: &str,
    side: diffload::BlobSide,
) -> KdResult<Option<String>> {
    let Some(mime) = mime_of(path) else {
        return Ok(None);
    };
    let resolved = diffload::resolve(worktree, spec)?;
    let blob = match side {
        diffload::BlobSide::Old => &resolved.left,
        diffload::BlobSide::New => &resolved.right,
    };
    Ok(read_blob(worktree, blob, path)
        .filter(|bytes| !bytes.is_empty() && bytes.len() <= MAX_BYTES)
        .map(|bytes| format!("data:{mime};base64,{}", base64(&bytes))))
}

fn read_blob(worktree: &str, blob: &BlobRef, path: &str) -> Option<Vec<u8>> {
    Git::new(worktree).read_blob_bytes(worktree, blob, path)
}

const ALPHABET: &[u8; 64] =
    b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// 標準の base64。3 バイトを 4 文字に詰め、余りは `=` で埋める。
fn base64(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [
            chunk[0],
            chunk.get(1).copied().unwrap_or(0),
            chunk.get(2).copied().unwrap_or(0),
        ];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(ALPHABET[(n >> 18) as usize & 63] as char);
        out.push(ALPHABET[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            ALPHABET[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            ALPHABET[n as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 余りの無い長さをそのまま詰める() {
        assert_eq!(base64(b"abc"), "YWJj");
    }

    #[test]
    fn 余りは等号で埋める() {
        assert_eq!(base64(b"a"), "YQ==");
        assert_eq!(base64(b"ab"), "YWI=");
    }

    #[test]
    fn 二進データでも壊れない() {
        assert_eq!(base64(&[0x00, 0xff, 0x80]), "AP+A");
    }

    #[test]
    fn 画像の拡張子だけを画像として扱う() {
        assert_eq!(mime_of("a/b/icon.PNG"), Some("image/png"));
        assert_eq!(mime_of("a/b/icon.svg"), Some("image/svg+xml"));
        assert_eq!(mime_of("a/b/main.rs"), None);
        assert_eq!(mime_of("Makefile"), None);
    }
}
