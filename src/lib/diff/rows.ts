import type { DiffFile, DiffHunk, DiffLine, ViewMode } from "../types";

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
  | { type: "line"; key: string; file: DiffFile; line: DiffLine }
  | {
      type: "split";
      key: string;
      file: DiffFile;
      left: DiffLine | null;
      right: DiffLine | null;
    }
  | { type: "notice"; key: string; file: DiffFile; text: string }
  | { type: "file-gap"; key: string };

/** 行の型ごとの高さ。CSS の変数と一致させる。 */
export const ROW_HEIGHT = {
  "file-header": 44,
  hunk: 24,
  line: 24,
  split: 24,
  notice: 56,
  "file-gap": 16,
} as const;

export function rowHeight(row: RowItem): number {
  return ROW_HEIGHT[row.type];
}

export function buildRows(
  files: DiffFile[],
  mode: ViewMode,
  collapsed: Set<string>,
): RowItem[] {
  const rows: RowItem[] = [];

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
        appendHunks(rows, file, mode);
      }
    }

    rows.push({ type: "file-gap", key: `${file.path}::gap` });
  }

  return rows;
}

function appendHunks(rows: RowItem[], file: DiffFile, mode: ViewMode): void {
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
        rows.push({ type: "line", key: `${file.path}::h${hi}l${li}`, file, line });
      });
      return;
    }

    hunk.rows.forEach((row, ri) => {
      rows.push({
        type: "split",
        key: `${file.path}::h${hi}r${ri}`,
        file,
        left: row.left === null ? null : (hunk.lines[row.left] ?? null),
        right: row.right === null ? null : (hunk.lines[row.right] ?? null),
      });
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

/**
 * いちばん長い行の文字数。
 *
 * 仮想化した行は絶対配置なので、親の幅を押し広げない。横スクロールを
 * diff 全体で 1 本に保つため、内容の幅をここで測って親に持たせる。
 * 極端に長い行に引きずられないよう上限を設ける。
 */
export function maxLineLength(files: DiffFile[], cap = 400): number {
  let max = 40;
  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.content.length > max) {
          max = Math.min(line.content.length, cap);
          if (max >= cap) return cap;
        }
      }
    }
  }
  return max;
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
