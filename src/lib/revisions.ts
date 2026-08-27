import type { CommitInfo, DiffSpec } from "./types";

/** git のコミットではない、一覧の先頭に並べる比較対象。 */
export type PseudoId = "uncommitted" | "staged" | "unstaged" | "branch";

/**
 * コミット一覧での選択。
 *
 * コミットは sha で持つ。読み込み直しで並びが変わってもインデックスと違って
 * 指し先がずれない。
 */
export type CommitSelection =
  | { kind: "pseudo"; id: PseudoId }
  | { kind: "commits"; anchor: string; focus: string };

export const PSEUDO_LABELS: Record<PseudoId, string> = {
  uncommitted: "未コミットの変更",
  staged: "ステージ済み",
  unstaged: "未ステージ",
  branch: "ブランチ全体",
};

/**
 * 選択から `DiffSpec` を組み立てる。
 *
 * コミット一覧は新しい順。連続範囲を選んだときは「最古の親 → 最新」の合成差分に
 * なるため、範囲の両端の sha をそのまま渡し、`^` の解決（最初のコミットでは
 * 空ツリー）は Rust 側に任せる。
 */
export function buildSpec(
  selection: CommitSelection,
  commits: CommitInfo[],
  defaultBase: string | null,
): DiffSpec | null {
  if (selection.kind === "pseudo") {
    switch (selection.id) {
      case "uncommitted":
        return { kind: "uncommitted" };
      case "staged":
        return { kind: "staged" };
      case "unstaged":
        return { kind: "unstaged" };
      case "branch":
        if (!defaultBase) return null;
        return {
          kind: "range",
          base: defaultBase,
          target: "HEAD",
          mergeBase: true,
        };
    }
  }

  const range = resolveRange(selection, commits);
  if (!range) return null;
  return {
    kind: "commitRange",
    oldest: range.oldest.sha,
    newest: range.newest.sha,
  };
}

interface ResolvedRange {
  newest: CommitInfo;
  oldest: CommitInfo;
  /** 範囲に含まれるコミット数。 */
  count: number;
}

/** 選択中の範囲を一覧上の位置から解決する。 */
export function resolveRange(
  selection: CommitSelection,
  commits: CommitInfo[],
): ResolvedRange | null {
  if (selection.kind !== "commits") return null;
  const a = commits.findIndex((c) => c.sha === selection.anchor);
  const b = commits.findIndex((c) => c.sha === selection.focus);
  if (a < 0 || b < 0) return null;
  // 一覧は新しい順なので、小さい添字が新しい側。
  const top = Math.min(a, b);
  const bottom = Math.max(a, b);
  const newest = commits[top];
  const oldest = commits[bottom];
  if (!newest || !oldest) return null;
  return { newest, oldest, count: bottom - top + 1 };
}

/** ある sha が選択範囲に入っているか。行のハイライト判定に使う。 */
export function isInSelection(
  sha: string,
  selection: CommitSelection,
  commits: CommitInfo[],
): boolean {
  if (selection.kind !== "commits") return false;
  const a = commits.findIndex((c) => c.sha === selection.anchor);
  const b = commits.findIndex((c) => c.sha === selection.focus);
  const i = commits.findIndex((c) => c.sha === sha);
  if (a < 0 || b < 0 || i < 0) return false;
  return i >= Math.min(a, b) && i <= Math.max(a, b);
}

/** 選択内容を 1 行で説明する。ツールバーと空状態の文言に使う。 */
export function describeSelection(
  selection: CommitSelection,
  commits: CommitInfo[],
  defaultBase: string | null,
): string {
  if (selection.kind === "pseudo") {
    if (selection.id === "branch") {
      return defaultBase
        ? `${defaultBase} から現在まで`
        : "比較元のブランチが見つかりません";
    }
    return PSEUDO_LABELS[selection.id];
  }
  const range = resolveRange(selection, commits);
  if (!range) return "コミットを選んでください";
  if (range.count === 1) {
    return `${range.newest.shortSha} ${range.newest.subject}`;
  }
  return `${range.oldest.shortSha} … ${range.newest.shortSha}（${range.count} コミット）`;
}
