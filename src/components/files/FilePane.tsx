import { useAtom } from "jotai";

import type { DiffResponse } from "../../lib/types";
import { selectedFileAtom } from "../../state/atoms";
import { RingSpinner } from "../ui/RingSpinner";
import { FileTree } from "./FileTree";

interface FilePaneProps {
  diff: DiffResponse | null;
  loading: boolean;
  onRevealFile: (path: string) => void;
}

export function FilePane({ diff, loading, onRevealFile }: FilePaneProps) {
  const [selected, setSelected] = useAtom(selectedFileAtom);

  if (loading && !diff) {
    return (
      <div className="kd-pane__loading">
        <RingSpinner size={22} />
      </div>
    );
  }

  if (!diff) {
    return <p className="kd-pane__note">比較対象を選んでください</p>;
  }

  if (diff.files.length === 0) {
    return (
      <div className="kd-nochanges">
        <Grove />
        <p>この比較に変更はありません</p>
        <small>
          {diff.resolved.baseLabel} → {diff.resolved.targetLabel}
        </small>
      </div>
    );
  }

  const additions = diff.files.reduce((n, f) => n + f.additions, 0);
  const deletions = diff.files.reduce((n, f) => n + f.deletions, 0);

  return (
    <div className="kd-filepane">
      <div className="kd-filepane__head">
        <span className="kd-filepane__count">{diff.files.length} ファイル</span>
        <span className="kd-filepane__stat">
          <span className="kd-file__add">+{additions}</span>
          <span className="kd-file__del">-{deletions}</span>
        </span>
      </div>
      <div className="kd-filepane__list">
        <FileTree
          files={diff.files}
          selected={selected}
          onSelect={setSelected}
          onContextMenu={(path, e) => {
            e.preventDefault();
            onRevealFile(path);
          }}
        />
      </div>
    </div>
  );
}

/** 差分が無いときの静かな木立。入場の淡いフェードだけで、あとは動かさない。 */
function Grove() {
  return (
    <svg width="96" height="72" viewBox="0 0 96 72" aria-hidden>
      {[
        { x: 20, h: 34, o: 0.28 },
        { x: 48, h: 46, o: 0.4 },
        { x: 74, h: 28, o: 0.22 },
      ].map((t, i) => (
        <g key={i} opacity={t.o}>
          <path
            d={`M${t.x} 64 L${t.x} ${64 - t.h}`}
            stroke="var(--kd-muted)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d={`M${t.x - 11} ${64 - t.h * 0.55} Q${t.x} ${64 - t.h - 8} ${t.x + 11} ${64 - t.h * 0.55} Z`}
            fill="var(--kd-muted)"
          />
        </g>
      ))}
      <path
        d="M6 64 H90"
        stroke="var(--kd-border-strong)"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}
