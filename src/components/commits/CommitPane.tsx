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
   * チェックボックス。起点は保ったまま、押した行まで選択を伸ばす / 縮める。
   * 間を飛ばして押すと、あいだのコミットも選択に入る。
   *
   * 飛び飛びの選択は扱わない。「この n 件だけの合成差分」に相当する git の表現が
   * 無く、cherry-pick 相当の合成が要るうえ、結果が競合しうる。
   */
  const toggleCommit = useCallback(
    (sha: string) => {
      setSelection((prev) =>
        prev.kind === "commits"
          ? { kind: "commits", anchor: prev.anchor, focus: sha }
          : { kind: "commits", anchor: sha, focus: sha },
      );
    },
    [setSelection],
  );

  /** 行本体は「その 1 件だけ」を選ぶ。範囲を作り直したいときの起点になる。 */
  const selectOnly = useCallback(
    (sha: string) => setSelection({ kind: "commits", anchor: sha, focus: sha }),
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
            onClick={() => setSelection({ kind: "pseudo", id: "uncommitted" })}
          >
            選択を解除
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
            onToggle={() => toggleCommit(c.sha)}
            onSelectOnly={() => selectOnly(c.sha)}
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
    <div
      className="kd-crow kd-crow--pseudo"
      data-selected={selected || undefined}
      data-empty={empty || undefined}
    >
      <span className="kd-trunk" aria-hidden />
      {/* コミットの範囲選択とは排他なので、チェックではなくラジオで示す。 */}
      <label className="kd-check">
        <input
          type="radio"
          name="kd-revision"
          checked={selected}
          onChange={onSelect}
          aria-label={PSEUDO_LABELS[id]}
        />
      </label>
      <button className="kd-crow__body" onClick={onSelect} title={detail.title}>
        <Icon name={icon} size={15} className="kd-crow__icon" />
        <span className="kd-crow__subject">{PSEUDO_LABELS[id]}</span>
        <span className="kd-crow__meta">{detail.suffix}</span>
      </button>
    </div>
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
  onToggle,
  onSelectOnly,
}: {
  commit: CommitInfo;
  selected: boolean;
  onToggle: () => void;
  onSelectOnly: () => void;
}) {
  return (
    <div className="kd-crow" data-selected={selected || undefined}>
      <span className="kd-trunk" aria-hidden />
      <label className="kd-check" title="ここまで選択を伸ばす">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`${commit.shortSha} までを選択`}
        />
      </label>
      <button
        className="kd-crow__body"
        onClick={onSelectOnly}
        title={`${commit.sha}\n${commit.author}\n${commit.subject}\n\nクリックでこの 1 件だけを選択`}
      >
        <span className="kd-crow__sha">{commit.shortSha}</span>
        <span className="kd-crow__subject">{commit.subject}</span>
        <span className="kd-crow__meta">{commit.relative}</span>
      </button>
    </div>
  );
}
