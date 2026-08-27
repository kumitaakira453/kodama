import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

import type { CommitSelection } from "../lib/revisions";
import type {
  Project,
  RevisionList,
  ViewMode,
  WorktreeInfo,
  WorktreeStatus,
} from "../lib/types";

/** 初回描画のちらつきを防ぐため、localStorage を同期的に読む。 */
const sync = { getOnInit: true } as const;

export type Theme = "dark" | "light" | "system";
export type MotionPref = "auto" | "reduced";

// ---- 見た目の好み。壊れても再設定で済むので localStorage に置く ----

export const themeAtom = atomWithStorage<Theme>(
  "kodama.theme",
  "system",
  undefined,
  sync,
);
export const motionAtom = atomWithStorage<MotionPref>(
  "kodama.motion",
  "auto",
  undefined,
  sync,
);
export const viewModeAtom = atomWithStorage<ViewMode>(
  "kodama.viewMode",
  "split",
  undefined,
  sync,
);
export const wordDiffAtom = atomWithStorage<boolean>(
  "kodama.wordDiff",
  true,
  undefined,
  sync,
);
export const wrapLinesAtom = atomWithStorage<boolean>(
  "kodama.wrapLines",
  false,
  undefined,
  sync,
);
export const contextLinesAtom = atomWithStorage<number>(
  "kodama.contextLines",
  3,
  undefined,
  sync,
);
export const hideViewedAtom = atomWithStorage<boolean>(
  "kodama.hideViewed",
  false,
  undefined,
  sync,
);
export const treeWidthAtom = atomWithStorage<number>(
  "kodama.treeWidth",
  288,
  undefined,
  sync,
);
export const filesWidthAtom = atomWithStorage<number>(
  "kodama.filesWidth",
  340,
  undefined,
  sync,
);

// ---- 選択。再起動時に元の場所へ戻れるよう永続化する ----

export const selectedProjectIdAtom = atomWithStorage<string | null>(
  "kodama.projectId",
  null,
  undefined,
  sync,
);
export const selectedWorktreeAtom = atomWithStorage<string | null>(
  "kodama.worktree",
  null,
  undefined,
  sync,
);
export const commitSelectionAtom = atomWithStorage<CommitSelection>(
  "kodama.commitSelection",
  { kind: "pseudo", id: "uncommitted" },
  undefined,
  sync,
);
/** 中ペインを上下に分ける境界。コミット一覧の高さ。 */
export const commitPaneHeightAtom = atomWithStorage<number>(
  "kodama.commitPaneHeight",
  300,
  undefined,
  sync,
);

// ---- Rust の返り値のキャッシュ。揮発してよい ----

export const projectsAtom = atom<Project[]>([]);
/** プロジェクト ID → worktree 一覧。 */
export const worktreesAtom = atom<Record<string, WorktreeInfo[]>>({});
/** worktree のパス → 状態。一覧より後から埋まる。 */
export const statusesAtom = atom<Record<string, WorktreeStatus>>({});
/** 選択中 worktree のコミット一覧。 */
export const revisionsAtom = atom<RevisionList | null>(null);
export const selectedFileAtom = atom<string | null>(null);
export const settingsOpenAtom = atom<boolean>(false);

// ---- 一時状態 ----

export interface Toast {
  id: number;
  kind: "error" | "info" | "success";
  text: string;
}

export const toastsAtom = atom<Toast[]>([]);
/** 仮想スクロール中はトランジションを止める。 */
export const scrollingAtom = atom<boolean>(false);
