import { useAtom, useAtomValue } from "jotai";
import { useState } from "react";

import {
  PSEUDO_LABELS,
  covers,
  describeSelection,
  explainSelection,
  isInSelection,
  resolveRange,
  stepRange,
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
 * 並べただけでは互いに排他に見えるが、実際は「未コミットの変更」が
 * 「ステージ済み」と「未ステージ」を含む。字下げとチェックで関係を示す。
 */
const WORKING: { id: PseudoId; icon: string; child: boolean }[] = [
  { id: "uncommitted", icon: "edit_note", child: false },
  { id: "staged", icon: "playlist_add_check", child: true },
  { id: "unstaged", icon: "pending_actions", child: true },
];

type Tab = "commits" | "working";

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
          {describeSelection(selection, commits)}
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
  const [tab, setTab] = useState<Tab>(() => initialTab(selection));

  const commits = revisions?.commits ?? [];
  const defaultBase = revisions?.defaultBase ?? null;
  const allCommits = draft ? covers(draft, "branch") : false;
  const range = draft ? resolveRange(draft, commits) : null;
  const count = allCommits ? commits.length : (range?.count ?? 0);

  /** その選択肢そのものが選ばれているか。親に含まれているだけの状態と区別する。 */
  const isExactly = (id: PseudoId) =>
    draft?.kind === "pseudo" && draft.id === id;

  /** 押し直したら外す。含まれているだけなら、そこまで絞り込む。 */
  const togglePseudo = (id: PseudoId) =>
    setDraft(isExactly(id) ? null : { kind: "pseudo", id });

  const toggleCommit = (sha: string) =>
    setDraft((prev) => stepRange(prev, commits, sha));

  return (
    <Modal
      title="比較対象を選ぶ"
      size="sm"
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
        <PickRow
          label={PSEUDO_LABELS.everything}
          detail={
            defaultBase
              ? `${defaultBase} との分岐点から、未コミットの変更まで`
              : "最初のコミットから、未コミットの変更まで"
          }
          icon="all_inclusive"
          checked={draft ? covers(draft, "everything") : false}
          onToggle={() => togglePseudo("everything")}
        />

        <div className="kd-tabs" role="tablist">
          <button
            className="kd-tab"
            role="tab"
            aria-selected={tab === "commits"}
            onClick={() => setTab("commits")}
          >
            コミット
            {count > 0 ? <span className="kd-tab__count">{count}</span> : null}
          </button>
          <button
            className="kd-tab"
            role="tab"
            aria-selected={tab === "working"}
            onClick={() => setTab("working")}
          >
            未コミット
          </button>
        </div>

        {tab === "commits" ? (
          <>
            <PickRow
              label={PSEUDO_LABELS.branch}
              detail={
                defaultBase
                  ? `${defaultBase} との分岐点から ${commits.length} コミット`
                  : `最初のコミットから ${commits.length} コミット`
              }
              checked={allCommits}
              disabled={commits.length === 0}
              onToggle={() => togglePseudo("branch")}
            />

            <div className="kd-revmenu__list">
              {commits.map((c) => (
                <CommitRow
                  key={c.sha}
                  commit={c}
                  selected={
                    draft ? isInSelection(c.sha, draft, commits) : false
                  }
                  onToggle={() => toggleCommit(c.sha)}
                />
              ))}
              {commits.length === 0 ? (
                <p className="kd-revmenu__note">
                  このブランチで積んだコミットはありません
                </p>
              ) : null}
            </div>

            <p className="kd-revmenu__hint">
              2 つ目を押すと、そのあいだのコミットも入ります。範囲の外を押すと
              そこまで広がり、中を押すとその行から下が外れます。
            </p>
          </>
        ) : (
          WORKING.map(({ id, icon, child }) => (
            <PickRow
              key={id}
              label={PSEUDO_LABELS[id]}
              detail={workingDetail(id, status)}
              icon={icon}
              child={child}
              checked={draft ? covers(draft, id) : false}
              onToggle={() => togglePseudo(id)}
            />
          ))
        )}
      </div>
    </Modal>
  );
}

/** チェックひとつの選択肢。親に含まれているときもチェックが付く。 */
function PickRow({
  label,
  detail,
  icon,
  checked,
  onToggle,
  disabled = false,
  child = false,
}: {
  label: string;
  detail: string;
  icon?: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  child?: boolean;
}) {
  return (
    <div
      className="kd-revrow"
      data-selected={checked || undefined}
      data-child={child || undefined}
    >
      <label className="kd-revrow__box">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
          aria-label={label}
        />
      </label>
      <button className="kd-revrow__body" disabled={disabled} onClick={onToggle}>
        <span className="kd-revrow__line">
          {icon ? (
            <Icon name={icon} size={15} className="kd-revrow__icon" />
          ) : null}
          <span className="kd-revrow__text">{label}</span>
        </span>
        <span className="kd-revrow__sub">{detail}</span>
      </button>
    </div>
  );
}

/**
 * コミット 1 行。行のどこを押しても同じ挙動にする。
 *
 * 小さなチェックボックスだけを範囲の操作にし、広い本体を「1 件だけ選ぶ」に
 * していると、押しやすいほうが毎回選択を 1 件に潰すので複数選べなくなる。
 */
function CommitRow({
  commit,
  selected,
  onToggle,
}: {
  commit: CommitInfo;
  selected: boolean;
  onToggle: () => void;
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
        onClick={onToggle}
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

function initialTab(selection: CommitSelection): Tab {
  if (selection.kind === "commits") return "commits";
  return selection.id === "uncommitted" ||
    selection.id === "staged" ||
    selection.id === "unstaged"
    ? "working"
    : "commits";
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
