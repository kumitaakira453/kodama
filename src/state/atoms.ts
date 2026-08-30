import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

import { DEFAULT_FONT, DEFAULT_SYNTAX } from "../lib/appearance";
import { collapsedFiles } from "../lib/diff/collapse";
import { applyFilter, type FileFilter } from "../lib/diff/filter";
import { isInSelection, type CommitSelection } from "../lib/revisions";
import type {
  DiffFile,
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

export type Theme = "light" | "dark";
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
/**
 * 構文の配色。ライトとダークで別に持つ。
 *
 * 1 つにまとめると、明暗を切り替えたときに背景と合わない配色が残る。
 * VS Code が明暗別に持っているのと同じ理由。
 */
export const syntaxLightAtom = atomWithStorage<string>(
  "kodama.syntaxLight",
  DEFAULT_SYNTAX,
  undefined,
  sync,
);
export const syntaxDarkAtom = atomWithStorage<string>(
  "kodama.syntaxDark",
  DEFAULT_SYNTAX,
  undefined,
  sync,
);
/** 差分の本文の書体。 */
export const codeFontAtom = atomWithStorage<string>(
  "kodama.codeFont",
  DEFAULT_FONT,
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
  // 一番広いところから始める。レビューで見たいのはたいてい全体で、
  // そこから絞る方が、狭いところから広げるより手数が少ない。
  { kind: "pseudo", id: "everything" },
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

/**
 * 自分で開閉したファイル。値は「開いているか」。
 *
 * 折りたたみの状態そのものは持たない。既定は絞り込みを通した一覧から毎回
 * 導き、ここには明示的な操作だけを残す。状態として抱えると、絞り込みを
 * 変えても読み込んだ時点の判断が居座る。
 */
export const fileOpenOverridesAtom = atom<Record<string, boolean>>({});
/** いま画面の上端に見えているファイル。左ツリーの強調に使う。 */
export const currentFileAtom = atom<string | null>(null);
/**
 * 展開したハンクの外の行。キーは `<path>::g<ハンク番号>`。
 * 値は展開して得た行の本文（先頭行の行番号つき）。
 */
export interface Expanded {
  from: number;
  lines: string[];
}
export const expandedAtom = atom<Record<string, Expanded>>({});

/** 左ツリーの絞り込み。 */
export const fileFilterAtom = atom<string>("");

/**
 * 表示しない拡張子。比較対象ごとに顔ぶれが変わるので持ち越さない。
 * 前の比較で隠した拡張子が残ると、次の比較でファイルが消えた理由が分からない。
 */
export const hiddenExtensionsAtom = atom<Set<string>>(new Set<string>());
/** 削除されたファイルを出すか。好みなので覚えておく。 */
export const showDeletedAtom = atomWithStorage<boolean>(
  "kodama.showDeleted",
  true,
  undefined,
  sync,
);
/** 閲覧済みのファイルを出すか。 */
export const showViewedAtom = atomWithStorage<boolean>(
  "kodama.showViewed",
  true,
  undefined,
  sync,
);

/**
 * 「このファイルまで飛べ」という要求。
 *
 * 同じファイルを続けて押しても届くよう、通し番号を添える。ref を親から
 * 配って回すより、要求を状態として置く方が経路が 1 本で済む。
 */
export const jumpRequestAtom = atom<{
  path: string;
  /** ここまで飛ぶ。指定が無ければファイルの先頭。 */
  thread?: string;
  nonce: number;
} | null>(null);

// ---- 一時状態 ----

export interface Toast {
  id: number;
  kind: "error" | "info" | "success";
  text: string;
}

export const toastsAtom = atom<Toast[]>([]);
export const settingsOpenAtom = atom<boolean>(false);
export const shortcutsOpenAtom = atom<boolean>(false);
export const appearanceOpenAtom = atom<boolean>(false);
/** 指摘の一覧を出しているか。 */
export const commentsOpenAtom = atom<boolean>(false);
/** 絞り込み欄へフォーカスを移す要求。通し番号で毎回届かせる。 */
export const focusFilterAtom = atom<number>(0);

// ---- 指摘 ----

/**
 * この worktree に付いた指摘の全件。
 *
 * 比較ごとに取り直さない。未コミットに書いた指摘がコミットへ取り込まれると、
 * 元のキーは未コミットのままなので、取り込み先の比較で絞って取ると出てこない。
 * 全件を手元に置き、どこに出すかは下の派生で決める。
 */
export const allThreadsAtom = atom<ThreadView[]>([]);

/**
 * いま見ている比較に属する指摘。
 *
 * 同じキーのものに加えて、**取り込まれた先が今の範囲に入っているもの**も出す。
 * 未コミットに書いた指摘は、コミットした瞬間に元の比較から中身が消える。
 * 出所は元のまま残し、行き先からも読めるようにする。
 */
export const threadsAtom = atom<ThreadView[]>((get) => {
  const key = get(diffAtom)?.resolved.revisionKey ?? null;
  const selection = get(commitSelectionAtom);
  const commits = get(revisionsAtom)?.commits ?? [];
  return get(allThreadsAtom).filter(
    (v) =>
      v.thread.revisionKey === key ||
      (v.anchor.kind === "committed" &&
        isInSelection(v.anchor.sha, selection, commits)),
  );
});

/**
 * 比較対象ごとの未解決の件数。
 *
 * どこに指摘が残っているかは、その比較を選ぶ前に分かっている必要がある。
 * 選んで初めて見えるなら、探すのに総当たりすることになる。
 */
export interface ThreadMarks {
  /** 疑似エントリのキーから引く件数。 */
  byKey: Record<string, number>;
  /** コミットの sha から引く件数。取り込まれたものもここに数える。 */
  byCommit: Record<string, number>;
  /** コミットを含む比較に付いたものの総数。「すべてのコミット」に出す。 */
  ranged: number;
}

export const threadMarksAtom = atom<ThreadMarks>((get) => {
  const marks: ThreadMarks = { byKey: {}, byCommit: {}, ranged: 0 };
  for (const view of get(allThreadsAtom)) {
    if (view.thread.status.kind !== "open") continue;
    const key = view.thread.revisionKey;
    marks.byKey[key] = (marks.byKey[key] ?? 0) + 1;
    if (key.startsWith("range:")) {
      marks.ranged += 1;
      // `range:<base>..<target>` の右側が、その比較の先端のコミット。
      const target = key.slice(key.indexOf("..") + 2);
      if (target) marks.byCommit[target] = (marks.byCommit[target] ?? 0) + 1;
    }
    if (view.anchor.kind === "committed") {
      const sha = view.anchor.sha;
      marks.byCommit[sha] = (marks.byCommit[sha] ?? 0) + 1;
    }
  }
  return marks;
});

/** ファイルのパス → 閲覧済みの状態。3 値で持つ。 */
export const viewedAtom = atom<Record<string, ViewedStatus>>({});

// ---- 絞り込みと折りたたみ。両方が同じ一覧を見るよう、ここで導く ----

/**
 * いまの絞り込み条件。ツリーと差分の両方で同じものを使う。
 *
 * 片方だけに効かせると、左に出ていないファイルが右に流れてきて、
 * 何を隠したのか分からなくなる。
 */
export const fileFilterStateAtom = atom<FileFilter>((get) => ({
  query: get(fileFilterAtom).trim().toLowerCase(),
  hiddenExtensions: get(hiddenExtensionsAtom),
  showDeleted: get(showDeletedAtom),
  showViewed: get(showViewedAtom),
  viewed: get(viewedAtom),
}));

/** 絞り込みを通ったファイル。 */
export const visibleFilesAtom = atom<DiffFile[]>((get) =>
  applyFilter(get(diffAtom)?.files ?? [], get(fileFilterStateAtom)),
);

/** 折りたたんでいるファイル。絞り込みの結果に自分の操作を重ねて導く。 */
export const collapsedFilesAtom = atom<Set<string>>((get) =>
  collapsedFiles(
    get(visibleFilesAtom),
    get(viewedAtom),
    get(fileOpenOverridesAtom),
  ),
);

/**
 * ファイルごとの未解決の指摘の数。
 *
 * 一覧を毎回なめ直すのではなく、ここで 1 度だけ数える。ツリーの行は仮想化
 * されていて描き直しが多いので、行ごとに数えると件数 × 行の回数になる。
 */
export const openThreadCountsAtom = atom<Record<string, number>>((get) => {
  const counts: Record<string, number> = {};
  for (const view of get(threadsAtom)) {
    if (view.thread.status.kind !== "open") continue;
    counts[view.thread.file] = (counts[view.thread.file] ?? 0) + 1;
  }
  return counts;
});

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
