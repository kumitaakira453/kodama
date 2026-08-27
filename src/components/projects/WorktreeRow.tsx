import { useAtomValue } from "jotai";

import type { WorktreeInfo } from "../../lib/types";
import { statusesAtom } from "../../state/atoms";
import { Icon } from "../ui/Icon";

interface WorktreeRowProps {
  worktree: WorktreeInfo;
  selected: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function WorktreeRow({
  worktree,
  selected,
  onSelect,
  onContextMenu,
}: WorktreeRowProps) {
  const status = useAtomValue(statusesAtom)[worktree.path];
  const label = worktree.branch ?? worktree.head ?? worktree.name;

  return (
    <button
      className="kd-wt"
      data-selected={selected || undefined}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      title={worktree.path}
    >
      {/* 選択中を示す幹。3 ペインを貫く共通の語彙。 */}
      <span className="kd-trunk" aria-hidden />
      <span className="kd-wt__branch">
        <Icon
          name={worktree.detached ? "commit" : "polyline"}
          size={14}
          className="kd-wt__icon"
        />
        <span className="kd-wt__label">{label}</span>
        {worktree.isMain ? <span className="kd-chip">main</span> : null}
        {worktree.locked ? <Icon name="lock" size={12} /> : null}
      </span>

      <span className="kd-wt__meta">
        {status?.error ? (
          <span className="kd-wt__error">状態を取得できません</span>
        ) : status ? (
          <>
            {status.dirty ? (
              <span className="kd-dot" title="未コミットの変更あり" />
            ) : null}
            {status.ahead > 0 ? (
              <span className="kd-count" title={`${status.ahead} コミット先行`}>
                ↑{status.ahead}
              </span>
            ) : null}
            {status.behind > 0 ? (
              <span className="kd-count" title={`${status.behind} コミット遅れ`}>
                ↓{status.behind}
              </span>
            ) : null}
            <span className="kd-wt__time">{status.lastCommit?.relative}</span>
          </>
        ) : (
          <span className="kd-wt__pending" aria-hidden />
        )}
      </span>

      {status?.lastCommit ? (
        <span className="kd-wt__subject">{status.lastCommit.subject}</span>
      ) : null}
    </button>
  );
}
