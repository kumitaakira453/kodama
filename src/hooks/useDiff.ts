import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../lib/ipc";
import type { DiffResponse, DiffSpec } from "../lib/types";
import {
  contextLinesAtom,
  selectedFileAtom,
  selectedWorktreeAtom,
} from "../state/atoms";
import { useToast } from "./useToast";

interface DiffState {
  diff: DiffResponse | null;
  loading: boolean;
  reload: () => void;
}

/**
 * 選択中の worktree と比較対象から差分を読む。
 *
 * 読み込み中に選択が変わったら古い結果を捨てる。取得できたら、選択中のファイルが
 * 一覧から消えていた場合だけ選択を外す（同じファイルが残っているなら保つ）。
 */
export function useDiff(spec: DiffSpec | null): DiffState {
  const worktree = useAtomValue(selectedWorktreeAtom);
  const context = useAtomValue(contextLinesAtom);
  const setSelectedFile = useSetAtom(selectedFileAtom);
  const [diff, setDiff] = useState<DiffResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const { showError } = useToast();
  const generation = useRef(0);

  // spec は毎描画で作り直されるので、同一性ではなく内容で依存を判定する。
  // 実体は ref から読み、キーは再取得の要否だけに使う。
  const key = spec ? JSON.stringify(spec) : null;
  const specRef = useRef<DiffSpec | null>(spec);
  specRef.current = spec;

  const run = useCallback(() => {
    const gen = ++generation.current;
    const current = specRef.current;
    if (!worktree || !key || !current) {
      setDiff(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .loadDiff(worktree, current, context)
      .then((res) => {
        if (gen !== generation.current) return;
        setDiff(res);
        setSelectedFile((prev) =>
          prev && res.files.some((f) => f.path === prev) ? prev : null,
        );
      })
      .catch((e: unknown) => {
        if (gen !== generation.current) return;
        setDiff(null);
        showError(e);
      })
      .finally(() => {
        if (gen === generation.current) setLoading(false);
      });
  }, [worktree, key, context, setSelectedFile, showError]);

  useEffect(run, [run]);

  return { diff, loading, reload: run };
}
