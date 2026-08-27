//! subprocess 実行ヘルパ。

use std::process::Command;

use crate::error::{KdError, KdResult};

/// コマンドを実行し stdout を返す。check=true で非ゼロ終了はエラーにする。
///
/// `git diff --no-index` のように「差分あり」を exit 1 で表すコマンドがあるため、
/// 終了コードを見るかどうかは呼び出し側が選ぶ。
pub fn capture(cmd: &[&str], cwd: Option<&str>, check: bool) -> KdResult<String> {
    let out = build(cmd, cwd)
        .output()
        .map_err(|e| KdError::new(format!("{} の起動に失敗しました: {e}", cmd[0])))?;
    if check && !out.status.success() {
        return Err(KdError::new(format!(
            "$ {}\n{}",
            cmd.join(" "),
            failure_detail(&out.stderr, &out.stdout)
        )));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

/// stdout をバイト列のまま返す。blob の読み出しなど、UTF-8 とは限らない出力に使う。
pub fn capture_bytes(cmd: &[&str], cwd: Option<&str>, check: bool) -> KdResult<Vec<u8>> {
    let out = build(cmd, cwd)
        .output()
        .map_err(|e| KdError::new(format!("{} の起動に失敗しました: {e}", cmd[0])))?;
    if check && !out.status.success() {
        return Err(KdError::new(format!(
            "$ {}\n{}",
            cmd.join(" "),
            failure_detail(&out.stderr, &out.stdout)
        )));
    }
    Ok(out.stdout)
}

fn build(cmd: &[&str], cwd: Option<&str>) -> Command {
    let mut c = Command::new(cmd[0]);
    c.args(&cmd[1..]);
    if let Some(dir) = cwd {
        c.current_dir(dir);
    }
    c
}

fn failure_detail(stderr: &[u8], stdout: &[u8]) -> String {
    let err = String::from_utf8_lossy(stderr);
    if !err.trim().is_empty() {
        return err.trim().to_string();
    }
    String::from_utf8_lossy(stdout).trim().to_string()
}
