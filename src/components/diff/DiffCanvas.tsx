import { useVirtualizer } from "@tanstack/react-virtual";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useFileFilter } from "../../hooks/useFileFilter";
import { useHighlight } from "../../hooks/useHighlight";
import { useToast } from "../../hooks/useToast";
import { applyFilter } from "../../lib/diff/filter";
import { api } from "../../lib/ipc";
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
  DiffLineKind,
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
  expandedAtom,
  jumpRequestAtom,
  lineSelectionAtom,
  selectedWorktreeAtom,
  viewModeAtom,
  wordDiffAtom,
  type LineSelection,
} from "../../state/atoms";
import { Loading } from "../empty/Loading";
import { Composer } from "../review/Composer";
import { ThreadCard } from "../review/ThreadCard";
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

/** 一度に展開する行数の上限。隙間が広いときは直前の分だけ出す。 */
const MAX_EXPAND = 200;

/** 行番号を押したときに親へ渡す情報。 */
interface GutterHit {
  file: DiffFile;
  side: Side;
  line: number;
  content: string;
  context: string;
  /**
   * `start` は押した瞬間、`drag` は押したまま通過したとき、`click` はキーボード。
   * キーボードには離す動作が無いので、なぞっている状態に入れてはいけない。
   */
  phase: "start" | "drag" | "click";
  extend: boolean;
}

/** その行がいま選んでいる範囲に入っているか。 */
function inSelection(
  selection: LineSelection | null,
  file: string,
  side: Side,
  no: number | null,
): boolean {
  return (
    no !== null &&
    selection?.file === file &&
    selection.side === side &&
    no >= selection.start &&
    no <= selection.end
  );
}

/**
 * 選択範囲の逐語。
 *
 * 行番号だけを控えると、指摘に応えて書き換えられた瞬間に対象を見失う。
 * 複数行を選んだときは全行を控える。
 */
