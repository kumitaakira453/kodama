mod app;
mod commands;
mod domain;
mod error;
mod infra;

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
            commands::worktree::list_worktrees,
            commands::worktree::worktree_statuses,
            commands::revision::list_revisions,
            commands::diff::load_diff,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
