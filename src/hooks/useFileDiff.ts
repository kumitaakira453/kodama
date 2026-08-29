import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";

import { api } from "../lib/ipc";
import type { DiffFile, DiffSpec } from "../lib/types";
import {
  contextLinesAtom,
  selectedFileAtom,
  selectedWorktreeAtom,
} from "../state/atoms";
import { useToast } from "./useToast";

/**
 * 選択中のファイルを構文ハイライト付きで取り直す。
 *
 * ハイライトはファイル全文の読み出しと解析が要るので、一覧の取得では走らせない。
 * 届くまでは一覧側の（色の無い）差分をそのまま描き、届いたら差し替える。読み始めが
 * 待たされず、色は後から乗る。
 */
export function useFileDiff(
  spec: DiffSpec | null,
  fallback: DiffFile | null,
): DiffFile | null {
  const worktree = useAtomValue(selectedWorktreeAtom);
  const context = useAtomValue(contextLinesAtom);
  const path = useAtomValue(selectedFileAtom);
  const [detail, setDetail] = useState<DiffFile | null>(null);
  const { showError } = useToast();
  const generation = useRef(0);

  const key = spec ? JSON.stringify(spec) : null;
  const specRef = useRef<DiffSpec | null>(spec);
  specRef.current = spec;

  useEffect(() => {
    const gen = ++generation.current;
    setDetail(null);
    const current = specRef.current;
    if (!worktree || !path || !current) return;

    api
      .fileDiff(worktree, current, path, context)
      .then((file) => {
        if (gen === generation.current) setDetail(file);
      })
      .catch((e: unknown) => {
        // 色が付かないだけで差分は読める。うるさくしない代わりに黙らせもしない。
        if (gen === generation.current) showError(e);
      });
  }, [worktree, path, key, context, showError]);

  // 取り直しの結果が届くまでは一覧側の差分を使う。
  return detail?.path === path ? detail : fallback;
}
