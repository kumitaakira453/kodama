import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { api } from "../lib/ipc";
import type { ViewedStatus } from "../lib/types";
import {
  collapsedFilesAtom,
  diffAtom,
  viewedAtom,
} from "../state/atoms";
import { useToast } from "./useToast";

export interface ReviewProgress {
  total: number;
  viewed: number;
  stale: number;
  /** 全て閲覧済みで、変わったものが 1 件も無いか。 */
  done: boolean;
}

/**
 * 閲覧済みマークの読み書き。
 *
 * 印を付けた時点の差分ハッシュと今のものを突き合わせ、違えば `stale` に戻す。
 * 真偽値だけで持つと「読んだあとに変わった」が黙って消え、レビュー完了と
 * 誤って伝えてしまう。
 */
export function useViewed() {
  const diff = useAtomValue(diffAtom);
  const [viewed, setViewed] = useAtom(viewedAtom);
  const setCollapsed = useSetAtom(collapsedFilesAtom);
  const { showError } = useToast();
  const generation = useRef(0);

  const revisionKey = diff?.resolved.revisionKey ?? null;
  const hashes = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of diff?.files ?? []) map[f.path] = f.diffHash;
    return map;
  }, [diff]);

  useEffect(() => {
    const gen = ++generation.current;
    if (!revisionKey || Object.keys(hashes).length === 0) {
      setViewed({});
      return;
    }
    api
      .listViewed(revisionKey, hashes)
      .then((list) => {
        if (gen !== generation.current) return;
        const next: Record<string, ViewedStatus> = {};
        for (const v of list) next[v.file] = v.status;
        setViewed(next);
        // 読み終えたファイルは畳んでおく。開いたままだと未読を探しにくい。
        setCollapsed((prev) => {
          const merged = new Set(prev);
          for (const v of list) {
            if (v.status === "viewed") merged.add(v.file);
          }
          return merged;
        });
      })
      .catch((e: unknown) => {
        if (gen === generation.current) showError(e);
      });
  }, [revisionKey, hashes, setViewed, setCollapsed, showError]);

  const toggle = useCallback(
    async (file: string) => {
      if (!revisionKey) return;
      const next = viewed[file] === "viewed" ? false : true;
      // 押した瞬間に反映する。往復を待つと反応が鈍い。
      setViewed((prev) => ({ ...prev, [file]: next ? "viewed" : "unviewed" }));
      setCollapsed((prev) => {
        const s = new Set(prev);
        if (next) s.add(file);
        else s.delete(file);
        return s;
      });
      try {
        await api.setViewed(revisionKey, file, hashes[file] ?? "", next);
      } catch (e) {
        // 失敗したら元へ戻す。画面とディスクの食い違いを残さない。
        setViewed((prev) => ({ ...prev, [file]: next ? "unviewed" : "viewed" }));
        showError(e);
      }
    },
    [revisionKey, viewed, hashes, setViewed, setCollapsed, showError],
  );

  const progress = useMemo((): ReviewProgress => {
    const files = (diff?.files ?? []).filter((f) => !f.generated);
    let done = 0;
    let stale = 0;
    for (const f of files) {
      const s = viewed[f.path];
      if (s === "viewed") done += 1;
      else if (s === "stale") stale += 1;
    }
    return {
      total: files.length,
      viewed: done,
      stale,
      // stale が 1 件でも残っていれば完了にしない。真偽値のままだと
      // 「変更されたのに完了」という最悪の嘘をつくことになる。
      done: files.length > 0 && done === files.length && stale === 0,
    };
  }, [diff, viewed]);

  return { viewed, toggle, progress };
}
