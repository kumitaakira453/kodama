import { useAtom } from "jotai";

import type { DiffFile } from "../../lib/types";
import {
  contextLinesAtom,
  viewModeAtom,
  wordDiffAtom,
  wrapLinesAtom,
} from "../../state/atoms";
import { IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { RingSpinner } from "../ui/RingSpinner";
import { DiffBody } from "./DiffBody";

/** 文脈行数の候補。「変更のみ」「広め」「全体」の 3 段。 */
const CONTEXT_STEPS = [3, 25, 100000];
const CONTEXT_LABELS = ["変更のみ", "広め", "全体"];

interface DiffPaneProps {
  file: DiffFile | null;
  loading: boolean;
  onOpenFile: (path: string, line: number | null) => void;
}

export function DiffPane({ file, loading, onOpenFile }: DiffPaneProps) {
  const [mode, setMode] = useAtom(viewModeAtom);
  const [wordDiff, setWordDiff] = useAtom(wordDiffAtom);
  const [wrap, setWrap] = useAtom(wrapLinesAtom);
  const [context, setContext] = useAtom(contextLinesAtom);

  if (loading && !file) {
    return (
      <div className="kd-pane__loading">
        <RingSpinner size={26} />
      </div>
    );
  }

  if (!file) {
    return (
      <div className="kd-nofile">
        <RingOutline />
        <p>ファイルを選ぶと差分が表示されます</p>
      </div>
    );
  }

  const contextIndex = Math.max(0, CONTEXT_STEPS.indexOf(context));

  return (
    <div className="kd-diffpane">
      <header className="kd-difftool">
        <span className="kd-difftool__path" title={file.path}>
          {file.oldPath ? (
            <>
              <span className="kd-difftool__old">{file.oldPath}</span>
              <Icon name="arrow_right_alt" size={14} />
            </>
          ) : null}
          {file.path}
        </span>

        <span className="kd-difftool__stat">
          {file.additions > 0 ? (
            <span className="kd-file__add">+{file.additions}</span>
          ) : null}
          {file.deletions > 0 ? (
            <span className="kd-file__del">-{file.deletions}</span>
          ) : null}
        </span>

        <div className="kd-difftool__actions">
          <button
            className="kd-seg"
            onClick={() =>
              setContext(
                CONTEXT_STEPS[(contextIndex + 1) % CONTEXT_STEPS.length],
              )
            }
            title="表示する文脈行の量"
          >
            {CONTEXT_LABELS[contextIndex]}
          </button>
          <IconButton
            name={mode === "split" ? "vertical_split" : "reorder"}
            label={mode === "split" ? "並べて表示 (u)" : "1 列で表示 (u)"}
            active={mode === "split"}
            onClick={() => setMode(mode === "split" ? "unified" : "split")}
          />
          <IconButton
            name="match_word"
            label="行内の差分を強調"
            active={wordDiff}
            onClick={() => setWordDiff(!wordDiff)}
          />
          <IconButton
            name="wrap_text"
            label="長い行を折り返す"
            active={wrap}
            onClick={() => setWrap(!wrap)}
          />
          <IconButton
            name="folder_open"
            label="Finder で表示"
            onClick={() =>
              onOpenFile(file.path, file.hunks[0]?.newStart ?? null)
            }
          />
        </div>
      </header>

      {file.binary ? (
        <div className="kd-notice">バイナリファイルのため表示できません</div>
      ) : file.truncated ? (
        <div className="kd-notice">
          変更が大きすぎるため表示していません。エディタで開いてください。
        </div>
      ) : file.hunks.length === 0 ? (
        <div className="kd-notice">
          内容の変更はありません（{describeMetaOnly(file.status)}）
        </div>
      ) : (
        <DiffBody file={file} mode={mode} wordDiff={wordDiff} wrap={wrap} />
      )}
    </div>
  );
}

function describeMetaOnly(status: string): string {
  if (status === "renamed") return "パスの変更のみ";
  if (status === "copied") return "コピーのみ";
  return "モードの変更のみ";
}

/** ファイル未選択の待ち受け。年輪の輪郭だけを薄く置き、動かさない。 */
function RingOutline() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden>
      {[30, 21, 12].map((r, i) => (
        <circle
          key={r}
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke="var(--kd-border-strong)"
          strokeWidth="1.5"
          opacity={0.9 - i * 0.2}
        />
      ))}
      <circle cx="36" cy="36" r="3" fill="var(--kd-border-strong)" />
    </svg>
  );
}
