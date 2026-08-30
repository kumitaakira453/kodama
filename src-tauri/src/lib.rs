mod app;
mod cli;
mod commands;
mod domain;
mod error;
mod infra;
mod review;

use app::state::AppState;

/// Finder から起動するとログインシェルの PATH を継承しないため、`code` や `zed`、
/// Homebrew 配下の git が見つからない。ログインシェルから PATH を取り込み、
/// 一般的な場所も補う。
fn fix_path() {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    if let Ok(out) = std::process::Command::new(&shell)
        .args(["-lic", "echo $PATH"])
        .output()
    {
        if out.status.success() {
            if let Some(line) = String::from_utf8_lossy(&out.stdout).lines().last() {
                let p = line.trim();
                if !p.is_empty() {
                    std::env::set_var("PATH", p);
                }
            }
        }
    }
    let mut path = std::env::var("PATH").unwrap_or_default();
    for dir in ["/opt/homebrew/bin", "/usr/local/bin"] {
        if std::path::Path::new(dir).exists() && !path.split(':').any(|x| x == dir) {
            path = format!("{dir}:{path}");
        }
    }
    std::env::set_var("PATH", path);
}

/// 第 1 引数が `review` のときは CLI として動き、Tauri を初期化せずに終了する。
///
/// `args_os` を使う。`args` は UTF-8 でない引数で panic する。
pub fn run_cli_if_requested() -> bool {
    let first = std::env::args_os().nth(1);
    if first.as_ref().and_then(|a| a.to_str()) != Some("review") {
        return false;
    }
    fix_path();
    if let Err(e) = cli::run() {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
    true
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    fix_path();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::load())
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::project::list_projects,
            commands::project::add_project,
            commands::project::remove_project,
            commands::project::rename_project,
            commands::project::reorder_projects,
            commands::worktree::list_worktrees,
            commands::worktree::worktree_statuses,
            commands::worktree::pull_requests,
            commands::revision::list_revisions,
            commands::diff::load_diff,
            commands::diff::file_diff,
            commands::diff::read_lines,
            commands::diff::read_image,
            commands::review::list_threads,
            commands::review::add_thread,
            commands::review::reply_thread,
            commands::review::edit_comment,
            commands::review::delete_comment,
            commands::review::resolve_thread,
            commands::review::reopen_thread,
            commands::review::drop_thread,
            commands::viewed::list_viewed,
            commands::viewed::set_viewed,
            commands::viewed::clear_viewed,
            commands::external::installed_apps,
            commands::external::open_in_app,
            commands::watch::start_watch,
            commands::watch::stop_watch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
