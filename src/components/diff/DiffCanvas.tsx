import { useVirtualizer } from "@tanstack/react-virtual";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { useHighlight } from "../../hooks/useHighlight";
import {
  buildRows,
  fileHeaderIndex,
  maxLineDigits,
  rowHeight,
  type RowItem,
} from "../../lib/diff/rows";
import type {
  AppTarget,
  DiffFile,
  DiffLine,
  Side,
  ThreadInput,
  ThreadView,
  ViewedStatus,
} from "../../lib/types";
import {
  collapsedFilesAtom,
  currentFileAtom,
  diffAtom,
  diffLoadingAtom,
  jumpRequestAtom,
  lineSelectionAtom,
  selectedWorktreeAtom,
  viewModeAtom,
  wordDiffAtom,
  type LineSelection,
} from "../../state/atoms";
import { Composer } from "../review/Composer";
import { ThreadCard } from "../review/ThreadCard";
import { RingSpinner } from "../ui/RingSpinner";
import { DiffCode } from "./DiffCode";
import { FileHeader } from "./FileHeader";

interface DiffCanvasProps {
  viewed: Record<string, ViewedStatus>;
  threads: ThreadView[];
  apps: AppTarget[];
  onToggleViewed: (path: string) => void;
  onAddThread: (input: ThreadInput) => void;
  onReply: (id: string, body: string) => void;
  onResolve: (id: string) => void;
  onDropThread: (id: string) => void;
  onOpenApp: (appId: string, path: string, line: number | null) => void;
}

/** 行番号をクリックしたときに親へ渡す情報。 */
interface GutterHit {
  file: DiffFile;
  side: Side;
  line: number;
  content: string;
  context: string;
  extend: boolean;
}

/**
 * 全ファイルの差分を 1 本のスクロールに積む。
 *
 * スクロールコンテナはこれと左ツリーの 2 つだけ。入れ子にすると、親と子の
 * どちらが動くのか予測できなくなる。
 */
