import { useAtom, useAtomValue } from "jotai";
import { useCallback } from "react";

import {
  PSEUDO_LABELS,
  describeSelection,
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

const PSEUDO_ORDER: { id: PseudoId; icon: string }[] = [
  { id: "uncommitted", icon: "edit_note" },
  { id: "staged", icon: "playlist_add_check" },
  { id: "unstaged", icon: "pending_actions" },
  { id: "branch", icon: "account_tree" },
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
      title="比較対象を選ぶ"
      width={420}
    >
      {(close) => (
        <div className="kd-revmenu">
          {PSEUDO_ORDER.map(({ id, icon }) => {
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
            {range && range.count > 1 ? (
              <span className="kd-revmenu__badge">{range.count} 件</span>
            ) : null}
          </div>

          <div className="kd-revmenu__list">
            {commits.map((c) => (
              <CommitRow
                key={c.sha}
                commit={c}
                selected={isInSelection(c.sha, selection, commits)}
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
            チェックで範囲を伸ばし、行のクリックで 1 件だけ選びます。
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
        <span className="kd-revrow__sha">{commit.shortSha}</span>
        <span className="kd-revrow__text">{commit.subject}</span>
        <span className="kd-revrow__meta">{commit.relative}</span>
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
