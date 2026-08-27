import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";

import { buildRows, maxLineDigits, type RowItem } from "../../lib/diff/rows";
import type { DiffFile, DiffLine, ViewMode } from "../../lib/types";
import { DiffCode } from "./DiffCode";

/** これ未満は仮想化せず全行描く。少行数では計測のノイズの方が大きい。 */
const VIRTUALIZE_FROM = 800;
/** 行高。CSS の --kd-line-h と一致させる。 */
const LINE_H = 20;

interface DiffBodyProps {
  file: DiffFile;
  mode: ViewMode;
  wordDiff: boolean;
  wrap: boolean;
}

export function DiffBody({ file, mode, wordDiff, wrap }: DiffBodyProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => buildRows(file, mode), [file, mode]);
  const digits = useMemo(() => maxLineDigits(file), [file]);

  // ファイルを切り替えたら先頭へ戻す。前のファイルの位置に留まると、どこを
  // 読んでいるのか分からなくなる。
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [file.path, mode]);

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

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LINE_H,
    overscan: 24,
    enabled: rows.length >= VIRTUALIZE_FROM && !wrap,
  });

  const style = {
    "--kd-digits": String(digits),
  } as React.CSSProperties;

  const virtualized = rows.length >= VIRTUALIZE_FROM && !wrap;
  const items = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      className="kd-diff"
      data-mode={mode}
      data-wrap={wrap || undefined}
      style={style}
    >
      {virtualized ? (
        <div
          className="kd-diff__spacer"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {items.map((item) => (
            <div
              key={rows[item.index].key}
              className="kd-diff__slot"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <Row row={rows[item.index]} wordDiff={wordDiff} />
            </div>
          ))}
        </div>
      ) : (
        rows.map((row) => (
          <Row key={row.key} row={row} wordDiff={wordDiff} />
        ))
      )}
    </div>
  );
}

function Row({ row, wordDiff }: { row: RowItem; wordDiff: boolean }) {
  if (row.type === "hunk") {
    return (
      <div className="kd-diff-row kd-diff-row--hunk">
        <span className="kd-hunk__range">{row.label}</span>
        {row.header ? (
          <span className="kd-hunk__ctx">{row.header}</span>
        ) : null}
      </div>
    );
  }

  if (row.type === "unified") {
    const line = row.line;
    return (
      <div className="kd-diff-row" data-kind={line.kind}>
        <span className="kd-num">{line.oldNumber ?? ""}</span>
        <span className="kd-num">{line.newNumber ?? ""}</span>
        <span className="kd-sign">{sign(line)}</span>
        <DiffCode line={line} wordDiff={wordDiff} />
      </div>
    );
  }

  return (
    <div className="kd-diff-row kd-diff-row--split">
      <Side line={row.left} side="old" wordDiff={wordDiff} />
      <Side line={row.right} side="new" wordDiff={wordDiff} />
    </div>
  );
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
        <span className="kd-num" />
        <span className="kd-sign" />
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
      <span className="kd-cell" data-kind={line.kind}>
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
