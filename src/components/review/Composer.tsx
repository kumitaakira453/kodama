import { useEffect, useRef, useState } from "react";

import type { LineSelection } from "../../state/atoms";

interface ComposerProps {
  selection: LineSelection;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}

/**
 * 指摘の入力欄。選択範囲の直下にフル幅の行として開く。
 *
 * ポップオーバーにしない。スクロールで位置がずれず、どの行に対する指摘なのかが
 * 視覚的に保たれる。
 */
export function Composer({ selection, onSubmit, onCancel }: ComposerProps) {
  const [body, setBody] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    onSubmit(text);
  };

  const range =
    selection.start === selection.end
      ? `${selection.start} 行目`
      : `${selection.start}-${selection.end} 行目`;

  return (
    <div className="kd-composer">
      <div className="kd-composer__head">
        <span className="kd-composer__range">
          {selection.side === "old" ? "変更前" : "変更後"} {range}
        </span>
        {selection.context ? (
          <span className="kd-composer__context">{selection.context}</span>
        ) : null}
      </div>

      <textarea
        ref={ref}
        className="kd-textarea"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.metaKey) {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder="気づいたことを書く（⌘Enter で保存、Esc で取消）"
        rows={3}
      />

      <div className="kd-composer__foot">
        <span className="kd-composer__hint">
          保存すると `kodama review list` から読めます
        </span>
        <button className="kd-btn kd-btn--sm" onClick={onCancel}>
          取消
        </button>
        <button
          className="kd-btn kd-btn--primary kd-btn--sm"
          onClick={submit}
          disabled={!body.trim()}
        >
          指摘する
        </button>
      </div>
    </div>
  );
}
