import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";

import { api } from "../lib/ipc";
import {
  contextLinesAtom,
  diffAtom,
  selectedWorktreeAtom,
} from "../state/atoms";

/** 同時に走らせる取得の本数。増やしても git と syntect の待ちで頭打ちになる。 */
const MAX_INFLIGHT = 2;

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
  const revisionKey = diff?.resolved.revisionKey ?? null;

  useEffect(() => {
    handled.current = new Set();
    queue.current = [];
  }, [revisionKey, context]);

  const pump = useCallback(() => {
    if (!worktree || !diff) return;
    const spec = diff.resolved.spec;

    while (inflight.current < MAX_INFLIGHT) {
      const path = queue.current.shift();
      if (!path) return;
      inflight.current += 1;

      api
        .fileDiff(worktree, spec, path, context)
        .then((file) => {
          if (!file) return;
          // 取得中に比較対象が変わっていたら捨てる。
          setDiff((prev) =>
            prev && prev.resolved.revisionKey === revisionKey
              ? {
                  ...prev,
                  files: prev.files.map((f) => (f.path === path ? file : f)),
                }
              : prev,
          );
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
  }, [worktree, diff, context, revisionKey, setDiff]);

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
}
