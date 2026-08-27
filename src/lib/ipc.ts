import { invoke } from "@tauri-apps/api/core";

import type {
  Project,
  RevisionList,
  WorktreeInfo,
  WorktreeStatus,
} from "./types";

/** コミット一覧の取得件数。範囲選択で遡る現実的な上限。 */
const REVISION_LIMIT = 200;

/** Rust コマンドの呼び出し口。引数名は Rust 側のシグネチャに合わせる。 */
export const api = {
  listProjects: () => invoke<Project[]>("list_projects"),
  addProject: (path: string) => invoke<Project>("add_project", { path }),
  removeProject: (id: string) => invoke<void>("remove_project", { id }),
  renameProject: (id: string, name: string) =>
    invoke<Project>("rename_project", { id, name }),

  listWorktrees: (projectId: string) =>
    invoke<WorktreeInfo[]>("list_worktrees", { projectId }),
  worktreeStatuses: (projectId: string, paths: string[]) =>
    invoke<WorktreeStatus[]>("worktree_statuses", { projectId, paths }),

  listRevisions: (worktree: string, limit: number = REVISION_LIMIT) =>
    invoke<RevisionList>("list_revisions", { worktree, limit }),
};
