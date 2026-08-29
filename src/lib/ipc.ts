import { Channel, invoke } from "@tauri-apps/api/core";

import type {
  AppTarget,
  DiffFile,
  DiffResponse,
  DiffSpec,
  Project,
  PrInfo,
  RevisionList,
  Thread,
  ThreadInput,
  ThreadView,
  ViewedState,
  WatchEvent,
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
  reorderProjects: (ids: string[]) =>
    invoke<Project[]>("reorder_projects", { ids }),

  listWorktrees: (projectId: string) =>
    invoke<WorktreeInfo[]>("list_worktrees", { projectId }),
  worktreeStatuses: (projectId: string, paths: string[]) =>
    invoke<WorktreeStatus[]>("worktree_statuses", { projectId, paths }),

  pullRequests: (projectId: string) =>
    invoke<Record<string, PrInfo>>("pull_requests", { projectId }),

  listRevisions: (worktree: string, limit: number = REVISION_LIMIT) =>
    invoke<RevisionList>("list_revisions", { worktree, limit }),

  loadDiff: (worktree: string, spec: DiffSpec, context: number) =>
    invoke<DiffResponse>("load_diff", { worktree, spec, context }),
  fileDiff: (
    worktree: string,
    spec: DiffSpec,
    path: string,
    context: number,
  ) => invoke<DiffFile | null>("file_diff", { worktree, spec, path, context }),

  readLines: (
    worktree: string,
    spec: DiffSpec,
    path: string,
    side: "old" | "new",
    from: number,
    to: number,
  ) => invoke<string[]>("read_lines", { worktree, spec, path, side, from, to }),

  readImage: (
    worktree: string,
    spec: DiffSpec,
    path: string,
    side: "old" | "new",
  ) => invoke<string | null>("read_image", { worktree, spec, path, side }),

  installedApps: () => invoke<AppTarget[]>("installed_apps"),
  openInApp: (appId: string, path: string, line: number | null) =>
    invoke<void>("open_in_app", { appId, path, line }),

  startWatch: (worktree: string, channel: Channel<WatchEvent>) =>
    invoke<number>("start_watch", { worktree, channel }),
  stopWatch: (id: number) => invoke<void>("stop_watch", { id }),

  listViewed: (revisionKey: string, current: Record<string, string>) =>
    invoke<ViewedState[]>("list_viewed", { revisionKey, current }),
  setViewed: (
    revisionKey: string,
    file: string,
    diffHash: string,
    viewedFlag: boolean,
  ) =>
    invoke<void>("set_viewed", { revisionKey, file, diffHash, viewedFlag }),
  clearViewed: (revisionKey: string) =>
    invoke<void>("clear_viewed", { revisionKey }),

  listThreads: (
    worktree: string | null,
    revisionKey: string | null,
    includeClosed = false,
  ) =>
    invoke<ThreadView[]>("list_threads", {
      worktree,
      revisionKey,
      includeClosed,
    }),
  addThread: (input: ThreadInput) => invoke<Thread>("add_thread", { input }),
  replyThread: (id: string, author: string, body: string) =>
    invoke<Thread>("reply_thread", { id, author, body }),
  resolveThread: (id: string, by: string) =>
    invoke<Thread>("resolve_thread", { id, by }),
  reopenThread: (id: string) => invoke<Thread>("reopen_thread", { id }),
  dropThread: (id: string, by: string) =>
    invoke<Thread>("drop_thread", { id, by }),
};
