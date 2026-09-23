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
import type { BaseRef, CommitInfo, WorktreeStatus } from "../../lib/types";
import {
  baseOverridesAtom,
  commitSelectionAtom,
  revisionsAtom,
  threadMarksAtom,
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
  // 一覧の説明には、いま効いている起点を使う。既定とは限らない。
  const base = revisions?.base ?? null;

  return (
    <div className="kd-dd">
      <button
        className="kd-dd__button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title={explainSelection(selection, commits, base)}
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
/** 疑似エントリと保存キーの綴りの対応。未ステージだけ working になる。 */
const WORKING_KEYS: Record<string, string> = {
  uncommitted: "uncommitted",
  staged: "staged",
  unstaged: "working",
};

function RevisionDialog({ onClose }: { onClose: () => void }) {
  const revisions = useAtomValue(revisionsAtom);
  const worktree = useAtomValue(selectedWorktreeAtom);
  const status = useAtomValue(statusesAtom)[worktree ?? ""];
  const [selection, setSelection] = useAtom(commitSelectionAtom);
  const [draft, setDraft] = useState<CommitSelection | null>(selection);
  const [tab, setTab] = useState<Tab>(() => initialTab(selection));
  const [picking, setPicking] = useState(false);
  const marks = useAtomValue(threadMarksAtom);

  const commits = revisions?.commits ?? [];
  const base = revisions?.base ?? null;
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
              ? explainSelection(draft, commits, base)
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
        <BasePicker
          open={picking}
          onToggle={() => setPicking((v) => !v)}
          onDone={() => setPicking(false)}
        />

        <PickRow
          threads={marks.byKey[`everything:${worktree}`] ?? 0}
          label={PSEUDO_LABELS.everything}
          detail={
            base
              ? `${base} との分岐点から、未コミットの変更まで`
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
              threads={marks.ranged}
              label={PSEUDO_LABELS.branch}
              detail={
                base
                  ? `${base} との分岐点から ${commits.length} コミット`
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
                  threads={marks.byCommit[c.sha] ?? 0}
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
              threads={marks.byKey[`${WORKING_KEYS[id]}:${worktree}`] ?? 0}
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

/**
 * 比較の起点。押すとその場で下に開く。
 *
 * 浮かせない。ダイアログの中で浮かせると、枝の名前に合わせて広げた分が
 * そのまま外へはみ出す。
 *
 * 画面も移さない。選ぶのは ref 1 つで、移るほどの重さがない。押した結果
 * ダイアログの中身が丸ごと入れ替わると、何が起きたのか読み取れない。
 *
 * 下に開けば、幅はダイアログの幅で決まり、覆うものも移る先も無い。
 */
function BasePicker({
  open,
  onToggle,
  onDone,
}: {
  open: boolean;
  onToggle: () => void;
  onDone: () => void;
}) {
  const worktree = useAtomValue(selectedWorktreeAtom);
  const revisions = useAtomValue(revisionsAtom);
  const [overrides, setOverrides] = useAtom(baseOverridesAtom);

  const base = revisions?.base ?? null;
  const overridden = Boolean(worktree && overrides[worktree]);

  const pick = (name: string | null) => {
    if (worktree) {
      setOverrides((prev) => {
        const next = { ...prev };
        if (name === null) delete next[worktree];
        else next[worktree] = name;
        return next;
      });
    }
    onDone();
  };

  return (
    <div className="kd-basepick">
      <div className="kd-basepick__row">
        <span className="kd-basepick__label">起点</span>
        <button
          className="kd-basepick__button"
          onClick={onToggle}
          aria-expanded={open}
        >
          <Icon name="alt_route" size={15} />
          <span className="kd-basepick__name">{base ?? "分岐元なし"}</span>
          {overridden ? (
            <span className="kd-basepick__note">既定から変更中</span>
          ) : null}
          <Icon name={open ? "expand_less" : "expand_more"} size={16} />
        </button>
      </div>

      {open ? (
        <div className="kd-basepick__list">
          <BaseList
            bases={revisions?.bases ?? []}
            base={base}
            defaultBase={revisions?.defaultBase ?? null}
            overridden={overridden}
            onPick={pick}
          />
        </div>
      ) : null}
    </div>
  );
}


/**
 * 起点の候補。数が多いので絞り込みを付ける。
 *
 * 枝は溜まる。一覧を上から目で追わせると、目的の枝に着くまでに何度も
 * 巻き戻すことになる。
 */
function BaseList({
  bases,
  base,
  defaultBase,
  overridden,
  onPick,
}: {
  bases: BaseRef[];
  base: string | null;
  defaultBase: string | null;
  overridden: boolean;
  onPick: (name: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const defaultRef = bases.find((b) => b.name === defaultBase) ?? null;
  const shown = bases.filter(
    (b) =>
      b.name !== defaultBase &&
      (needle === "" || b.name.toLowerCase().includes(needle)),
  );

  return (
    <>
      {bases.length > 6 ? (
        <div className="kd-basefilter">
          <Icon name="search" size={14} />
          <input
            className="kd-basefilter__input"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            placeholder="枝を絞り込む"
            spellCheck={false}
          />
        </div>
      ) : null}

      <div className="kd-basemenu">
        {defaultBase &&
        (needle === "" || defaultBase.toLowerCase().includes(needle)) ? (
          <BaseRow
            name={defaultBase}
            detail={defaultRef}
            selected={!overridden}
            isDefault
            onPick={() => onPick(null)}
          />
        ) : null}

        {shown.map((b) => (
          <BaseRow
            key={b.name}
            name={b.name}
            detail={b}
            selected={b.name === base}
            onPick={() => onPick(b.name)}
          />
        ))}
      </div>

      {bases.length === 0 ? (
        <p className="kd-revmenu__note">比べられる枝がありません</p>
      ) : null}
      {bases.length > 0 && shown.length === 0 && needle !== "" ? (
        <p className="kd-revmenu__note">一致する枝がありません</p>
      ) : null}
    </>
  );
}

/** 起点 1 件。名前・最終コミット・時刻を、worktree の一覧と同じ並びで出す。 */
function BaseRow({
  name,
  detail,
  selected,
  isDefault = false,
  onPick,
}: {
  name: string;
  detail: BaseRef | null;
  selected: boolean;
  isDefault?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      className="kd-baserow"
      data-selected={selected || undefined}
      onClick={onPick}
      title={name}
    >
      <span className="kd-baserow__title">
        <span className="kd-baserow__name">{name}</span>
        {isDefault ? <span className="kd-baserow__tag">分岐元</span> : null}
        {detail && !detail.remote ? (
          <span className="kd-baserow__local">手元</span>
        ) : null}
      </span>
      {detail?.subject ? (
        <span className="kd-baserow__subject">{detail.subject}</span>
      ) : null}
      <span className="kd-baserow__meta">
        <span className="kd-baserow__time">{detail?.relative ?? ""}</span>
      </span>
    </button>
  );
}

/**
 * その比較に残っている指摘の印。
 *
 * 選ぶ前に分かる必要がある。選んで初めて見えるなら、どこに残っているかを
 * 総当たりで探すことになる。
 */
function ThreadMark({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="kd-revrow__threads" title={`未解決の指摘 ${count} 件`}>
      <Icon name="chat_bubble" size={11} />
      {count}
    </span>
  );
}

/** チェックひとつの選択肢。親に含まれているときもチェックが付く。 */
function PickRow({
  threads,
  label,
  detail,
  icon,
  checked,
  onToggle,
  disabled = false,
  child = false,
}: {
  /** 未解決の指摘の数。0 なら何も出さない。 */
  threads: number;
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
          <ThreadMark count={threads} />
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
  threads,
  commit,
  selected,
  onToggle,
}: {
  threads: number;
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
          <ThreadMark count={threads} />
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
