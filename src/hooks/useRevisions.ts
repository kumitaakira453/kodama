import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";

import { api } from "../lib/ipc";
import {
  baseOverridesAtom,
  revisionsAtom,
  selectedWorktreeAtom,
} from "../state/atoms";
import { useToast } from "./useToast";

/**
 * 選択中 worktree のコミット一覧を読む。切り替えたら前の結果を捨てる。
 *
 * 起点を変えると並ぶコミットも変わる。一覧は「起点から現在まで」なので、
 * 起点を変えたら取り直す。
 */
export function useRevisions() {
  const worktree = useAtomValue(selectedWorktreeAtom);
  const base = useAtomValue(baseOverridesAtom)[worktree ?? ""] ?? null;
  const setRevisions = useSetAtom(revisionsAtom);
  const { showError } = useToast();
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    setRevisions(null);
    if (!worktree) return;

    api
      .listRevisions(worktree, base)
      .then((list) => {
        if (gen === generation.current) setRevisions(list);
      })
      .catch((e: unknown) => {
        if (gen === generation.current) showError(e);
      });
  }, [worktree, base, setRevisions, showError]);
}
