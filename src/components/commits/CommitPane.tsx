import { useAtom, useAtomValue } from "jotai";
import { useCallback } from "react";

import {
  PSEUDO_LABELS,
  isInSelection,
  resolveRange,
  type PseudoId,
} from "../../lib/revisions";
import type { CommitInfo, WorktreeStatus } from "../../lib/types";
import {
  commitSelectionAtom,
  revisionsAtom,
  selectedWorktreeAtom,
  statusesAtom,
} from "../../state/atoms";
import { Icon } from "../ui/Icon";
import { RingSpinner } from "../ui/RingSpinner";

/** 疑似エントリの並び順とアイコン。 */
const PSEUDO_ORDER: { id: PseudoId; icon: string }[] = [
  { id: "uncommitted", icon: "edit_note" },
  { id: "staged", icon: "playlist_add_check" },
  { id: "unstaged", icon: "pending_actions" },
  { id: "branch", icon: "account_tree" },
];

export function CommitPane() {
  const revisions = useAtomValue(revisionsAtom);
  const worktree = useAtomValue(selectedWorktreeAtom);
  const status = useAtomValue(statusesAtom)[worktree ?? ""];
  const [selection, setSelection] = useAtom(commitSelectionAtom);

  const commits = revisions?.commits ?? [];
  const range = resolveRange(selection, commits);

  /**
   * コミット行のクリック。Shift を押していれば直前のアンカーから連続範囲を伸ばす。
   * 飛び飛びの選択は許さない — 「この 3 つだけの合成差分」に相当する git の
   * 表現が無く、意味が曖昧になるため。
   */
  const clickCommit = useCallback(
    (sha: string, shiftKey: boolean) => {
      setSelection((prev) => {
        if (shiftKey && prev.kind === "commits") {
          return { kind: "commits", anchor: prev.anchor, focus: sha };
        }
        return { kind: "commits", anchor: sha, focus: sha };
      });
    },
    [setSelection],
  );

  if (!worktree) {
    return (
      <div className="kd-pane__note kd-pane__note--center">
        worktree を選んでください
      </div>
    );
  }

  if (!revisions) {
    return (
      <div className="kd-pane__loading">
        <RingSpinner size={24} />
      </div>
    );
  }

  return (
    <div className="kd-commits">
      <div className="kd-commits__head">
        <span className="kd-commits__title">比較対象</span>
        {range && range.count > 1 ? (
          <span className="kd-commits__badge">{range.count} コミット</span>
        ) : null}
        {selection.kind === "commits" ? (
          <button
            className="kd-commits__hint"
            onClick={() =>
              setSelection({ kind: "pseudo", id: "uncommitted" })
            }
            title="選択を解除"
          >
            Shift+クリックで範囲
          </button>
        ) : null}
      </div>

      <div className="kd-commits__list">
        {PSEUDO_ORDER.map(({ id, icon }) => (
          <PseudoRow
            key={id}
            id={id}
            icon={icon}
            status={status}
            defaultBase={revisions.defaultBase}
            selected={selection.kind === "pseudo" && selection.id === id}
            onSelect={() => setSelection({ kind: "pseudo", id })}
          />
        ))}

        <div className="kd-commits__sep">
          <span>コミット</span>
        </div>

        {commits.map((c) => (
          <CommitRow
            key={c.sha}
            commit={c}
            selected={isInSelection(c.sha, selection, commits)}
            isEdge={
              range?.newest.sha === c.sha || range?.oldest.sha === c.sha
            }
            onClick={(e) => clickCommit(c.sha, e.shiftKey)}
          />
        ))}

        {commits.length === 0 ? (
          <p className="kd-pane__note">コミットがありません</p>
        ) : null}
      </div>
    </div>
  );
}

function PseudoRow({
  id,
  icon,
  status,
  defaultBase,
  selected,
  onSelect,
}: {
  id: PseudoId;
  icon: string;
  status: WorktreeStatus | undefined;
  defaultBase: string | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const detail = pseudoDetail(id, status, defaultBase);
  // 変更が無い対象は選んでも空になるだけなので、押せないことを示す。
  const empty = detail.count === 0;

  return (
    <button
      className="kd-crow kd-crow--pseudo"
      data-selected={selected || undefined}
      data-empty={empty || undefined}
      onClick={onSelect}
      title={detail.title}
    >
      <span className="kd-trunk" aria-hidden />
      <Icon name={icon} size={15} className="kd-crow__icon" />
      <span className="kd-crow__subject">{PSEUDO_LABELS[id]}</span>
      <span className="kd-crow__meta">{detail.suffix}</span>
    </button>
  );
}

function pseudoDetail(
  id: PseudoId,
  status: WorktreeStatus | undefined,
  defaultBase: string | null,
): { suffix: string; title: string; count: number | null } {
  if (id === "branch") {
    return {
      suffix: defaultBase ?? "—",
      title: defaultBase
        ? `${defaultBase} との共通祖先から現在まで`
        : "比較元のブランチが見つかりません",
      count: defaultBase ? null : 0,
    };
  }
  if (!status) return { suffix: "", title: "", count: null };

  const count =
    id === "uncommitted"
      ? status.stagedCount + status.unstagedCount + status.untrackedCount
      : id === "staged"
        ? status.stagedCount
        : status.unstagedCount + status.untrackedCount;

  return {
    suffix: count > 0 ? String(count) : "—",
    title: count > 0 ? `${count} ファイル` : "変更はありません",
    count,
  };
}

function CommitRow({
  commit,
  selected,
  isEdge,
  onClick,
}: {
  commit: CommitInfo;
  selected: boolean;
  isEdge: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      className="kd-crow"
      data-selected={selected || undefined}
      data-edge={isEdge || undefined}
      onClick={onClick}
      title={`${commit.sha}\n${commit.author}\n${commit.subject}`}
    >
      <span className="kd-trunk" aria-hidden />
      <span className="kd-crow__sha">{commit.shortSha}</span>
      <span className="kd-crow__subject">{commit.subject}</span>
      <span className="kd-crow__meta">{commit.relative}</span>
    </button>
  );
}
