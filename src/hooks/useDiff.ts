import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";

import { api } from "../lib/ipc";
import { buildSpec } from "../lib/revisions";
import type { DiffFile, DiffSpec } from "../lib/types";
import {
  collapsedFilesAtom,
  commitSelectionAtom,
  contextLinesAtom,
  diffAtom,
  diffLoadingAtom,
  revisionsAtom,
  selectedWorktreeAtom,
} from "../state/atoms";
import { useToast } from "./useToast";

/**
 * 選択中の worktree と比較対象から差分を読む。
 *
 * 生成ファイルは届いた時点で畳んでおく。lock ファイルの数万行が既定で開いていると
 * 目的の変更まで延々スクロールすることになる。
 */
export function useDiff() {
  const worktree = useAtomValue(selectedWorktreeAtom);
  const context = useAtomValue(contextLinesAtom);
  const selection = useAtomValue(commitSelectionAtom);
  const revisions = useAtomValue(revisionsAtom);
  const setDiff = useSetAtom(diffAtom);
  const setLoading = useSetAtom(diffLoadingAtom);
  const setCollapsed = useSetAtom(collapsedFilesAtom);
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
        setCollapsed(collapsedByDefault(res.files));
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
  }, [worktree, key, context, setDiff, setLoading, setCollapsed, showError]);

  useEffect(reload, [reload]);

  return { reload };
}

/**
 * 既定で開いておく行数の上限。
 *
 * 900 ファイル・数万行の比較で全部を開くと、行の組み立てだけで画面が固まる。
 * 上から順に開けるところまで開き、残りは畳んだ見出しで出す。読みたいものは
 * 押せば開くし、左のツリーには全部並ぶ。
 */
const OPEN_LINE_BUDGET = 4000;

function collapsedByDefault(files: DiffFile[]): Set<string> {
  const collapsed = new Set<string>();
  let budget = OPEN_LINE_BUDGET;
  for (const file of files) {
    // 生成ファイルは中身を読まないので、量に関わらず畳む。
    if (file.generated || budget <= 0) {
      collapsed.add(file.path);
      continue;
    }
    budget -= file.hunks.reduce((n, h) => n + h.lines.length, 0);
  }
  return collapsed;
}
