import { useVirtualizer } from "@tanstack/react-virtual";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";

import { useFileFilter } from "../../hooks/useFileFilter";
import { applyFilter, extensionCounts } from "../../lib/diff/filter";
import { buildTree, flattenTree, type TreeRow } from "../../lib/diff/tree";
import type { DiffFile, DiffFileStatus } from "../../lib/types";
import {
  currentFileAtom,
  diffAtom,
  fileFilterAtom,
  focusFilterAtom,
  hiddenExtensionsAtom,
  showDeletedAtom,
  showViewedAtom,
} from "../../state/atoms";
import { Dropdown } from "../ui/Dropdown";
import { Icon } from "../ui/Icon";

const STATUS_MARK: Record<DiffFileStatus, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  copied: "C",
  untracked: "?",
};

/** ツリーの行の高さ。CSS と一致させる。 */
const TREE_ROW_H = 26;

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
  const fileFilter = useFileFilter();

  const { normal, generated } = useMemo(() => {
    const matched = applyFilter(files, fileFilter);
    return {
      normal: matched.filter((f) => !f.generated),
      generated: matched.filter((f) => f.generated),
    };
  }, [files, fileFilter]);

  const nodes = useMemo(() => buildTree(normal), [normal]);

  // 見えている行だけを平らに並べて仮想化する。入れ子のまま描くと、変更が
  // 多い比較で数千個の要素が居座り、絞り込みを 1 文字打つたびに描き直す。
  const rows = useMemo(
    () => flattenTree(nodes, collapsedDirs),
    [nodes, collapsedDirs],
  );

  const bodyRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => bodyRef.current,
    estimateSize: () => TREE_ROW_H,
    overscan: 12,
    getItemKey: (i) => rows[i].key,
  });

  const toggleDir = (path: string) =>
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <div className="kd-tree">
      <div className="kd-tree__bar">
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

        <FilterMenu files={files} />
      </div>

      <div className="kd-tree__body" ref={bodyRef}>
        <div
          className="kd-tree__spacer"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            return (
              <div
                key={item.key}
                className="kd-tree__slot"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                {row.kind === "file" ? (
                  <FileRow
                    file={row.file}
                    name={row.name}
                    depth={row.depth}
                    active={row.file.path === current}
                    onJump={onJump}
                  />
                ) : (
                  <DirRow
                    row={row}
                    collapsed={collapsedDirs.has(row.node.path)}
                    onToggle={toggleDir}
                  />
                )}
              </div>
            );
          })}
        </div>

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

function DirRow({
  row,
  collapsed,
  onToggle,
}: {
  row: Extract<TreeRow, { kind: "dir" }>;
  collapsed: boolean;
  onToggle: (path: string) => void;
}) {
  return (
    <button
      className="kd-dir"
      style={{ paddingLeft: 8 + row.depth * 12 }}
      onClick={() => onToggle(row.node.path)}
      aria-expanded={!collapsed}
      title={row.node.path}
    >
      <Icon name={collapsed ? "chevron_right" : "expand_more"} size={15} />
      <Icon
        name={collapsed ? "folder" : "folder_open"}
        size={15}
        className="kd-dir__folder"
      />
      <span className="kd-dir__name">{row.node.name}</span>
    </button>
  );
}

/**
 * 拡張子と種類での絞り込み。
 *
 * 絞り込みはツリーと差分の両方に効かせる。片方だけに効かせると、
 * 左に出ていないファイルが右に流れてきて、何を隠したのか分からなくなる。
 */
function FilterMenu({ files }: { files: DiffFile[] }) {
  const [hidden, setHidden] = useAtom(hiddenExtensionsAtom);
  const [showDeleted, setShowDeleted] = useAtom(showDeletedAtom);
  const [showViewed, setShowViewed] = useAtom(showViewedAtom);

  const counts = useMemo(() => extensionCounts(files), [files]);
  const active = hidden.size > 0 || !showDeleted || !showViewed;

  const toggleExt = (ext: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(ext)) next.delete(ext);
      else next.add(ext);
      return next;
    });

  return (
    <Dropdown
      icon="filter_list"
      label="絞り込み"
      title="ファイルの絞り込み"
      width={240}
      iconOnly
    >
      {() => (
        <>
          <p className="kd-menu__head">拡張子</p>
          {counts.map(({ ext, count }) => (
            <button
              key={ext}
              className="kd-menuitem"
              onClick={() => toggleExt(ext)}
            >
              <Icon
                name={hidden.has(ext) ? "check_box_outline_blank" : "check_box"}
                size={15}
              />
              <span className="kd-menuitem__text">{ext}</span>
              <span className="kd-menuitem__count">{count}</span>
            </button>
          ))}
          {counts.length === 0 ? (
            <p className="kd-menu__note">ファイルがありません</p>
          ) : null}

          <div className="kd-menu__sep" />

          <button
            className="kd-menuitem"
            onClick={() => setShowDeleted(!showDeleted)}
          >
            <Icon
              name={showDeleted ? "check_box" : "check_box_outline_blank"}
              size={15}
            />
            <span className="kd-menuitem__text">削除されたファイル</span>
          </button>
          <button
            className="kd-menuitem"
            onClick={() => setShowViewed(!showViewed)}
          >
            <Icon
              name={showViewed ? "check_box" : "check_box_outline_blank"}
              size={15}
            />
            <span className="kd-menuitem__text">閲覧済みのファイル</span>
          </button>

          {active ? (
            <>
              <div className="kd-menu__sep" />
              <button
                className="kd-menuitem"
                onClick={() => {
                  setHidden(new Set());
                  setShowDeleted(true);
                  setShowViewed(true);
                }}
              >
                <Icon name="restart_alt" size={15} />
                <span className="kd-menuitem__text">絞り込みを解除</span>
              </button>
            </>
          ) : null}
        </>
      )}
    </Dropdown>
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
