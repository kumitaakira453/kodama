//! アプリ全体で共有する状態。
//!
//! 設定ファイルは複数の invoke が同時に触りうるので Mutex で直列化する。
//! 読み込みは起動時の 1 回だけで、以降はメモリ上の Config が真実。

use std::sync::Mutex;

use crate::domain::settings::Config;
use crate::error::{KdError, KdResult};
use crate::infra::{paths, store};

pub struct AppState {
    config: Mutex<Config>,
}

impl AppState {
    /// 設定ファイルを読んで初期化する。壊れていても起動は止めず、既定値で始める。
    pub fn load() -> Self {
        let config = match store::read_json::<Config>(&paths::config_file()) {
            Ok(Some(c)) => c,
            Ok(None) => Config::default(),
            Err(e) => {
                log::warn!("設定を読めませんでした。既定値で起動します: {e}");
                Config::default()
            }
        };
        Self {
            config: Mutex::new(config),
        }
    }

    /// Config を読む。ロックの保持時間を短くするため、必要な分だけ複製して返す。
    pub fn with_config<T>(&self, f: impl FnOnce(&Config) -> T) -> KdResult<T> {
        let guard = self.config.lock().map_err(|_| lock_poisoned())?;
        Ok(f(&guard))
    }

    /// Config を書き換え、成功したらファイルへ保存する。保存に失敗したら
    /// メモリ上の変更も巻き戻し、UI の表示とディスクの内容が食い違わないようにする。
    pub fn update_config<T>(&self, f: impl FnOnce(&mut Config) -> KdResult<T>) -> KdResult<T> {
        let mut guard = self.config.lock().map_err(|_| lock_poisoned())?;
        let snapshot = guard.clone();
        let value = f(&mut guard)?;
        if let Err(e) = store::write_json(&paths::config_file(), &*guard) {
            *guard = snapshot;
            return Err(e);
        }
        Ok(value)
    }
}

fn lock_poisoned() -> KdError {
    KdError::new("設定へのアクセスが競合しました。アプリを再起動してください。")
}
