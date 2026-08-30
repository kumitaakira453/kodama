import type { DiffFile, ViewedStatus } from "../types";

/**
 * 既定で開いておく行数の上限。
 *
 * 900 ファイル・数万行の比較で全部を開くと、行の組み立てだけで画面が固まる。
 * 上から順に開けるところまで開き、残りは畳んだ見出しで出す。
 */
export const OPEN_LINE_BUDGET = 4000;

/**
 * 既定で畳むファイル。
 *
 * **渡すのは絞り込みを通したあとの一覧。** 全ファイルに対して一度だけ決めると、
 * 予算を使い切った先の畳まれたファイルだけが絞り込みで残ったとき、開いている
 * ものが 1 つも無い画面になる。何を隠したかではなく予算の位置が見えてしまい、
 * 理由の分からない挙動として現れる。
 */
export function defaultCollapsed(
  files: DiffFile[],
  viewed: Record<string, ViewedStatus>,
): Set<string> {
  const collapsed = new Set<string>();
  let budget = OPEN_LINE_BUDGET;
  for (const file of files) {
    // 生成ファイルは中身を読まないので、量に関わらず畳む。読み終えたものも同じ。
    if (file.generated || viewed[file.path] === "viewed" || budget <= 0) {
      collapsed.add(file.path);
      continue;
    }
    budget -= file.hunks.reduce((n, h) => n + h.lines.length, 0);
  }
  return collapsed;
}

/**
 * 既定に、自分で開閉したぶんを重ねた最終形。
 *
 * `overrides` の値は「開いているか」。明示的に操作したものだけが載るので、
 * 触っていないファイルは絞り込みに応じて開き直る。
 */
export function collapsedFiles(
  files: DiffFile[],
  viewed: Record<string, ViewedStatus>,
  overrides: Record<string, boolean>,
): Set<string> {
  const base = defaultCollapsed(files, viewed);
  const out = new Set<string>();
  for (const file of files) {
    const open = overrides[file.path];
    if (open === undefined ? base.has(file.path) : !open) out.add(file.path);
  }
  return out;
}
