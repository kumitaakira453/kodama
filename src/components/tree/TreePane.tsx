import { useAtom, useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";

import { buildTree, type TreeNode } from "../../lib/diff/tree";
import type { DiffFile, DiffFileStatus } from "../../lib/types";
import {
  currentFileAtom,
  diffAtom,
  fileFilterAtom,
  focusFilterAtom,
} from "../../state/atoms";
import { Icon } from "../ui/Icon";

const STATUS_MARK: Record<DiffFileStatus, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  copied: "C",
  untracked: "?",
};

interface TreePaneProps {
  onJump: (path: string) => void;
}

/**
 * 変更ファイルのツリー。選ぶのではなく、右の diff の該当位置へ飛ばす。
 *
 * 生成ファイルは末尾にまとめる。lock ファイルが本来見たい変更に混ざると探しにくい。
 */
export function TreePane({ onJump }: TreePaneProps) {
  const diff = useAtomValue(diffAtom);
  const current = useAtomValue(currentFileAtom);
  const [filter, setFilter] = useAtom(fileFilterAtom);
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const [showGenerated, setShowGenerated] = useState(false);
  const focusRequest = useAtomValue(focusFilterAtom);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusRequest > 0) searchRef.current?.select();
  }, [focusRequest]);

  const files = diff?.files ?? [];
  const query = filter.trim().toLowerCase();

  const { normal, generated } = useMemo(() => {
    const matched = query
      ? files.filter((f) => f.path.toLowerCase().includes(query))
      : files;
    return {
      normal: matched.filter((f) => !f.generated),
      generated: matched.filter((f) => f.generated),
    };
  }, [files, query]);

  const nodes = useMemo(() => buildTree(normal), [normal]);

  const toggleDir = (path: string) =>
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    if (node.type === "file") {
      return (
        <FileRow
          key={node.file.path}
          file={node.file}
          name={node.name}
          depth={depth}
          active={node.file.path === current}
          onJump={onJump}
        />
      );
    }
    const collapsed = collapsedDirs.has(node.path);
    return (
      <div key={node.path}>
        <button
          className="kd-dir"
          style={{ paddingLeft: 8 + depth * 12 }}
          onClick={() => toggleDir(node.path)}
          aria-expanded={!collapsed}
        >
          <Icon name={collapsed ? "chevron_right" : "expand_more"} size={15} />
          <Icon name="folder" size={15} className="kd-dir__folder" />
          <span className="kd-dir__name">{node.name}</span>
        </button>
        {collapsed
          ? null
          : node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="kd-tree">
      <div className="kd-tree__head">
        <Icon name="search" size={15} />
        <input
          ref={searchRef}
          className="kd-tree__search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="ファイルを絞り込む"
          spellCheck={false}
        />
        {filter ? (
          <button
            className="kd-tree__clear"
            onClick={() => setFilter("")}
            aria-label="絞り込みを解除"
          >
            <Icon name="close" size={14} />
          </button>
        ) : null}
      </div>

      <div className="kd-tree__body">
        {nodes.map((n) => renderNode(n, 0))}

        {generated.length > 0 ? (
          <div className="kd-tree__generated">
            <button
              className="kd-dir"
              onClick={() => setShowGenerated((v) => !v)}
              aria-expanded={showGenerated}
            >
              <Icon
                name={showGenerated ? "expand_more" : "chevron_right"}
                size={15}
              />
              <Icon name="inventory_2" size={15} className="kd-dir__folder" />
              <span className="kd-dir__name">生成ファイル</span>
              <span className="kd-dir__count">{generated.length}</span>
            </button>
            {showGenerated
              ? generated.map((f) => (
                  <FileRow
                    key={f.path}
                    file={f}
                    name={f.path}
                    depth={1}
                    active={f.path === current}
                    onJump={onJump}
                  />
                ))
              : null}
          </div>
        ) : null}

        {files.length > 0 && normal.length === 0 && generated.length === 0 ? (
          <p className="kd-tree__note">一致するファイルがありません</p>
        ) : null}
      </div>
    </div>
  );
}

function FileRow({
  file,
  name,
  depth,
  active,
  onJump,
}: {
  file: DiffFile;
  name: string;
  depth: number;
  active: boolean;
  onJump: (path: string) => void;
}) {
  return (
    <button
      className="kd-file"
      data-active={active || undefined}
      style={{ paddingLeft: 8 + depth * 12 }}
      onClick={() => onJump(file.path)}
      title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
    >
      <span className={`kd-file__mark kd-file__mark--${file.status}`}>
        {STATUS_MARK[file.status]}
      </span>
      <span className="kd-file__name">{name}</span>
      {file.binary ? (
        <span className="kd-file__binary">bin</span>
      ) : (
        <span className="kd-file__counts">
          {file.additions > 0 ? (
            <span className="kd-add">+{file.additions}</span>
          ) : null}
          {file.deletions > 0 ? (
            <span className="kd-del">-{file.deletions}</span>
          ) : null}
        </span>
      )}
    </button>
  );
}
