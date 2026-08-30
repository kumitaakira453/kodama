import { useState } from "react";

import { faceOf } from "../../lib/author";
import { relativeTime } from "../../lib/time";
import type { AnchorState, Comment, ThreadView } from "../../lib/types";
import { Icon } from "../ui/Icon";
import { CommentBody } from "./CommentBody";

/** 対象が今どうなっているかを自然言語で示す。列挙子の意味を読み手に推測させない。 */
function describeAnchor(anchor: AnchorState): string | null {
  switch (anchor.kind) {
    case "unchanged":
      return null;
    case "moved":
      return `対象は ${anchor.line} 行目へ移動しています`;
    case "rewritten":
      return "対象は指摘のあと書き換わっています";
    case "removed":
      return "対象は消えています";
    case "committed":
      return `対象はコミット ${anchor.sha.slice(0, 7)} に取り込まれています`;
    case "noFile":
      return "ファイルが見つかりません";
  }
}

interface ThreadCardProps {
  view: ThreadView;
  onReply: (id: string, body: string) => void;
  onEdit: (id: string, commentId: string, body: string) => void;
  onRemove: (id: string, commentId: string) => void;
  onResolve: (id: string) => void;
  onDrop: (id: string) => void;
}

/**
 * 1 つの指摘。
 *
 * 送信済みの発言は枠を持たない地の文、書きかけの入力欄だけが枠を持つ。
 * 同じ形で並べると、送ったのかこれから送るのかが形から読めない。
 * 左端は発言も入力欄も揃える。段が違うと、同じ話の続きに見えない。
 */
export function ThreadCard({
  view,
  onReply,
  onEdit,
  onRemove,
  onResolve,
  onDrop,
}: ThreadCardProps) {
  const [body, setBody] = useState("");
  const notice = describeAnchor(view.anchor);
  const lost =
    view.anchor.kind === "removed" || view.anchor.kind === "noFile";
  // 未コミットに書いたものが、この比較に取り込まれて出ている状態。
  const absorbed = view.anchor.kind === "committed";

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    onReply(view.thread.id, text);
    setBody("");
  };

  return (
    <div
      className="kd-thread"
      data-lost={lost || undefined}
      data-absorbed={absorbed || undefined}
    >
      <div className="kd-thread__head">
        <span className="kd-thread__where">
          {view.thread.side === "old" ? "変更前" : "変更後"}{" "}
          {view.thread.lineStart === view.thread.lineEnd
            ? `${view.thread.lineStart} 行目`
            : `${view.thread.lineStart}–${view.thread.lineEnd} 行目`}
        </span>
        <span className="kd-thread__id">#{view.thread.id}</span>
        {absorbed ? (
          <span
            className="kd-thread__origin"
            title="未コミットの変更に書かれ、このコミットに取り込まれた指摘"
          >
            <Icon name="move_down" size={12} />
            取り込まれた指摘
          </span>
        ) : null}
        {notice ? (
          <span className="kd-thread__notice">
            <Icon name="alt_route" size={13} />
            {notice}
          </span>
        ) : null}
        <span className="kd-thread__spacer" />
        <button
          className="kd-thread__action"
          onClick={() => onResolve(view.thread.id)}
          title="対応したので解決済みにする"
        >
          <Icon name="check_circle" size={14} />
          解決
        </button>
        {lost ? (
          <button
            className="kd-thread__action"
            onClick={() => onDrop(view.thread.id)}
            title="対象が消えたので取り下げる"
          >
            <Icon name="do_not_disturb_on" size={14} />
            取り下げ
          </button>
        ) : null}
      </div>

      <ul className="kd-thread__list">
        {view.thread.comments.map((c) => (
          <CommentRow
            key={c.id}
            comment={c}
            onEdit={(text) => onEdit(view.thread.id, c.id, text)}
            onRemove={() => onRemove(view.thread.id, c.id)}
          />
        ))}
      </ul>

      <div className="kd-thread__reply">
        <textarea
          className="kd-textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.metaKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="返信する（⌘Enter で送信）"
          rows={2}
        />
        <div className="kd-thread__replyfoot">
          <button
            className="kd-btn kd-btn--primary kd-btn--sm"
            onClick={submit}
            disabled={!body.trim()}
          >
            返信
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 発言 1 つ。自分が書いたものだけ直せる。
 *
 * 他人（AI）の発言を書き換えられると、会話の記録が記録でなくなる。
 */
function CommentRow({
  comment,
  onEdit,
  onRemove,
}: {
  comment: Comment;
  onEdit: (body: string) => void;
  onRemove: () => void;
}) {
  const face = faceOf(comment.author);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);

  const save = () => {
    const text = draft.trim();
    if (text && text !== comment.body) onEdit(text);
    setEditing(false);
  };

  return (
    <li className="kd-comment" data-who={face.kind}>
      <div className="kd-comment__meta">
        <span className="kd-comment__avatar" aria-hidden>
          <Icon name={face.icon} size={13} />
        </span>
        <span className="kd-comment__author">{face.label}</span>
        <span className="kd-comment__time">{relativeTime(comment.createdAt)}</span>
        {face.kind === "you" && !editing ? (
          <span className="kd-comment__tools">
            <button
              className="kd-comment__tool"
              onClick={() => {
                setDraft(comment.body);
                setEditing(true);
              }}
              title="書き直す"
            >
              <Icon name="edit" size={13} />
            </button>
            <button
              className="kd-comment__tool"
              onClick={onRemove}
              title="消す"
            >
              <Icon name="delete" size={13} />
            </button>
          </span>
        ) : null}
      </div>

      {editing ? (
        <div className="kd-comment__edit">
          <textarea
            className="kd-textarea"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.metaKey) {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") setEditing(false);
            }}
            rows={3}
          />
          <div className="kd-thread__replyfoot">
            <button
              className="kd-btn kd-btn--sm"
              onClick={() => setEditing(false)}
            >
              やめる
            </button>
            <button
              className="kd-btn kd-btn--primary kd-btn--sm"
              onClick={save}
              disabled={!draft.trim()}
            >
              保存
            </button>
          </div>
        </div>
      ) : (
        <div className="kd-comment__text">
          <CommentBody text={comment.body} />
        </div>
      )}
    </li>
  );
}
