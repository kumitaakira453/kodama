import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";

import { api } from "../lib/ipc";
import type { DiffFile } from "../lib/types";
import {
  contextLinesAtom,
  diffAtom,
  selectedWorktreeAtom,
} from "../state/atoms";

/** 同時に走らせる取得の本数。増やしても git と syntect の待ちで頭打ちになる。 */
const MAX_INFLIGHT = 2;

/**
 * 届いた色をまとめて反映するまでの待ち。
 *
 * 1 ファイルごとに反映すると、そのたびに全ファイルの行を組み直すことになる。
 * 変更が多い比較では 1 回が重く、スクロール中に何十回も走って画面が固まる。
 */
const FLUSH_MS = 120;

/**
 * 画面に入ったファイルから順に構文ハイライトを取りに行く。
 *
 * 一覧の取得（git 1 回）では色を付けない。全ファイル分の全文読み出しと解析を
 * 待つと、変更が多い比較で最初の 1 行が出るまで固まる。読み始めを待たせず、
 * 色はスクロールした先から後追いで乗せる。
 */
export function useHighlight(visiblePaths: string[]) {
  const [diff, setDiff] = useAtom(diffAtom);
  const worktree = useAtomValue(selectedWorktreeAtom);
  const context = useAtomValue(contextLinesAtom);

  /** 取得済み・取得中のキー。比較対象が変われば作り直す。 */
  const handled = useRef(new Set<string>());
  const queue = useRef<string[]>([]);
  const inflight = useRef(0);
  /** 反映待ちの結果。まとめて 1 回で差し込む。 */
  const pending = useRef(new Map<string, DiffFile>());
  const timer = useRef(0);

  const revisionKey = diff?.resolved.revisionKey ?? null;

  // 取得に要る値は ref から読む。diff そのものを依存に入れると、色が 1 つ
  // 届くたびに取得処理を作り直すことになる。
  const source = useRef({ worktree, context, revisionKey, spec: diff?.resolved.spec });
  source.current = { worktree, context, revisionKey, spec: diff?.resolved.spec };

  useEffect(() => {
    handled.current = new Set();
    queue.current = [];
    pending.current = new Map();
    window.clearTimeout(timer.current);
    timer.current = 0;
  }, [revisionKey, context]);

  const flush = useCallback(() => {
    timer.current = 0;
    const batch = pending.current;
    if (batch.size === 0) return;
    pending.current = new Map();
    const key = source.current.revisionKey;
    setDiff((prev) =>
      prev && prev.resolved.revisionKey === key
        ? { ...prev, files: prev.files.map((f) => batch.get(f.path) ?? f) }
        : prev,
    );
  }, [setDiff]);

  const pump = useCallback(() => {
    const { worktree: dir, context: ctx, spec } = source.current;
    if (!dir || !spec) return;

    while (inflight.current < MAX_INFLIGHT) {
      const path = queue.current.shift();
      if (!path) return;
      inflight.current += 1;

      api
        .fileDiff(dir, spec, path, ctx)
        .then((file) => {
          if (!file) return;
          pending.current.set(path, file);
          if (timer.current === 0) {
            timer.current = window.setTimeout(flush, FLUSH_MS);
          }
        })
        .catch(() => {
          // 色が付かないだけで差分は読める。次の機会に取り直せるよう印を外す。
          handled.current.delete(path);
        })
        .finally(() => {
          inflight.current -= 1;
          pump();
        });
    }
  }, [flush]);

  useEffect(() => {
    if (!diff) return;
    let added = false;
    for (const path of visiblePaths) {
      if (handled.current.has(path)) continue;
      const file = diff.files.find((f) => f.path === path);
      // 既に色が付いている・付けようがないものは触らない。
      if (!file || file.binary || file.truncated || file.hunks.length === 0) {
        continue;
      }
      if (file.syntax !== null) continue;
      handled.current.add(path);
      queue.current.push(path);
      added = true;
    }
    if (added) pump();
  }, [visiblePaths, diff, pump]);

  useEffect(() => () => window.clearTimeout(timer.current), []);
}
