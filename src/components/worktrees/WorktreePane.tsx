import { useAtom, useAtomValue } from "jotai";
import { useMemo, useState } from "react";

import type { WorktreeInfo } from "../../lib/types";
import {
  selectedProjectIdAtom,
  selectedWorktreeAtom,
  worktreesAtom,
} from "../../state/atoms";
import { Icon } from "../ui/Icon";
import { WorktreeRow } from "./WorktreeRow";

interface WorktreePaneProps {
  onRevealWorktree: (path: string) => void;
}

export function WorktreePane({ onRevealWorktree }: WorktreePaneProps) {
  const worktrees = useAtomValue(worktreesAtom);
  const projectId = useAtomValue(selectedProjectIdAtom);
  const [selected, setSelected] = useAtom(selectedWorktreeAtom);
  const [query, setQuery] = useState("");

  const list: WorktreeInfo[] = projectId ? (worktrees[projectId] ?? []) : [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.branch ?? "").toLowerCase().includes(q),
    );
  }, [list, query]);

  return (
    <div className="kd-wtpane">
      <div className="kd-wtpane__head">
        <Icon name="search" size={14} />
        <input
          className="kd-wtpane__search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="worktree を絞り込む"
          spellCheck={false}
        />
        {query ? (
          <button
            className="kd-wtpane__clear"
            onClick={() => setQuery("")}
            aria-label="絞り込みを解除"
          >
            <Icon name="close" size={14} />
          </button>
        ) : null}
      </div>

      <div className="kd-wtpane__list">
        {filtered.map((w) => (
          <WorktreeRow
            key={w.path}
            worktree={w}
            selected={selected === w.path}
            onSelect={() => setSelected(w.path)}
            onContextMenu={(e) => {
              e.preventDefault();
              onRevealWorktree(w.path);
            }}
          />
        ))}
        {list.length > 0 && filtered.length === 0 ? (
          <p className="kd-pane__note">一致する worktree がありません</p>
        ) : null}
        {list.length === 0 ? (
          <p className="kd-pane__note">worktree がありません</p>
        ) : null}
      </div>
    </div>
  );
}
