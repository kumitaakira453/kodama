import { useState } from "react";

import { faceOf } from "../../lib/author";
import { relativeTime } from "../../lib/time";
import type { AnchorState, ThreadView } from "../../lib/types";
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
  onResolve: (id: string) => void;
  onDrop: (id: string) => void;
}

export function ThreadCard({
  view,
  onReply,
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
          <span className="kd-thread__origin" title="未コミットの変更に書かれ、このコミットに取り込まれた指摘">
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
        {view.thread.comments.map((c) => {
          const face = faceOf(c.author);
          return (
            <li key={c.id} className="kd-comment" data-who={face.kind}>
              <span className="kd-comment__avatar" aria-hidden>
                <Icon name={face.icon} size={14} />
              </span>
              <div className="kd-comment__main">
                {/* 名前と時刻は吹き出しの外に置く。中に入れると、書いた内容と
                    同じ重みで読まされる。 */}
                <div className="kd-comment__meta">
                  <span className="kd-comment__author">{face.label}</span>
                  <span className="kd-comment__time">
                    {relativeTime(c.createdAt)}
                  </span>
                </div>
                <div className="kd-comment__bubble">
                  <CommentBody text={c.body} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="kd-thread__reply">
        <span className="kd-comment__avatar" data-who="you" aria-hidden>
          <Icon name="person" size={14} />
        </span>
        <div className="kd-thread__replybody">
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
          {/* 送るボタンは書き終わりの側に置く。入力欄の横だと、書いている
              途中の視線の先から外れる。 */}
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
    </div>
  );
}
