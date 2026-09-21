import { Fragment } from "react";

import { parseInline } from "../../lib/markup";

/**
 * 会話の本文。改行を保ち、識別子と強調だけを組む。
 *
 * `dangerouslySetInnerHTML` を使わないので、エスケープ漏れによる XSS が
 * 構造的に起きない。
 */
export function CommentBody({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((seg, i) => {
        if (seg.kind === "code") {
          return (
            <code key={i} className="kd-code-inline">
              {seg.text}
            </code>
          );
        }
        if (seg.kind === "strong") {
          return <strong key={i}>{seg.text}</strong>;
        }
        return <Fragment key={i}>{seg.text}</Fragment>;
      })}
    </>
  );
}
