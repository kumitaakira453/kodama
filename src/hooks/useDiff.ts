import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";

import { api } from "../lib/ipc";
import { buildSpec } from "../lib/revisions";
import type { DiffSpec } from "../lib/types";
import {
  commitSelectionAtom,
  contextLinesAtom,
  diffAtom,
  diffLoadingAtom,
  fileOpenOverridesAtom,
  revisionsAtom,
  selectedWorktreeAtom,
} from "../state/atoms";
import { useToast } from "./useToast";

/** 選択中の worktree と比較対象から差分を読む。 */
export function useDiff() {
  const worktree = useAtomValue(selectedWorktreeAtom);
  const context = useAtomValue(contextLinesAtom);
  const selection = useAtomValue(commitSelectionAtom);
  const revisions = useAtomValue(revisionsAtom);
  const setDiff = useSetAtom(diffAtom);
  const setLoading = useSetAtom(diffLoadingAtom);
  const setOverrides = useSetAtom(fileOpenOverridesAtom);
  const { showError } = useToast();
  const generation = useRef(0);

  const spec = buildSpec(
    selection,
    revisions?.commits ?? [],
    revisions?.defaultBase ?? null,
  );
  // spec は毎描画で作り直されるので、同一性ではなく内容で依存を判定する。
  const key = spec ? JSON.stringify(spec) : null;
  const specRef = useRef<DiffSpec | null>(spec);
  specRef.current = spec;

  const reload = useCallback(() => {
    const gen = ++generation.current;
    const current = specRef.current;
    if (!worktree || !current) {
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
        // 前の比較で開閉したぶんは持ち越さない。顔ぶれが変わっている。
        setOverrides({});
      })
      .catch((e: unknown) => {
        if (gen !== generation.current) return;
        setDiff(null);
        showError(e);
      })
      .finally(() => {
        if (gen === generation.current) setLoading(false);
      });
    // key は再取得の要否だけに使う。実体は ref から読む。
  }, [worktree, key, context, setDiff, setLoading, setOverrides, showError]);

  useEffect(reload, [reload]);

  return { reload };
}
