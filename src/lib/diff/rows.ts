import type { LineSelection } from "../../state/atoms";
import type {
  DiffFile,
  DiffHunk,
  DiffLine,
  Side,
  ThreadView,
  ViewMode,
} from "../types";

/**
 * 仮想リストに並べる 1 行。**全ファイルを 1 本の列に潰す。**
 *
 * 型ごとに高さが決まるので `estimateSize` が厳密に当たり、ファイルをまたいでも
 * 見積もりのずれが溜まらない。difit が段階描画を選んだのは各ファイルの高さが
 * 事前に分からないからで、行の高さを固定できる kodama にはその制約がない。
 */
export type RowItem =
  | { type: "file-header"; key: string; file: DiffFile; collapsed: boolean }
  | { type: "hunk"; key: string; file: DiffFile; hunk: DiffHunk; label: string }
  | { type: "line"; key: string; file: DiffFile; line: DiffLine; context: string }
  | {
      type: "split";
      key: string;
      file: DiffFile;
      left: DiffLine | null;
      right: DiffLine | null;
      context: string;
    }
  | { type: "notice"; key: string; file: DiffFile; text: string }
  | { type: "thread"; key: string; file: DiffFile; view: ThreadView }
  | { type: "composer"; key: string; file: DiffFile; selection: LineSelection }
  | { type: "file-gap"; key: string };

/** 行の型ごとの高さ。CSS の変数と一致させる。 */
export const ROW_HEIGHT = {
  "file-header": 44,
  hunk: 24,
  line: 24,
  split: 24,
  notice: 56,
  // 可変。実測で置き換わるまでの見積もり。
  thread: 120,
  composer: 148,
  "file-gap": 16,
} as const;

export function rowHeight(row: RowItem): number {
  return ROW_HEIGHT[row.type];
}

export function buildRows(
  files: DiffFile[],
  mode: ViewMode,
  collapsed: Set<string>,
  threads: ThreadView[] = [],
  selection: LineSelection | null = null,
): RowItem[] {
  const rows: RowItem[] = [];
  const byFile = groupThreads(threads);

  for (const file of files) {
    const isCollapsed = collapsed.has(file.path);
    rows.push({
      type: "file-header",
      key: `${file.path}::head`,
      file,
      collapsed: isCollapsed,
    });

    if (!isCollapsed) {
      const notice = noticeFor(file);
      if (notice) {
        rows.push({
          type: "notice",
          key: `${file.path}::notice`,
          file,
          text: notice,
        });
      } else {
        appendHunks(
          rows,
          file,
          mode,
          byFile.get(file.path) ?? [],
          selection?.file === file.path ? selection : null,
        );
      }
    }

    rows.push({ type: "file-gap", key: `${file.path}::gap` });
  }

  return rows;
}

function groupThreads(threads: ThreadView[]): Map<string, ThreadView[]> {
  const map = new Map<string, ThreadView[]>();
  for (const view of threads) {
    const list = map.get(view.thread.file);
    if (list) list.push(view);
    else map.set(view.thread.file, [view]);
  }
  return map;
}

function appendHunks(
  rows: RowItem[],
  file: DiffFile,
  mode: ViewMode,
  threads: ThreadView[],
  selection: LineSelection | null,
): void {
  /** 対象行の直後にスレッドと入力欄を差し込む。行との対応が視覚的に保たれる。 */
  const attach = (side: Side, lineNo: number | null) => {
    if (lineNo === null) return;
    for (const view of threads) {
      if (view.thread.side === side && view.thread.lineEnd === lineNo) {
        rows.push({
          type: "thread",
          key: `${file.path}::t${view.thread.id}`,
          file,
          view,
        });
      }
    }
    if (selection && selection.side === side && selection.end === lineNo) {
      rows.push({
        type: "composer",
        key: `${file.path}::composer`,
        file,
        selection,
      });
    }
  };

  file.hunks.forEach((hunk, hi) => {
    rows.push({
      type: "hunk",
      key: `${file.path}::h${hi}`,
      file,
      hunk,
      label: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    });

    if (mode === "unified") {
      hunk.lines.forEach((line, li) => {
        rows.push({
          type: "line",
          key: `${file.path}::h${hi}l${li}`,
          file,
          line,
          context: hunk.header,
        });
        attach("new", line.newNumber);
        attach("old", line.oldNumber);
      });
      return;
    }

    hunk.rows.forEach((row, ri) => {
      const left = row.left === null ? null : (hunk.lines[row.left] ?? null);
      const right = row.right === null ? null : (hunk.lines[row.right] ?? null);
      rows.push({
        type: "split",
        key: `${file.path}::h${hi}r${ri}`,
        file,
        left,
        right,
        context: hunk.header,
      });
      attach("new", right?.newNumber ?? null);
      attach("old", left?.oldNumber ?? null);
    });
  });
}

function noticeFor(file: DiffFile): string | null {
  if (file.binary) return "バイナリファイルのため表示できません";
  if (file.truncated) {
    return "変更が大きすぎるため表示していません。エディタで開いてください。";
  }
  if (file.hunks.length === 0) {
    if (file.status === "renamed") return "内容の変更はありません（パスの変更のみ）";
    if (file.status === "copied") return "内容の変更はありません（コピーのみ）";
    return "内容の変更はありません（モードの変更のみ）";
  }
  return null;
}

/** 各ファイルのヘッダが行の列の何番目にあるか。ツリーからのジャンプに使う。 */
export function fileHeaderIndex(rows: RowItem[]): Map<string, number> {
  const map = new Map<string, number>();
  rows.forEach((row, i) => {
    if (row.type === "file-header") map.set(row.file.path, i);
  });
  return map;
}

/** 行番号の最大桁数。gutter の幅を決める。 */
export function maxLineDigits(files: DiffFile[]): number {
  let max = 0;
  for (const file of files) {
    for (const hunk of file.hunks) {
      max = Math.max(
        max,
        hunk.oldStart + hunk.oldLines,
        hunk.newStart + hunk.newLines,
      );
    }
  }
  return Math.max(3, String(max).length);
}
