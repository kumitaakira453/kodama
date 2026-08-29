//! XDG に沿った設定・データ・状態ディレクトリの解決。
//!
//! 設定は手で編集する対象、データはユーザーが書いた成果物（コメント）、
//! 状態は差分から再生成できる派生情報（閲覧済みマーク）として置き場所を分ける。

use std::path::PathBuf;

const APP: &str = "kodama";

/// `~/.config/kodama`
pub fn config_dir() -> PathBuf {
    xdg_dir("XDG_CONFIG_HOME", ".config")
}

/// `~/.local/share/kodama`
pub fn data_dir() -> PathBuf {
    xdg_dir("XDG_DATA_HOME", ".local/share")
}

/// `~/.local/state/kodama`
pub fn state_dir() -> PathBuf {
    xdg_dir("XDG_STATE_HOME", ".local/state")
}

pub fn config_file() -> PathBuf {
    config_dir().join("config.json")
}

fn xdg_dir(env_key: &str, fallback: &str) -> PathBuf {
    match std::env::var(env_key) {
        Ok(v) if !v.trim().is_empty() => PathBuf::from(v).join(APP),
        _ => home().join(fallback).join(APP),
    }
}

fn home() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/"))
}

/// 先頭の `~` をホームディレクトリに展開する。
pub fn expanduser(path: &str) -> PathBuf {
    if path == "~" {
        return home();
    }
    match path.strip_prefix("~/") {
        Some(rest) => home().join(rest),
        None => PathBuf::from(path),
    }
}
