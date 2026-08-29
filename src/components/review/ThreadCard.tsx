import { useState } from "react";

import type { AnchorState, ThreadView } from "../../lib/types";
import { Icon } from "../ui/Icon";

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

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    onReply(view.thread.id, text);
    setBody("");
  };

  return (
    <div className="kd-thread" data-lost={lost || undefined}>
      <div className="kd-thread__head">
        <Icon name="chat_bubble" size={14} />
        <span className="kd-thread__id">#{view.thread.id}</span>
        {notice ? <span className="kd-thread__notice">{notice}</span> : null}
        <span className="kd-thread__spacer" />
        <button
          className="kd-thread__action"
          onClick={() => onResolve(view.thread.id)}
          title="対応したので解決済みにする"
        >
          解決
        </button>
        {lost ? (
          <button
            className="kd-thread__action"
            onClick={() => onDrop(view.thread.id)}
            title="対象が消えたので取り下げる"
          >
            取り下げ
          </button>
        ) : null}
      </div>

      <ul className="kd-thread__list">
        {view.thread.comments.map((c) => (
          <li key={c.id} className="kd-thread__comment">
            <span className="kd-thread__author">{c.author}</span>
            <span className="kd-thread__body">{c.body}</span>
          </li>
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
        <button
          className="kd-btn kd-btn--primary kd-btn--sm"
          onClick={submit}
          disabled={!body.trim()}
        >
          返信
        </button>
      </div>
    </div>
  );
}
