import { useAtom, useAtomValue } from "jotai";

import { useCurrentWorktrees } from "../../hooks/useProjects";
import type { PrInfo, WorktreeInfo, WorktreeStatus } from "../../lib/types";
import {
  pullRequestsAtom,
  selectedWorktreeAtom,
  statusesAtom,
} from "../../state/atoms";
import { Dropdown } from "../ui/Dropdown";

const PR_LABEL: Record<PrInfo["state"], string> = {
  draft: "DRAFT",
  open: "OPEN",
  merged: "MERGED",
  closed: "CLOSED",
};

/**
 * worktree を選ぶ。ブランチ名だけでは「どれが今どうなっているか」が分からないので、
 * 未コミットの有無・最終コミット・上流との差・PR の状態まで 1 行に収めて出す。
 */
export function WorktreeMenu() {
  const worktrees = useCurrentWorktrees();
  const statuses = useAtomValue(statusesAtom);
  const prs = useAtomValue(pullRequestsAtom);
  const [selected, setSelected] = useAtom(selectedWorktreeAtom);

  const current = worktrees.find((w) => w.path === selected);
  const label = current
    ? (current.branch ?? current.head ?? current.name)
    : "worktree";

  return (
    <Dropdown icon="polyline" label={label} width={480} title="worktree を選ぶ">
      {(close) => (
        <div className="kd-wtmenu">
          {worktrees.map((w) => (
            <WorktreeRow
              key={w.path}
              worktree={w}
              status={statuses[w.path]}
              pr={w.branch ? prs[w.branch] : undefined}
              selected={w.path === selected}
              onSelect={() => {
                setSelected(w.path);
                close();
              }}
            />
          ))}
          {worktrees.length === 0 ? (
            <p className="kd-revmenu__note">worktree がありません</p>
          ) : null}
        </div>
      )}
    </Dropdown>
  );
}

function WorktreeRow({
  worktree,
  status,
  pr,
  selected,
  onSelect,
}: {
  worktree: WorktreeInfo;
  status: WorktreeStatus | undefined;
  pr: PrInfo | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  const name = worktree.branch ?? worktree.head ?? worktree.name;

  return (
    <button
      className="kd-wtrow"
      data-selected={selected || undefined}
      onClick={onSelect}
      title={worktree.path}
    >
      <span className="kd-wtrow__title">
        <span className="kd-wtrow__name">{name}</span>
        {worktree.isMain ? (
          <span className="kd-wtrow__main">(main)</span>
        ) : null}
        {status?.dirty ? (
          <span className="kd-wtrow__dirty">変更あり</span>
        ) : null}
        {worktree.locked ? <span className="kd-chip">locked</span> : null}
      </span>

      <span className="kd-wtrow__subject">
        {status?.error
          ? "状態を取得できませんでした"
          : (status?.lastCommit?.subject ?? " ")}
      </span>

      <span className="kd-wtrow__meta">
        <span className="kd-wtrow__branch">
          {worktree.branch ?? worktree.head ?? "—"}
        </span>
        {status && status.ahead > 0 ? (
          <span className="kd-wtrow__ahead" title="上流より先行しているコミット数">
            +{status.ahead}
          </span>
        ) : null}
        {status && status.behind > 0 ? (
          <span className="kd-wtrow__behind" title="上流より遅れているコミット数">
            -{status.behind}
          </span>
        ) : null}
        <span className="kd-wtrow__time">{status?.lastCommit?.relative}</span>
      </span>

      {pr ? (
        <span className="kd-wtrow__pr">
          <span className={`kd-prbadge kd-prbadge--${pr.state}`}>
            {PR_LABEL[pr.state]}
          </span>
          <span className="kd-wtrow__prnum">#{pr.number}</span>
          <span className="kd-wtrow__prtitle">{pr.title}</span>
        </span>
      ) : null}
    </button>
  );
}
