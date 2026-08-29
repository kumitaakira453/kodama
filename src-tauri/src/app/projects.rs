//! プロジェクトの登録・削除。

use crate::app::state::AppState;
use crate::domain::ids;
use crate::domain::models::Project;
use crate::error::{KdError, KdResult};
use crate::infra::git::Git;
use crate::infra::paths;

pub fn list(state: &AppState) -> KdResult<Vec<Project>> {
    state.with_config(|c| c.projects.clone())
}

/// フォルダを登録する。git リポジトリでなければ拒否し、リポジトリのルートへ
/// 正規化してから保存する。サブディレクトリを選んでも同じ 1 件になる。
pub fn add(state: &AppState, path: &str) -> KdResult<Project> {
    let expanded = paths::expanduser(path);
    let canonical = expanded
        .canonicalize()
        .map_err(|e| KdError::new(format!("{} を開けません: {e}", expanded.display())))?;
    let canonical = canonical.to_string_lossy().to_string();

    let git = Git::new(&canonical);
    if !git.is_worktree() {
        return Err(KdError::new(format!(
            "{canonical} は git リポジトリではありません。"
        )));
    }
    let root = git.toplevel()?;

    // 選ばれたのが linked worktree なら、そのリポジトリのメイン worktree を登録する。
    // どの worktree を選んでも同じプロジェクトに収まる。
    let root = Git::new(&root)
        .worktrees()
        .ok()
        .and_then(|ws| ws.into_iter().find(|w| w.is_main).map(|w| w.path))
        .unwrap_or(root);

    state.update_config(|config| {
        if let Some(existing) = config.projects.iter().find(|p| p.path == root) {
            return Err(KdError::new(format!(
                "{} は「{}」として登録済みです。",
                root, existing.name
            )));
        }
        let project = Project {
            id: ids::generate(&root),
            name: basename(&root),
            path: root.clone(),
            added_at: ids::now_secs(),
        };
        config.projects.push(project.clone());
        Ok(project)
    })
}

/// 並び順を差し替える。
///
/// 受け取った id の順に並べ、渡されなかったものは末尾へ回す。画面が古い一覧を
/// 持っていても、登録済みのプロジェクトが消えない。
pub fn reorder(state: &AppState, ids: &[String]) -> KdResult<Vec<Project>> {
    state.update_config(|config| {
        let mut rest = std::mem::take(&mut config.projects);
        let mut ordered = Vec::with_capacity(rest.len());
        for id in ids {
            if let Some(at) = rest.iter().position(|p| &p.id == id) {
                ordered.push(rest.remove(at));
            }
        }
        ordered.extend(rest);
        config.projects = ordered;
        Ok(config.projects.clone())
    })
}

pub fn remove(state: &AppState, id: &str) -> KdResult<()> {
    state.update_config(|config| {
        let before = config.projects.len();
        config.projects.retain(|p| p.id != id);
        if config.projects.len() == before {
            return Err(KdError::new("対象のプロジェクトが見つかりません。"));
        }
        Ok(())
    })
}

pub fn rename(state: &AppState, id: &str, name: &str) -> KdResult<Project> {
    let name = name.trim();
    if name.is_empty() {
        return Err(KdError::new("名前を入力してください。"));
    }
    state.update_config(|config| {
        let project = config
            .projects
            .iter_mut()
            .find(|p| p.id == id)
            .ok_or_else(|| KdError::new("対象のプロジェクトが見つかりません。"))?;
        project.name = name.to_string();
        Ok(project.clone())
    })
}

/// プロジェクト ID からリポジトリのパスを引く。
pub fn resolve_path(state: &AppState, id: &str) -> KdResult<String> {
    state
        .with_config(|c| c.projects.iter().find(|p| p.id == id).map(|p| p.path.clone()))?
        .ok_or_else(|| KdError::new("対象のプロジェクトが見つかりません。"))
}

fn basename(path: &str) -> String {
    path.trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or(path)
        .to_string()
}
