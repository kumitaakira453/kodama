import type { CommitInfo, DiffSpec } from "./types";

/**
 * 個々のコミットを選ぶ以外の比較対象。
 *
 * 互いに包含関係がある。`everything` が一番広く、その中に `branch` と
 * `uncommitted` が並び、`uncommitted` の中に `staged` と `unstaged` がある。
 * 画面ではこの関係が見えるように並べる。
 */
export type PseudoId =
  | "everything"
  | "branch"
  | "uncommitted"
  | "staged"
  | "unstaged";

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
  everything: "すべての変更",
  branch: "すべてのコミット",
  uncommitted: "未コミットの変更",
  staged: "ステージ済み",
  unstaged: "未ステージ",
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
      case "everything":
        if (!defaultBase) return null;
        return { kind: "everything", base: defaultBase };
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

/**
 * その選択が `id` の範囲を含んでいるか。行のチェック状態に使う。
 *
 * 「未コミットの変更」を選べば、その一部である「ステージ済み」と
 * 「未ステージ」も見ていることになる。含まれていることを画面に出さないと、
 * 選択肢が互いに排他だと読めてしまう。
 */
export function covers(selection: CommitSelection, id: PseudoId): boolean {
  if (selection.kind !== "pseudo") return false;
  if (selection.id === id) return true;
  if (selection.id === "everything") return true;
  return (
    selection.id === "uncommitted" && (id === "staged" || id === "unstaged")
  );
}

/**
 * ある sha が選択に入っているか。コミット行のチェック状態に使う。
 *
 * 「すべてのコミット」は個々のコミットを全部選ぶことと同じなので、
 * そのときも一覧にチェックを付ける。
 */
export function isInSelection(
  sha: string,
  selection: CommitSelection,
  commits: CommitInfo[],
): boolean {
  if (selection.kind === "pseudo") {
    // 一覧は分岐点から現在までなので、ブランチ全体を選ぶと全部が入る。
    return selection.id === "branch" || selection.id === "everything";
  }
  const a = commits.findIndex((c) => c.sha === selection.anchor);
  const b = commits.findIndex((c) => c.sha === selection.focus);
  const i = commits.findIndex((c) => c.sha === sha);
  if (a < 0 || b < 0 || i < 0) return false;
  return i >= Math.min(a, b) && i <= Math.max(a, b);
}

/**
 * 選択内容を短く言い表す。上部バーのボタンに出す。
 *
 * sha は並べても見分けが付かないので、1 件ならコミットの題名を出す。
 * 複数なら題名を並べても読めないので件数にする。sha は title に回す。
 */
export function describeSelection(
  selection: CommitSelection,
  commits: CommitInfo[],
  defaultBase: string | null,
): string {
  if (selection.kind === "pseudo") {
    const needsBase =
      selection.id === "branch" || selection.id === "everything";
    if (needsBase && !defaultBase) return "比較元のブランチが見つかりません";
    return PSEUDO_LABELS[selection.id];
  }
  const range = resolveRange(selection, commits);
  if (!range) return "コミットを選んでください";
  if (range.count === 1) return range.newest.subject;
  return `${range.count} コミット`;
}

/** 選択内容の詳しい説明。ボタンの title に出す。 */
export function explainSelection(
  selection: CommitSelection,
  commits: CommitInfo[],
  defaultBase: string | null,
): string {
  if (selection.kind === "pseudo") {
    switch (selection.id) {
      case "everything":
        return defaultBase
          ? `${defaultBase} との分岐点から作業ツリーまで`
          : "比較元のブランチが見つかりません";
      case "branch":
        return defaultBase
          ? `${defaultBase} との分岐点から HEAD まで`
          : "比較元のブランチが見つかりません";
      case "uncommitted":
        return "HEAD から作業ツリーまで";
      case "staged":
        return "HEAD から index まで";
      case "unstaged":
        return "index から作業ツリーまで";
    }
  }
  const range = resolveRange(selection, commits);
  if (!range) return "コミットを選んでください";
  if (range.count === 1) {
    return `${range.newest.shortSha} ${range.newest.subject}`;
  }
  return `${range.oldest.shortSha} … ${range.newest.shortSha}`;
}
