import { useAtom, useAtomValue } from "jotai";
import { useState } from "react";

import {
  PSEUDO_LABELS,
  describeSelection,
  explainSelection,
  isInSelection,
  resolveRange,
  type CommitSelection,
  type PseudoId,
} from "../../lib/revisions";
import type { CommitInfo, WorktreeStatus } from "../../lib/types";
import {
  commitSelectionAtom,
  revisionsAtom,
  selectedWorktreeAtom,
  statusesAtom,
} from "../../state/atoms";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";

/**
 * 未コミット側の選択肢。`uncommitted` が親で、残りはその一部。
 *
 * 並べただけでは互いに排他に見えるが、実際は `未コミットの変更` が
 * `ステージ済み` と `未ステージ` を含む。字下げでその関係を示す。
 */
const WORKING: { id: PseudoId; icon: string; child: boolean }[] = [
  { id: "uncommitted", icon: "edit_note", child: false },
  { id: "staged", icon: "playlist_add_check", child: true },
  { id: "unstaged", icon: "pending_actions", child: true },
];

/** 比較対象を選ぶ。押すとダイアログが開く。 */
export function RevisionMenu() {
  const revisions = useAtomValue(revisionsAtom);
  const selection = useAtomValue(commitSelectionAtom);
  const [open, setOpen] = useState(false);

  const commits = revisions?.commits ?? [];
  const defaultBase = revisions?.defaultBase ?? null;

  return (
    <div className="kd-dd">
      <button
        className="kd-dd__button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title={explainSelection(selection, commits, defaultBase)}
      >
        <Icon name="difference" size={15} />
        <span className="kd-dd__label">
          {describeSelection(selection, commits, defaultBase)}
        </span>
        <Icon name="expand_more" size={16} />
      </button>

      {open ? <RevisionDialog onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

/**
 * 比較対象のダイアログ。
 *
 * 選んだ端から差分を読み直すと、範囲を組み立てているあいだじゅう待たされ、
 * 読み込みでダイアログが閉じてしまう。ここでは下書きだけを動かし、
 * 適用したときに一度だけ反映する。
 */
function RevisionDialog({ onClose }: { onClose: () => void }) {
  const revisions = useAtomValue(revisionsAtom);
  const worktree = useAtomValue(selectedWorktreeAtom);
  const status = useAtomValue(statusesAtom)[worktree ?? ""];
  const [selection, setSelection] = useAtom(commitSelectionAtom);
  const [draft, setDraft] = useState<CommitSelection | null>(selection);

  const commits = revisions?.commits ?? [];
  const defaultBase = revisions?.defaultBase ?? null;
  const branchSelected =
    draft?.kind === "pseudo" &&
    (draft.id === "branch" || draft.id === "everything");
  const range = draft ? resolveRange(draft, commits) : null;
  const count = branchSelected ? commits.length : (range?.count ?? 0);

  const pick = (id: PseudoId) => setDraft({ kind: "pseudo", id });

  /** 起点を保ったまま、押した行まで選択を伸ばす / 縮める。 */
  const extendTo = (sha: string) =>
    setDraft((prev) => {
      if (prev?.kind !== "commits") {
        return { kind: "commits", anchor: sha, focus: sha };
      }
      // 1 件だけ選んでいるものを押し直したら外す。
      if (prev.anchor === sha && prev.focus === sha) return null;
      return { kind: "commits", anchor: prev.anchor, focus: sha };
    });

  return (
    <Modal
      title="比較対象を選ぶ"
      onClose={onClose}
      footer={
        <>
          <p className="kd-modal__note">
            {draft
              ? explainSelection(draft, commits, defaultBase)
              : "何も選ばれていません"}
          </p>
          <span className="kd-modal__actions">
            <Button onClick={onClose}>キャンセル</Button>
            <Button
              variant="primary"
              disabled={!draft}
              onClick={() => {
                if (!draft) return;
                setSelection(draft);
                onClose();
              }}
            >
              適用
            </Button>
          </span>
        </>
      }
    >
      <div className="kd-revmenu">
        <PseudoRow
          id="everything"
          icon="all_inclusive"
          detail={
            defaultBase
              ? `${defaultBase} との分岐点から、未コミットの変更まで`
              : "比較元のブランチが見つかりません"
          }
          disabled={!defaultBase}
          selected={draft?.kind === "pseudo" && draft.id === "everything"}
          onSelect={() => pick("everything")}
        />

        <div className="kd-revmenu__sep">
          <span>コミット</span>
          {count > 1 ? (
            <span className="kd-revmenu__badge">{count} 件</span>
          ) : null}
        </div>

        <div className="kd-revrow" data-selected={branchSelected || undefined}>
          <label className="kd-revrow__box" title="一覧すべてを選ぶ">
            <input
              type="checkbox"
              checked={branchSelected}
              disabled={!defaultBase}
              // 押し直したら外れる。何も選ばれていなければ適用できない。
              onChange={() => setDraft(branchSelected ? null : { kind: "pseudo", id: "branch" })}
              aria-label="すべてのコミットを選択"
            />
          </label>
          <button
            className="kd-revrow__body"
            disabled={!defaultBase}
            onClick={() =>
              setDraft(branchSelected ? null : { kind: "pseudo", id: "branch" })
            }
          >
            <span className="kd-revrow__line">
              <span className="kd-revrow__text">
                {PSEUDO_LABELS.branch}
              </span>
            </span>
            <span className="kd-revrow__sub">
              {defaultBase
                ? `${defaultBase} との分岐点から ${commits.length} コミット`
                : "比較元のブランチが見つかりません"}
            </span>
          </button>
        </div>

        <div className="kd-revmenu__list">
          {commits.map((c) => (
            <CommitRow
              key={c.sha}
              commit={c}
              selected={draft ? isInSelection(c.sha, draft, commits) : false}
              onToggle={() => extendTo(c.sha)}
              onSelectOnly={() =>
                setDraft({ kind: "commits", anchor: c.sha, focus: c.sha })
              }
            />
          ))}
          {commits.length === 0 ? (
            <p className="kd-revmenu__note">
              このブランチで積んだコミットはありません
            </p>
          ) : null}
        </div>

        <div className="kd-revmenu__sep">
          <span>未コミット</span>
        </div>

        {WORKING.map(({ id, icon, child }) => {
          const detail = workingDetail(id, status);
          return (
            <PseudoRow
              key={id}
              id={id}
              icon={icon}
              child={child}
              detail={detail}
              selected={draft?.kind === "pseudo" && draft.id === id}
              onSelect={() => pick(id)}
            />
          );
        })}

        <p className="kd-revmenu__hint">
          コミットはチェックを付けたところまで範囲が伸びます。行のクリックで
          1 件だけ選べます。
        </p>
      </div>
    </Modal>
  );
}

function PseudoRow({
  id,
  icon,
  detail,
  selected,
  onSelect,
  disabled = false,
  child = false,
}: {
  id: PseudoId;
  icon: string;
  detail: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  child?: boolean;
}) {
  return (
    <button
      className="kd-revrow kd-revrow--pseudo"
      data-selected={selected || undefined}
      data-child={child || undefined}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="kd-revrow__box">
        <Icon
          name={selected ? "radio_button_checked" : "radio_button_unchecked"}
          size={15}
        />
      </span>
      <Icon name={icon} size={15} className="kd-revrow__icon" />
      <span className="kd-revrow__body">
        <span className="kd-revrow__line">
          <span className="kd-revrow__text">{PSEUDO_LABELS[id]}</span>
        </span>
        <span className="kd-revrow__sub">{detail}</span>
      </span>
    </button>
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

function workingDetail(id: PseudoId, status: WorktreeStatus | undefined): string {
  if (!status) return "";
  const count =
    id === "uncommitted"
      ? status.stagedCount + status.unstagedCount + status.untrackedCount
      : id === "staged"
        ? status.stagedCount
        : status.unstagedCount + status.untrackedCount;
  return count > 0 ? `${count} ファイル` : "変更なし";
}
