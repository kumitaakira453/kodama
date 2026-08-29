import type { DiffFile } from "../types";

export interface TreeFile {
  type: "file";
  /** 表示名。 */
  name: string;
  file: DiffFile;
}

export interface TreeDir {
  type: "dir";
  /** 表示名。単一の子ディレクトリが続く場合は `a/b/c` に畳まれている。 */
  name: string;
  path: string;
  children: TreeNode[];
  fileCount: number;
}

export type TreeNode = TreeFile | TreeDir;

/** 仮想リストに並べる 1 行。畳んだディレクトリの中身は含めない。 */
export type TreeRow =
  | { kind: "dir"; key: string; node: TreeDir; depth: number }
  | { kind: "file"; key: string; file: DiffFile; name: string; depth: number };

/**
 * 見えている行だけを平らな列にする。
 *
 * 入れ子のまま描くと、変更が多い比較で数千個の要素が常に DOM に居座り、
 * 絞り込みを 1 文字打つたびに全部を描き直すことになる。
 */
export function flattenTree(
  nodes: TreeNode[],
  collapsed: ReadonlySet<string>,
  depth = 0,
  out: TreeRow[] = [],
): TreeRow[] {
  for (const node of nodes) {
    if (node.type === "file") {
      out.push({
        kind: "file",
        key: node.file.path,
        file: node.file,
        name: node.name,
        depth,
      });
      continue;
    }
    out.push({ kind: "dir", key: node.path, node, depth });
    if (!collapsed.has(node.path)) {
      flattenTree(node.children, collapsed, depth + 1, out);
    }
  }
  return out;
}

/**
 * フラットなパス配列から階層ツリーを作る。
 *
 * 子がディレクトリ 1 つだけの連なりは `a/b/c` に畳む。深い階層が 1 段ずつ
 * 折れ曲がって縦に伸びるのを防ぐ。
 */
export function buildTree(files: DiffFile[]): TreeNode[] {
  const root: TreeDir = {
    type: "dir",
    name: "",
    path: "",
    children: [],
    fileCount: 0,
  };

  for (const file of files) {
    const parts = file.path.split("/");
    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i];
      const path = dir.path ? `${dir.path}/${name}` : name;
      let next = dir.children.find(
        (c): c is TreeDir => c.type === "dir" && c.name === name,
      );
      if (!next) {
        next = { type: "dir", name, path, children: [], fileCount: 0 };
        dir.children.push(next);
      }
      dir = next;
    }
    dir.children.push({
      type: "file",
      name: parts[parts.length - 1],
      file,
    });
  }

  countFiles(root);
  compact(root);
  sort(root);
  return root.children;
}

function countFiles(dir: TreeDir): number {
  let n = 0;
  for (const child of dir.children) {
    n += child.type === "file" ? 1 : countFiles(child);
  }
  dir.fileCount = n;
  return n;
}

/** 子がディレクトリ 1 つだけなら名前を繋いで 1 段に潰す。 */
function compact(dir: TreeDir): void {
  for (const child of dir.children) {
    if (child.type !== "dir") continue;
    while (child.children.length === 1 && child.children[0].type === "dir") {
      const only = child.children[0];
      child.name = `${child.name}/${only.name}`;
      child.path = only.path;
      child.children = only.children;
    }
    compact(child);
  }
}

function sort(dir: TreeDir): void {
  dir.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of dir.children) {
    if (child.type === "dir") sort(child);
  }
}
