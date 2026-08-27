import { useMemo } from "react";

import { overlay } from "../../lib/highlight/overlay";
import type { DiffLine } from "../../lib/types";

/**
 * コード 1 行の本文。`dangerouslySetInnerHTML` を使わず span を並べるので、
 * エスケープ漏れによる XSS が構造的に起きない。
 */
export function DiffCode({
  line,
  wordDiff,
}: {
  line: DiffLine;
  wordDiff: boolean;
}) {
  const segments = useMemo(() => {
    // Rust が返した本文とトークン範囲の長さが食い違ったら、その行だけプレーンに
    // 落とす。壊れていても必ず画面は出る。
    const tokens = line.tokens;
    const usable =
      !tokens ||
      tokens.every((t) => t.start >= 0 && t.start + t.len <= line.content.length);
    return overlay(
      line.content,
      usable ? tokens : null,
      wordDiff ? line.inline : null,
    );
  }, [line.content, line.tokens, line.inline, wordDiff]);

  return (
    <span className="kd-code">
      {segments.map((s, i) =>
        s.kind === "plain" && !s.emph ? (
          s.text
        ) : (
          <span
            key={i}
            className={`kd-t-${s.kind}`}
            data-emph={s.emph || undefined}
          >
            {s.text}
          </span>
        ),
      )}
      {line.noNewline ? (
        <span className="kd-nonewline" title="ファイル末尾に改行がありません">
          ↵
        </span>
      ) : null}
    </span>
  );
}
