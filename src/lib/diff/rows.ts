import type { DiffFile, DiffLine, ViewMode } from "../types";

/** 仮想リストに並べる 1 行。 */
export type RowItem =
  | { type: "hunk"; key: string; header: string; label: string }
  | { type: "unified"; key: string; line: DiffLine }
  | {
      type: "split";
      key: string;
      left: DiffLine | null;
      right: DiffLine | null;
    };

/**
 * 表示モードに応じて描画すべき行の列を作る。
 *
 * unified は `hunk.lines` をそのまま、split は Rust が確定させた `hunk.rows` を
 * 引くだけにする。ペアリングをフロントで再計算すると、行内差分の算出元と
 * 食い違う余地が生まれる。
 */
export function buildRows(file: DiffFile, mode: ViewMode): RowItem[] {
  const rows: RowItem[] = [];

  file.hunks.forEach((hunk, hi) => {
    rows.push({
      type: "hunk",
      key: `h${hi}`,
      header: hunk.header,
      label: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    });

    if (mode === "unified") {
      hunk.lines.forEach((line, li) => {
        rows.push({ type: "unified", key: `h${hi}l${li}`, line });
      });
      return;
    }

    hunk.rows.forEach((row, ri) => {
      rows.push({
        type: "split",
        key: `h${hi}r${ri}`,
        left: row.left === null ? null : (hunk.lines[row.left] ?? null),
        right: row.right === null ? null : (hunk.lines[row.right] ?? null),
      });
    });
  });

  return rows;
}

/** 行番号の最大桁数。gutter 幅の算出に使う。 */
export function maxLineDigits(file: DiffFile): number {
  let max = 0;
  for (const hunk of file.hunks) {
    max = Math.max(max, hunk.oldStart + hunk.oldLines, hunk.newStart + hunk.newLines);
  }
  return Math.max(3, String(max).length);
}
