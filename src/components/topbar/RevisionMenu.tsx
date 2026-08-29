import { useAtom, useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";

import {
  PSEUDO_LABELS,
  describeSelection,
  explainSelection,
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
import { Dropdown } from "../ui/Dropdown";
import { Icon } from "../ui/Icon";

/**
 * 作業ツリーの状態。どれか 1 つを選ぶ。
 *
 * 「ブランチ全体」はここに並べない。あれは分岐点から現在までのコミットを選ぶ
 * ことそのものなので、コミットの側に置いて、該当するコミットにチェックが
 * 付くようにする。
 */
const WORKTREE_ORDER: { id: PseudoId; icon: string }[] = [
  { id: "uncommitted", icon: "edit_note" },
  { id: "staged", icon: "playlist_add_check" },
  { id: "unstaged", icon: "pending_actions" },
];

/** 比較対象を選ぶ。専用ペインは持たせず、上部バーのドロップダウンに畳む。 */
export function RevisionMenu() {
  const revisions = useAtomValue(revisionsAtom);
  const worktree = useAtomValue(selectedWorktreeAtom);
  const status = useAtomValue(statusesAtom)[worktree ?? ""];
  const [selection, setSelection] = useAtom(commitSelectionAtom);

  const commits = revisions?.commits ?? [];
  const defaultBase = revisions?.defaultBase ?? null;
  const range = resolveRange(selection, commits);
  const branchShas = useMemo(
    () => new Set(revisions?.branchShas ?? []),
    [revisions],
  );
  const branchSelected =
    selection.kind === "pseudo" && selection.id === "branch";
  const selectedCount = branchSelected ? branchShas.size : (range?.count ?? 0);

  /**
   * チェックは起点を保ったまま、押した行まで選択を伸ばす / 縮める。
   * 間を飛ばして押すと、あいだのコミットも選択に入る。
   *
   * 飛び飛びの選択は扱わない。「この n 件だけの合成差分」に相当する git の表現が
   * 無く、cherry-pick 相当の合成が要るうえ結果が競合しうる。
   */
  const extendTo = useCallback(
    (sha: string) => {
      setSelection((prev) =>
        prev.kind === "commits"
          ? { kind: "commits", anchor: prev.anchor, focus: sha }
          : { kind: "commits", anchor: sha, focus: sha },
      );
    },
    [setSelection],
  );

  return (
    <Dropdown
      icon="difference"
      label={describeSelection(selection, commits, defaultBase)}
      title={explainSelection(selection, commits, defaultBase)}
      width={420}
    >
      {(close) => (
        <div className="kd-revmenu">
          <div className="kd-revmenu__sep">
            <span>作業ツリー</span>
          </div>

          {WORKTREE_ORDER.map(({ id, icon }) => {
            const detail = pseudoDetail(id, status, defaultBase);
            const selected = selection.kind === "pseudo" && selection.id === id;
            return (
              <button
                key={id}
                className="kd-revrow"
                data-selected={selected || undefined}
                data-empty={detail.count === 0 || undefined}
                title={detail.title}
                onClick={() => {
                  setSelection({ kind: "pseudo", id });
                  close();
                }}
              >
                <span className="kd-revrow__box">
                  <Icon
                    name={
                      selected ? "radio_button_checked" : "radio_button_unchecked"
                    }
                    size={15}
                  />
                </span>
                <Icon name={icon} size={15} className="kd-revrow__icon" />
                <span className="kd-revrow__text">{PSEUDO_LABELS[id]}</span>
                <span className="kd-revrow__meta">{detail.suffix}</span>
              </button>
            );
          })}

          <div className="kd-revmenu__sep">
            <span>コミット</span>
            {selectedCount > 1 ? (
              <span className="kd-revmenu__badge">{selectedCount} 件</span>
            ) : null}
          </div>

          <div className="kd-revrow" data-selected={branchSelected || undefined}>
            <label
              className="kd-revrow__box"
              title="分岐点から現在までをまとめて選ぶ"
            >
              <input
                type="checkbox"
                checked={branchSelected}
                disabled={!defaultBase}
                onChange={() => setSelection({ kind: "pseudo", id: "branch" })}
                aria-label="すべてのコミットを選択"
              />
            </label>
            <button
              className="kd-revrow__body"
              disabled={!defaultBase}
              onClick={() => setSelection({ kind: "pseudo", id: "branch" })}
              title={pseudoDetail("branch", status, defaultBase).title}
            >
              <span className="kd-revrow__line">
                <span className="kd-revrow__text">すべてのコミット</span>
              </span>
              <span className="kd-revrow__sub">
                {defaultBase
                  ? `${defaultBase} との分岐点から ${branchShas.size} コミット`
                  : "比較元のブランチが見つかりません"}
              </span>
            </button>
          </div>

          <div className="kd-revmenu__list">
            {commits.map((c) => (
              <CommitRow
                key={c.sha}
                commit={c}
                selected={isInSelection(c.sha, selection, commits, branchShas)}
                onToggle={() => extendTo(c.sha)}
                onSelectOnly={() =>
                  setSelection({ kind: "commits", anchor: c.sha, focus: c.sha })
                }
              />
            ))}
            {commits.length === 0 ? (
              <p className="kd-revmenu__note">コミットがありません</p>
            ) : null}
          </div>

          <p className="kd-revmenu__hint">
            チェックを付けたところまで範囲が伸びます。間を飛ばして押すと、
            あいだのコミットもまとめて入ります。行のクリックで 1 件だけ選べます。
          </p>
        </div>
      )}
    </Dropdown>
  );
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
    <div className="kd-revrow" data-selected={selected || undefined}>
      <label className="kd-revrow__box" title="ここまで選択を伸ばす">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`${commit.shortSha} までを選択`}
        />
      </label>
      <button
        className="kd-revrow__body"
        onClick={onSelectOnly}
        title={`${commit.sha}\n${commit.author}\n${commit.subject}`}
      >
        <span className="kd-revrow__line">
          <span className="kd-revrow__text">{commit.subject}</span>
          <span className="kd-revrow__sha">{commit.shortSha}</span>
        </span>
        <span className="kd-revrow__sub">
          {commit.author} · {commit.relative}
        </span>
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
    suffix: count > 0 ? `${count} ファイル` : "変更なし",
    title: count > 0 ? `${count} ファイル` : "変更はありません",
    count,
  };
}
