import { useLayoutEffect, useRef, useState } from "react";

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
 * 発言は枠を持たない。並ぶのは、顔・名前・時刻の 1 行と本文だけ。返信欄は
 * 書き始めるまで 1 行に畳んでおく。空の入力欄が常に開いていると、送信済みの
 * 発言と同じ重さで居座り、どこまでが交わした話なのか分からなくなる。
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
  const me = faceOf("you");

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
            取り込まれた
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
        {view.thread.comments.map((c, i) => (
          <CommentRow
            key={c.id}
            comment={c}
            /* 引用は最初の発言にだけ添える。返信ごとに繰り返すと、
               何に対する話かより引用のほうが場所を取る。 */
            quote={i === 0 ? view.thread.quote : null}
            onEdit={(text) => onEdit(view.thread.id, c.id, text)}
            onRemove={() => onRemove(view.thread.id, c.id)}
          />
        ))}
      </ul>

      <div className="kd-reply">
        <span className="kd-face" data-who={me.kind} aria-hidden>
          {me.initial}
        </span>
        <div className="kd-reply__body">
          {/* 入力欄は最初から出しておき、伸びるのは高さだけ。書き始めた
              とたんに別の形が現れると、押した先が変わったように見える。 */}
          <GrowingArea
            value={body}
            onChange={setBody}
            onSubmit={submit}
            placeholder="返信する（⌘Enter で送信）"
          />
          {body.trim() ? (
            <div className="kd-reply__foot">
              <button className="kd-btn kd-btn--sm" onClick={() => setBody("")}>
                キャンセル
              </button>
              <button
                className="kd-btn kd-btn--primary kd-btn--sm"
                onClick={submit}
              >
                返信
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * 中身に合わせて伸びる入力欄。
 *
 * 行数を固定すると、短い返信には広すぎ、長い返信には足りない。伸びるのは
 * 高さだけで、枠の幅も位置も変わらない。
 */
function GrowingArea({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 一度縮めてから測る。減らしたときに前の高さが残らない。
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_AREA_H)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className="kd-textarea kd-textarea--grow"
      value={value}
      autoFocus={autoFocus}
      placeholder={placeholder}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.metaKey) {
          e.preventDefault();
          onSubmit();
        }
        if (e.key === "Escape") onCancel?.();
      }}
    />
  );
}

/** 入力欄が伸びる上限。これを超えたら中でスクロールする。 */
const MAX_AREA_H = 220;

/**
 * 発言 1 つ。自分が書いたものだけ直せる。
 *
 * 他人（AI）の発言を書き換えられると、会話の記録が記録でなくなる。
 */
function CommentRow({
  comment,
  quote,
  onEdit,
  onRemove,
}: {
  comment: Comment;
  quote: string | null;
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
      <span className="kd-face" data-who={face.kind} aria-hidden>
        {face.initial}
      </span>

      <div className="kd-comment__main">
        <div className="kd-comment__meta">
          <span className="kd-comment__author">{face.label}</span>
          <span className="kd-comment__time">
            {relativeTime(comment.createdAt)}
          </span>
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
              <button className="kd-comment__tool" onClick={onRemove} title="消す">
                <Icon name="delete" size={13} />
              </button>
            </span>
          ) : null}
        </div>

        {quote ? <blockquote className="kd-quote">{quote}</blockquote> : null}

        {editing ? (
          <div className="kd-comment__edit">
            <GrowingArea
              value={draft}
              onChange={setDraft}
              onSubmit={save}
              onCancel={() => setEditing(false)}
              autoFocus
            />
            <div className="kd-reply__foot">
              <button
                className="kd-btn kd-btn--sm"
                onClick={() => setEditing(false)}
              >
                キャンセル
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
      </div>
    </li>
  );
}