function quoteOf(files: DiffFile[], selection: LineSelection): string {
  const file = files.find((f) => f.path === selection.file);
  if (!file) return selection.quote;
  const out: string[] = [];
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      const no =
        selection.side === "old" ? line.oldNumber : line.newNumber;
      if (no !== null && no >= selection.start && no <= selection.end) {
        out.push(line.content);
      }
    }
  }
  return out.length > 0 ? out.join("\n") : selection.quote;
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
  const [expanded, setExpanded] = useAtom(expandedAtom);
  const setCurrentFile = useSetAtom(currentFileAtom);
  const { showError } = useToast();

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileFilter = useFileFilter();
  const files = useMemo(
    () => applyFilter(diff?.files ?? [], fileFilter),
    [diff, fileFilter],
  );
  /**
   * なぞっているあいだは入力欄を出さない。
   *
   * 入力欄は選んだ範囲の直下に挟まる。選びながら出すと、次に選びたい行が
   * その高さのぶん押し下げられ、越えないと届かなくなる。
   */
  const [selecting, setSelecting] = useState(false);
  const rows = useMemo(
    () =>
      buildRows(
        files,
        mode,
        collapsed,
        threads,
        selecting ? null : selection,
        expanded,
      ),
    [files, mode, collapsed, threads, selection, selecting, expanded],
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
    // 先読みは画面外 8 行まで。増やすほど 1 回のスクロールで新しく作る行が
    // 増え、実測も走る。
    overscan: 8,
    getItemKey: (i) => rows[i].key,
  });

  const clearSelection = useCallback(() => setSelection(null), [setSelection]);

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

  /** 押した行。ここを軸にして、なぞった先まで範囲を伸ばす。 */
  const anchor = useRef<number | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const stop = () => {
      dragging.current = false;
      setSelecting(false);
    };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);

  /**
   * 行番号の操作。押した時点で 1 行を選び、そのままなぞると範囲が伸びる。
   * Shift を押しての単発クリックでも伸ばせる。
   */
  const onGutter = useCallback(
    (hit: GutterHit) => {
      if (hit.phase === "drag") {
        if (!dragging.current || anchor.current === null) return;
        setSelection((prev) => {
          // なぞっている途中で別の側へ入っても、範囲は動かさない。
          if (
            !prev ||
            prev.file !== hit.file.path ||
            prev.side !== hit.side
          ) {
            return prev;
          }
          const from = anchor.current as number;
          return {
            ...prev,
            start: Math.min(from, hit.line),
            end: Math.max(from, hit.line),
          };
        });
        return;
      }

      const byMouse = hit.phase === "start";
      dragging.current = byMouse;
      setSelecting(byMouse);
      setSelection((prev) => {
        if (
          hit.extend &&
          prev &&
          prev.file === hit.file.path &&
          prev.side === hit.side
        ) {
          // 反対側の端を軸にすると、そのまま引き返して縮められる。
          anchor.current = hit.line <= prev.start ? prev.end : prev.start;
          return {
            ...prev,
            start: Math.min(prev.start, hit.line),
            end: Math.max(prev.end, hit.line),
          };
        }
        anchor.current = hit.line;
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

  /** ハンクの手前を展開する。広すぎる隙間は直前の分だけに絞る。 */
  const expandGap = useCallback(
    (gapKey: string, path: string, from: number, to: number) => {
      if (!worktree || !diff) return;
      const start = Math.max(from, to - MAX_EXPAND + 1);
      void api
        .readLines(worktree, diff.resolved.spec, path, "old", start, to)
        .then((lines) =>
          // 2 回目以降は取れた分を手前に足す。置き換えると前回の分が消える。
          setExpanded((prev) => {
            const got = prev[gapKey];
            return {
              ...prev,
              [gapKey]: {
                from: start,
                lines: got ? [...lines, ...got.lines] : lines,
              },
            };
          }),
        )
        .catch(showError);
    },
    [worktree, diff, setExpanded, showError],
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
        quote: quoteOf(files, selection),
        context: selection.context,
        body,
        author: "you",
      });
      setSelection(null);
    },
    [selection, worktree, diff, files, onAddThread, setSelection],
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
  //
  // 中身が同じでも配列を作り直すと、スクロールのたびに取得の判定が走る。
  // 一度文字列に畳んで、顔ぶれが変わったときだけ新しい配列にする。
  const visibleKey = useMemo(() => {
    const seen = new Set<string>();
    for (const item of items) {
      const row = rows[item.index];
      if (row && row.type !== "file-gap") seen.add(row.file.path);
    }
    return [...seen].join("\n");
  }, [items, rows]);
  const visiblePaths = useMemo(
    () => (visibleKey ? visibleKey.split("\n") : []),
    [visibleKey],
  );
  useHighlight(visiblePaths);

  const scrollOffset = virtualizer.scrollOffset ?? 0;

  // 上端に見えているファイル。overscan の行は視界の外にあるので、
  // 描画済みの先頭ではなく上端と重なる行から遡る。
  const topFile = useMemo(() => {
    const top = items.find((item) => item.end > scrollOffset) ?? items[0];
    if (!top) return null;
    for (let i = top.index; i >= 0; i--) {
      const row = rows[i];
      if (row?.type === "file-header") return row.file;
      if (row?.type === "file-gap") return null;
    }
    return null;
  }, [items, rows, scrollOffset]);

  useEffect(() => {
    setCurrentFile(topFile?.path ?? null);
  }, [topFile, setCurrentFile]);

  // 見出しが本来の位置のまま見えているなら重ねない。重ねた分だけ下の行が
  // 隠れるので、隠す必要が無いときは出さない。
  const pinnedFile = useMemo(() => {
    if (!topFile) return null;
    const index = headerIndex.get(topFile.path);
    if (index === undefined) return null;
    const header = items.find((item) => item.index === index);
    return header && header.start >= scrollOffset ? null : topFile;
  }, [topFile, headerIndex, items, scrollOffset]);

  if (loading && !diff) {
    return <Loading text="差分を読み込んでいます" detail={worktree ?? undefined} />;
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
        <p>
          {diff.files.length > 0
            ? "絞り込みに一致するファイルがありません"
            : "この比較に変更はありません"}
        </p>
        <small>
          {diff.resolved.baseLabel} → {diff.resolved.targetLabel}
        </small>
      </div>
    );
  }

  return (
    <div className="kd-canvas" data-loading={loading || undefined}>
      {/* 読み込み中も前の差分を出したままにする。急に空にすると、何が起きて
          いるのか分からない。動いていることだけ上端の帯で示す。 */}
      {loading ? <div className="kd-canvas__progress" aria-hidden /> : null}

      <div
        ref={scrollRef}
        className="kd-canvas__scroll"
        data-mode={mode}
        style={{ "--kd-digits": String(digits) } as React.CSSProperties}
      >
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
                onExpand={expandGap}
                onSubmit={submitThread}
                onCancel={clearSelection}
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
  onExpand: (gapKey: string, path: string, from: number, to: number) => void;
  onSubmit: (body: string) => void;
  onCancel: () => void;
  onReply: (id: string, body: string) => void;
  onResolve: (id: string) => void;
  onDrop: (id: string) => void;
}

/**
 * 行 1 つ。スクロールのたびに親が描き直されるので、受け取る値が変わらない
 * 行は再描画しない。行の数だけ差が出る。
 */
const Row = memo(function Row({
  row,
  wordDiff,
  selection,
  viewed,
  onToggleViewed,
  onToggle,
  apps,
  onOpenApp,
  onGutter,
  onExpand,
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

    case "hunk": {
      const gap = row.gap;
      return (
        <div className="kd-row kd-row--hunk">
          {gap ? (
            <button
              className="kd-row__expand"
              onClick={() =>
                onExpand(gap.gapKey, row.file.path, gap.from, gap.to)
              }
              title={`手前の ${gap.to - gap.from + 1} 行を表示する`}
              aria-label={`${gap.from}-${gap.to} 行目を表示する`}
            >
              <span className="material-symbols-rounded">unfold_more</span>
            </button>
          ) : (
            <span className="kd-row__expand" aria-hidden />
          )}
          <span
            className="kd-hunk__text"
            title={`${row.label} ${row.hunk.header}`}
          >
            {row.label}
            {row.hunk.header ? ` ${row.hunk.header}` : ""}
          </span>
        </div>
      );
    }

    case "line": {
      const line = row.line;
      const path = row.file.path;
      const pickedOld = inSelection(selection, path, "old", line.oldNumber);
      const pickedNew = inSelection(selection, path, "new", line.newNumber);

      return (
        <div
          className="kd-row"
          data-kind={line.kind}
          data-picked={pickedOld || pickedNew || undefined}
        >
          <Gutter
            no={line.oldNumber}
            picked={pickedOld}
            onPick={(phase, extend) => {
              if (line.oldNumber === null) return;
              onGutter({
                file: row.file,
                side: "old",
                line: line.oldNumber,
                content: line.content,
                context: row.context,
                phase,
                extend,
              });
            }}
          />
          <Gutter
            no={line.newNumber}
            picked={pickedNew}
            onPick={(phase, extend) => {
              if (line.newNumber === null) return;
              onGutter({
                file: row.file,
                side: "new",
                line: line.newNumber,
                content: line.content,
                context: row.context,
                phase,
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

    case "split": {
      const path = row.file.path;
      const picked =
        inSelection(selection, path, "old", row.left?.oldNumber ?? null) ||
        inSelection(selection, path, "new", row.right?.newNumber ?? null);
      return (
        <div
          className="kd-row kd-row--split"
          data-picked={picked || undefined}
        >
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
});

/** 行番号のセル。押すと指摘の対象になる。 */
function Gutter({
  no,
  picked,
  kind,
  side,
  onPick,
}: {
  no: number | null;
  picked: boolean;
  /** 左右に並べたときは行ではなくセルごとに色を付けるので、種別をここに持つ。 */
  kind?: DiffLineKind;
  side?: Side;
  onPick: (phase: "start" | "drag" | "click", extend: boolean) => void;
}) {
  if (no === null) {
    return <span className="kd-num" data-kind={kind} data-side={side} />;
  }
  return (
    <button
      className="kd-num kd-num--pick"
      data-picked={picked || undefined}
      data-kind={kind}
      data-side={side}
      // クリックではなく押した瞬間に始める。そのままなぞって範囲を選べる。
      // 既定の動作を止めるのは、なぞるあいだに本文が選択されるのを防ぐため。
      onMouseDown={(e) => {
        e.preventDefault();
        onPick("start", e.shiftKey);
      }}
      onMouseEnter={() => onPick("drag", false)}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onPick("click", e.shiftKey);
      }}
      title="この行に指摘する（なぞる / Shift+クリックで範囲）"
    >
      {/* 押せることが見えないと、行に指摘できると気づけない。 */}
      <span className="kd-num__add" aria-hidden>
        +
      </span>
      <span className="kd-num__no">{no}</span>
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
        <span className="kd-num kd-num--empty" data-side={side} />
        <span className="kd-sign kd-sign--empty" data-side={side} />
        <span className="kd-code kd-code--empty" data-side={side} />
      </>
    );
  }
  const no = side === "old" ? line.oldNumber : line.newNumber;
  const picked = inSelection(selection, file.path, side, no);

  return (
    <>
      <Gutter
        no={no}
        picked={picked}
        kind={line.kind}
        side={side}
        onPick={(phase, extend) => {
          if (no === null) return;
          onGutter({
            file,
            side,
            line: no,
            content: line.content,
            context,
            phase,
            extend,
          });
        }}
      />
      <span className="kd-sign" data-kind={line.kind} data-side={side}>
        {sign(line)}
      </span>
      <span className="kd-code" data-kind={line.kind} data-side={side}>
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
