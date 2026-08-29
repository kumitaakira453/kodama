import { useVirtualizer } from "@tanstack/react-virtual";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  buildRows,
  fileHeaderIndex,
  maxLineDigits,
  maxLineLength,
  rowHeight,
  type RowItem,
} from "../../lib/diff/rows";
import { useHighlight } from "../../hooks/useHighlight";
import type { DiffLine } from "../../lib/types";
import {
  collapsedFilesAtom,
  currentFileAtom,
  diffAtom,
  diffLoadingAtom,
  jumpRequestAtom,
  viewModeAtom,
  wordDiffAtom,
  wrapLinesAtom,
} from "../../state/atoms";
import { RingSpinner } from "../ui/RingSpinner";
import { DiffCode } from "./DiffCode";
import { FileHeader } from "./FileHeader";

interface DiffCanvasProps {
  onReveal: (path: string) => void;
}

/**
 * 全ファイルの差分を 1 本のスクロールに積む。
 *
 * スクロールコンテナはこれと左ツリーの 2 つだけ。入れ子にすると、親と子の
 * どちらが動くのか予測できなくなる。
 */
export function DiffCanvas({ onReveal }: DiffCanvasProps) {
  const diff = useAtomValue(diffAtom);
  const loading = useAtomValue(diffLoadingAtom);
  const mode = useAtomValue(viewModeAtom);
  const wordDiff = useAtomValue(wordDiffAtom);
  const wrap = useAtomValue(wrapLinesAtom);
  const [collapsed, setCollapsed] = useAtom(collapsedFilesAtom);
  const [jump, setJump] = useAtom(jumpRequestAtom);
  const setCurrentFile = useSetAtom(currentFileAtom);

  const scrollRef = useRef<HTMLDivElement>(null);
  const files = useMemo(() => diff?.files ?? [], [diff]);
  const rows = useMemo(
    () => buildRows(files, mode, collapsed),
    [files, mode, collapsed],
  );
  const headerIndex = useMemo(() => fileHeaderIndex(rows), [rows]);
  const digits = useMemo(() => maxLineDigits(files), [files]);
  const columns = useMemo(() => maxLineLength(files), [files]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => rowHeight(rows[i]),
    overscan: 20,
    getItemKey: (i) => rows[i].key,
  });

  const toggleFile = useCallback(
    (path: string) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      }),
    [setCollapsed],
  );

  // ツリーからの「ここまで飛べ」を受ける。
  useEffect(() => {
    if (!jump) return;
    const index = headerIndex.get(jump.path);
    if (index !== undefined) {
      virtualizer.scrollToIndex(index, { align: "start" });
    }
    setJump(null);
  }, [jump, headerIndex, virtualizer, setJump]);

  // 仮想化は行 DOM を再利用する。スクロール中にトランジションが走ると色が
  // 補間され続けて濁るので、動いている間だけ止める。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let timer = 0;
    const onScroll = () => {
      el.dataset.scrolling = "true";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => delete el.dataset.scrolling, 150);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
    };
  }, []);

  const items = virtualizer.getVirtualItems();

  // 画面に入っているファイルだけ色を取りに行く。
  const visiblePaths = useMemo(() => {
    const seen = new Set<string>();
    for (const item of items) {
      const row = rows[item.index];
      if (row && row.type !== "file-gap") seen.add(row.file.path);
    }
    return [...seen];
  }, [items, rows]);
  useHighlight(visiblePaths);

  // 上端に見えているファイル。仮想化した行に sticky は効かないので、
  // 見出しは別レイヤーで重ねる。
  const pinnedFile = useMemo(() => {
    const first = items[0]?.index ?? 0;
    for (let i = first; i >= 0; i--) {
      const row = rows[i];
      if (row?.type === "file-header") return row.file;
      if (row?.type === "file-gap") return null;
    }
    return null;
  }, [items, rows]);

  useEffect(() => {
    setCurrentFile(pinnedFile?.path ?? null);
  }, [pinnedFile, setCurrentFile]);

  if (loading && !diff) {
    return (
      <div className="kd-canvas__center">
        <RingSpinner size={28} />
      </div>
    );
  }

  if (!diff) {
    return (
      <div className="kd-canvas__center kd-canvas__empty">
        <p>比較対象を選んでください</p>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="kd-canvas__center kd-canvas__empty">
        <Grove />
        <p>この比較に変更はありません</p>
        <small>
          {diff.resolved.baseLabel} → {diff.resolved.targetLabel}
        </small>
      </div>
    );
  }

  return (
    <div className="kd-canvas">
      {pinnedFile ? (
        <div className="kd-canvas__pin">
          <FileHeader
            file={pinnedFile}
            collapsed={collapsed.has(pinnedFile.path)}
            onToggle={() => toggleFile(pinnedFile.path)}
            onReveal={onReveal}
            pinned
          />
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="kd-canvas__scroll"
        data-mode={mode}
        data-wrap={wrap || undefined}
        style={
          {
            "--kd-digits": String(digits),
            "--kd-columns": String(columns),
          } as React.CSSProperties
        }
      >
        <div
          className="kd-canvas__spacer"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {items.map((item) => (
            <div
              key={item.key}
              className="kd-canvas__slot"
              style={{
                height: item.size,
                transform: `translateY(${item.start}px)`,
              }}
            >
              <Row
                row={rows[item.index]}
                wordDiff={wordDiff}
                onToggle={toggleFile}
                onReveal={onReveal}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({
  row,
  wordDiff,
  onToggle,
  onReveal,
}: {
  row: RowItem;
  wordDiff: boolean;
  onToggle: (path: string) => void;
  onReveal: (path: string) => void;
}) {
  switch (row.type) {
    case "file-header":
      return (
        <FileHeader
          file={row.file}
          collapsed={row.collapsed}
          onToggle={() => onToggle(row.file.path)}
          onReveal={onReveal}
        />
      );

    case "file-gap":
      return <div className="kd-gap" />;

    case "notice":
      return <div className="kd-notice">{row.text}</div>;

    case "hunk":
      return (
        <div className="kd-row kd-row--hunk" title={`${row.label} ${row.hunk.header}`}>
          <span className="kd-row__expand" aria-hidden>
            <span className="material-symbols-rounded">unfold_more</span>
          </span>
          <span className="kd-hunk__text">
            {row.label}
            {row.hunk.header ? ` ${row.hunk.header}` : ""}
          </span>
        </div>
      );

    case "line":
      return (
        <div className="kd-row" data-kind={row.line.kind}>
          <span className="kd-num">{row.line.oldNumber ?? ""}</span>
          <span className="kd-num">{row.line.newNumber ?? ""}</span>
          <span className="kd-sign">{sign(row.line)}</span>
          <span className="kd-code">
            <DiffCode line={row.line} wordDiff={wordDiff} />
          </span>
        </div>
      );

    case "split":
      return (
        <div className="kd-row kd-row--split">
          <Side line={row.left} side="old" wordDiff={wordDiff} />
          <Side line={row.right} side="new" wordDiff={wordDiff} />
        </div>
      );
  }
}

function Side({
  line,
  side,
  wordDiff,
}: {
  line: DiffLine | null;
  side: "old" | "new";
  wordDiff: boolean;
}) {
  if (!line) {
    return (
      <>
        <span className="kd-num kd-num--empty" />
        <span className="kd-sign kd-sign--empty" />
        <span className="kd-code kd-code--empty" />
      </>
    );
  }
  return (
    <>
      <span className="kd-num" data-kind={line.kind}>
        {(side === "old" ? line.oldNumber : line.newNumber) ?? ""}
      </span>
      <span className="kd-sign" data-kind={line.kind}>
        {sign(line)}
      </span>
      <span className="kd-code" data-kind={line.kind}>
        <DiffCode line={line} wordDiff={wordDiff} />
      </span>
    </>
  );
}

function sign(line: DiffLine): string {
  if (line.kind === "add") return "+";
  if (line.kind === "del") return "-";
  return "";
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
