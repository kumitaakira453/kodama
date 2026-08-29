import type { DiffFile, ViewedStatus } from "../types";

/** 拡張子が無いファイルをまとめる見出し。 */
const NO_EXTENSION = "拡張子なし";

/**
 * ファイルの拡張子。`.` から始まる形で返す。
 *
 * 先頭の `.`（`.gitignore` など）は拡張子ではなく名前なので、区切りとして
 * 数えない。`foo.test.ts` は `.ts` に入れる。細かく分けても選びにくい。
 */
export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : NO_EXTENSION;
}

export interface ExtensionCount {
  ext: string;
  count: number;
}

/** 一覧に出ている拡張子と件数。多い順、同数なら名前順。 */
export function extensionCounts(files: DiffFile[]): ExtensionCount[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    const ext = extensionOf(file.path);
    counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }
  return [...counts]
    .map(([ext, count]) => ({ ext, count }))
    .sort((a, b) => b.count - a.count || a.ext.localeCompare(b.ext));
}

export interface FileFilter {
  /** 小文字に揃えたパスの部分一致。空なら絞らない。 */
  query: string;
  hiddenExtensions: ReadonlySet<string>;
  showDeleted: boolean;
  showViewed: boolean;
  viewed: Record<string, ViewedStatus>;
}

export function matchesFilter(file: DiffFile, filter: FileFilter): boolean {
  if (filter.query && !file.path.toLowerCase().includes(filter.query)) {
    return false;
  }
  if (filter.hiddenExtensions.has(extensionOf(file.path))) return false;
  if (!filter.showDeleted && file.status === "deleted") return false;
  // stale は「読んだあとに変わった」なので、閲覧済みとしては隠さない。
  if (!filter.showViewed && filter.viewed[file.path] === "viewed") return false;
  return true;
}

export function applyFilter(
  files: DiffFile[],
  filter: FileFilter,
): DiffFile[] {
  return files.filter((file) => matchesFilter(file, filter));
}
