//! ID の生成。
//!
//! epoch ミリ秒・プロセス内カウンタ・種文字列のハッシュを繋ぐ。同一ミリ秒に
//! 複数生成してもカウンタで分かれるので、uuid クレートを入れずに一意にできる。

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use sha2::{Digest, Sha256};

static COUNTER: AtomicU64 = AtomicU64::new(0);

pub fn generate(seed: &str) -> String {
    let millis = now_millis();
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{millis:x}-{n:x}-{}", &hash(seed)[..8])
}

pub fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn now_secs() -> i64 {
    now_millis() / 1000
}

/// 内容のハッシュ（hex）。閲覧済みマークの陳腐化判定にも使う。
pub fn hash(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// 差分内容のハッシュ。先頭 16 バイト分だけ使えば衝突は実用上起きない。
pub fn diff_hash(input: &str) -> String {
    hash(input)[..32].to_string()
}
