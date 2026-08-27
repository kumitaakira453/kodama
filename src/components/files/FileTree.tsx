import { useState } from "react";

import { buildTree, type TreeNode } from "../../lib/diff/tree";
import type { DiffFile, DiffFileStatus } from "../../lib/types";
import { Icon } from "../ui/Icon";

const STATUS_MARK: Record<DiffFileStatus, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  copied: "C",
  untracked: "?",
  typeChanged: "T",
};

interface FileTreeProps {
  files: DiffFile[];
  selected: string | null;
  onSelect: (path: string) => void;
  onContextMenu: (path: string, e: React.MouseEvent) => void;
}

export function FileTree({
  files,
  selected,
  onSelect,
  onContextMenu,
}: FileTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const nodes = buildTree(files);

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const render = (node: TreeNode, depth: number): React.ReactNode => {
    if (node.type === "file") {
      const f = node.file;
      const active = f.path === selected;
      return (
        <button
          key={f.path}
          className="kd-file"
          data-selected={active || undefined}
          style={{ paddingLeft: 10 + depth * 12 }}
          onClick={() => onSelect(f.path)}
          onContextMenu={(e) => onContextMenu(f.path, e)}
          title={f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}
        >
          <span className="kd-trunk" aria-hidden />
          <span className={`kd-file__mark kd-file__mark--${f.status}`}>
            {STATUS_MARK[f.status]}
          </span>
          <span className="kd-file__name">{node.name}</span>
          {f.binary ? (
            <span className="kd-file__binary">バイナリ</span>
          ) : (
            <span className="kd-file__counts">
              {f.additions > 0 ? (
                <span className="kd-file__add">+{f.additions}</span>
              ) : null}
              {f.deletions > 0 ? (
                <span className="kd-file__del">-{f.deletions}</span>
              ) : null}
            </span>
          )}
        </button>
      );
    }

    const isCollapsed = collapsed.has(node.path);
    return (
      <div key={node.path}>
        <button
          className="kd-dir"
          style={{ paddingLeft: 10 + depth * 12 }}
          onClick={() => toggle(node.path)}
          aria-expanded={!isCollapsed}
        >
          <Icon name={isCollapsed ? "chevron_right" : "expand_more"} size={14} />
          <span className="kd-dir__name">{node.name}</span>
          <span className="kd-dir__count">{node.fileCount}</span>
        </button>
        {isCollapsed
          ? null
          : node.children.map((child) => render(child, depth + 1))}
      </div>
    );
  };

  return <div className="kd-filetree">{nodes.map((n) => render(n, 0))}</div>;
}
