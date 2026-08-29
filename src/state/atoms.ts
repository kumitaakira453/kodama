import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

import type { CommitSelection } from "../lib/revisions";
import type {
  DiffResponse,
  PrInfo,
  Project,
  RevisionList,
  Side,
  ThreadView,
  ViewedStatus,
  ViewMode,
  WorktreeInfo,
  WorktreeStatus,
} from "../lib/types";

/** 初回描画のちらつきを防ぐため、localStorage を同期的に読む。 */
const sync = { getOnInit: true } as const;

export type Theme = "light" | "dark" | "system";
export type MotionPref = "auto" | "reduced";

// ---- 見た目の好み。壊れても再設定で済むので localStorage に置く ----

export const themeAtom = atomWithStorage<Theme>(
  "kodama.theme",
  "light",
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
  "unified",
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
export const sidebarOpenAtom = atomWithStorage<boolean>(
  "kodama.sidebarOpen",
  true,
  undefined,
  sync,
);
export const sidebarWidthAtom = atomWithStorage<number>(
  "kodama.sidebarWidth",
  296,
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

// ---- Rust の返り値のキャッシュ。揮発してよい ----

export const projectsAtom = atom<Project[]>([]);
/** プロジェクト ID → worktree 一覧。 */
export const worktreesAtom = atom<Record<string, WorktreeInfo[]>>({});
/** worktree のパス → 状態。一覧より後から埋まる。 */
export const statusesAtom = atom<Record<string, WorktreeStatus>>({});
/** ブランチ名 → PR。`gh` が無い環境では空のまま。 */
export const pullRequestsAtom = atom<Record<string, PrInfo>>({});
/** 選択中 worktree のコミット一覧。 */
export const revisionsAtom = atom<RevisionList | null>(null);
export const diffAtom = atom<DiffResponse | null>(null);
export const diffLoadingAtom = atom<boolean>(false);

// ---- diff の表示状態 ----

/** 折りたたんでいるファイル。閲覧済みと生成ファイルは既定で畳む。 */
export const collapsedFilesAtom = atom<Set<string>>(new Set<string>());
/** いま画面の上端に見えているファイル。左ツリーの強調に使う。 */
export const currentFileAtom = atom<string | null>(null);
/** 左ツリーの絞り込み。 */
export const fileFilterAtom = atom<string>("");

/**
 * 「このファイルまで飛べ」という要求。
 *
 * 同じファイルを続けて押しても届くよう、通し番号を添える。ref を親から
 * 配って回すより、要求を状態として置く方が経路が 1 本で済む。
 */
export const jumpRequestAtom = atom<{ path: string; nonce: number } | null>(
  null,
);

// ---- 一時状態 ----

export interface Toast {
  id: number;
  kind: "error" | "info" | "success";
  text: string;
}

export const toastsAtom = atom<Toast[]>([]);
export const settingsOpenAtom = atom<boolean>(false);
export const shortcutsOpenAtom = atom<boolean>(false);
/** 絞り込み欄へフォーカスを移す要求。通し番号で毎回届かせる。 */
export const focusFilterAtom = atom<number>(0);

// ---- 指摘 ----

export const threadsAtom = atom<ThreadView[]>([]);

/** ファイルのパス → 閲覧済みの状態。3 値で持つ。 */
export const viewedAtom = atom<Record<string, ViewedStatus>>({});

/** 行番号 gutter で選んでいる範囲。指摘の対象になる。 */
export interface LineSelection {
  file: string;
  side: Side;
  start: number;
  end: number;
  /** 対象行の逐語。指摘に添えて保存する。 */
  quote: string;
  /** ハンクヘッダ。行番号の代わりに場所を指す手がかりになる。 */
  context: string;
}

export const lineSelectionAtom = atom<LineSelection | null>(null);
/** 返信を書いているスレッド。 */
export const replyingToAtom = atom<string | null>(null);