export function DiffCanvas({
  viewed,
  threads,
  apps,
  onToggleViewed,
  onAddThread,
  onReply,
  onResolve,
  onDropThread,
  onOpenApp,
}: DiffCanvasProps) {
  const diff = useAtomValue(diffAtom);
  const loading = useAtomValue(diffLoadingAtom);
  const mode = useAtomValue(viewModeAtom);
  const wordDiff = useAtomValue(wordDiffAtom);
  const worktree = useAtomValue(selectedWorktreeAtom);
  const [collapsed, setCollapsed] = useAtom(collapsedFilesAtom);
  const [jump, setJump] = useAtom(jumpRequestAtom);
  const [selection, setSelection] = useAtom(lineSelectionAtom);
  const setCurrentFile = useSetAtom(currentFileAtom);

  const scrollRef = useRef<HTMLDivElement>(null);
  const files = useMemo(() => diff?.files ?? [], [diff]);
  const rows = useMemo(
    () => buildRows(files, mode, collapsed, threads, selection),
    [files, mode, collapsed, threads, selection],
  );
  const headerIndex = useMemo(() => fileHeaderIndex(rows), [rows]);
  const digits = useMemo(() => maxLineDigits(files), [files]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => rowHeight(rows[i]),
    // 長い行は折り返すので高さが可変になる。見積もりは型ごとの値を出発点にし、
    // 実際の高さは描画後に測って置き換える。
    measureElement: (el) => el.getBoundingClientRect().height,
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

  /** 行番号のクリック。Shift を押していれば起点を保って範囲を伸ばす。 */
  const onGutter = useCallback(
    (hit: GutterHit) => {
      setSelection((prev) => {
        if (
          hit.extend &&
          prev &&
          prev.file === hit.file.path &&
          prev.side === hit.side
        ) {
          return {
            ...prev,
            start: Math.min(prev.start, hit.line),
            end: Math.max(prev.end, hit.line),
          };
        }
        return {
          file: hit.file.path,
          side: hit.side,
          start: hit.line,
          end: hit.line,
          quote: hit.content,
          context: hit.context,
        };
      });
    },
    [setSelection],
  );

  const submitThread = useCallback(
    (body: string) => {
      if (!selection || !worktree || !diff) return;
      onAddThread({
        repo: worktree,
        revisionKey: diff.resolved.revisionKey,
        file: selection.file,
        side: selection.side,
        lineStart: selection.start,
        lineEnd: selection.end,
        quote: selection.quote,
        context: selection.context,
        body,
        author: "you",
      });
      setSelection(null);
    },
    [selection, worktree, diff, onAddThread, setSelection],
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSelection]);

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
            viewed={viewed[pinnedFile.path] ?? "unviewed"}
            onToggle={() => toggleFile(pinnedFile.path)}
            onToggleViewed={onToggleViewed}
            apps={apps}
            onOpen={onOpenApp}
            pinned
          />
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="kd-canvas__scroll"
        data-mode={mode}
        style={{ "--kd-digits": String(digits) } as React.CSSProperties}
      >
        <div
          className="kd-canvas__spacer"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {items.map((item) => (
            <div
              key={item.key}
              className="kd-canvas__slot"
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <Row
                row={rows[item.index]}
                wordDiff={wordDiff}
                selection={selection}
                viewed={viewed}
                onToggleViewed={onToggleViewed}
                onToggle={toggleFile}
                apps={apps}
                onOpenApp={onOpenApp}
                onGutter={onGutter}
                onSubmit={submitThread}
                onCancel={() => setSelection(null)}
                onReply={onReply}
                onResolve={onResolve}
                onDrop={onDropThread}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface RowProps {
  row: RowItem;
  wordDiff: boolean;
  selection: LineSelection | null;
  viewed: Record<string, ViewedStatus>;
  onToggleViewed: (path: string) => void;
  onToggle: (path: string) => void;
  apps: AppTarget[];
  onOpenApp: (appId: string, path: string, line: number | null) => void;
  onGutter: (hit: GutterHit) => void;
  onSubmit: (body: string) => void;
  onCancel: () => void;
  onReply: (id: string, body: string) => void;
  onResolve: (id: string) => void;
  onDrop: (id: string) => void;
}

function Row({
  row,
  wordDiff,
  selection,
  viewed,
  onToggleViewed,
  onToggle,
  apps,
  onOpenApp,
  onGutter,
  onSubmit,
  onCancel,
  onReply,
  onResolve,
  onDrop,
}: RowProps) {
  switch (row.type) {
    case "file-header":
      return (
        <FileHeader
          file={row.file}
          collapsed={row.collapsed}
          viewed={viewed[row.file.path] ?? "unviewed"}
          onToggle={() => onToggle(row.file.path)}
          onToggleViewed={onToggleViewed}
          apps={apps}
          onOpen={onOpenApp}
        />
      );

    case "file-gap":
      return <div className="kd-gap" />;

    case "notice":
      return <div className="kd-notice">{row.text}</div>;

    case "thread":
      return (
        <div className="kd-inset">
          <ThreadCard
            view={row.view}
            onReply={onReply}
            onResolve={onResolve}
            onDrop={onDrop}
          />
        </div>
      );

    case "composer":
      return (
        <div className="kd-inset">
          <Composer
            selection={row.selection}
            onSubmit={onSubmit}
            onCancel={onCancel}
          />
        </div>
      );

    case "hunk":
      return (
        <div
          className="kd-row kd-row--hunk"
          title={`${row.label} ${row.hunk.header}`}
        >
          <span className="kd-row__expand" aria-hidden>
            <span className="material-symbols-rounded">unfold_more</span>
          </span>
          <span className="kd-hunk__text">
            {row.label}
            {row.hunk.header ? ` ${row.hunk.header}` : ""}
          </span>
        </div>
      );

    case "line": {
      const line = row.line;
      const picked = (side: Side, no: number | null) =>
        no !== null &&
        selection?.file === row.file.path &&
        selection.side === side &&
        no >= selection.start &&
        no <= selection.end;

      return (
        <div className="kd-row" data-kind={line.kind}>
          <Gutter
            no={line.oldNumber}
            picked={picked("old", line.oldNumber)}
            onPick={(extend) => {
              if (line.oldNumber === null) return;
              onGutter({
                file: row.file,
                side: "old",
                line: line.oldNumber,
                content: line.content,
                context: row.context,
                extend,
              });
            }}
          />
          <Gutter
            no={line.newNumber}
            picked={picked("new", line.newNumber)}
            onPick={(extend) => {
              if (line.newNumber === null) return;
              onGutter({
                file: row.file,
                side: "new",
                line: line.newNumber,
                content: line.content,
                context: row.context,
                extend,
              });
            }}
          />
          <span className="kd-sign">{sign(line)}</span>
          <span className="kd-code">
            <DiffCode line={line} wordDiff={wordDiff} />
          </span>
        </div>
      );
    }

    case "split":
      return (
        <div className="kd-row kd-row--split">
          <SideCell
            line={row.left}
            side="old"
            file={row.file}
            context={row.context}
            selection={selection}
            wordDiff={wordDiff}
            onGutter={onGutter}
          />
          <SideCell
            line={row.right}
            side="new"
            file={row.file}
            context={row.context}
            selection={selection}
            wordDiff={wordDiff}
            onGutter={onGutter}
          />
        </div>
      );
  }
}

/** 行番号のセル。押すと指摘の対象になる。 */
function Gutter({
  no,
  picked,
  onPick,
}: {
  no: number | null;
  picked: boolean;
  onPick: (extend: boolean) => void;
}) {
  if (no === null) return <span className="kd-num" />;
  return (
    <button
      className="kd-num kd-num--pick"
      data-picked={picked || undefined}
      onClick={(e) => onPick(e.shiftKey)}
      title="この行に指摘する（Shift+クリックで範囲）"
    >
      {no}
    </button>
  );
}

function SideCell({
  line,
  side,
  file,
  context,
  selection,
  wordDiff,
  onGutter,
}: {
  line: DiffLine | null;
  side: Side;
  file: DiffFile;
  context: string;
  selection: LineSelection | null;
  wordDiff: boolean;
  onGutter: (hit: GutterHit) => void;
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
  const no = side === "old" ? line.oldNumber : line.newNumber;
  const picked =
    no !== null &&
    selection?.file === file.path &&
    selection.side === side &&
    no >= selection.start &&
    no <= selection.end;

  return (
    <>
      <Gutter
        no={no}
        picked={picked}
        onPick={(extend) => {
          if (no === null) return;
          onGutter({
            file,
            side,
            line: no,
            content: line.content,
            context,
            extend,
          });
        }}
      />
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
