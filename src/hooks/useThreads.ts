import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";

import { api } from "../lib/ipc";
import type { ThreadInput } from "../lib/types";
import {
  diffAtom,
  selectedWorktreeAtom,
  threadsAtom,
} from "../state/atoms";
import { useToast } from "./useToast";

/**
 * 指摘の読み込みと更新。
 *
 * 台帳は CLI（AI 側）からも書き換わる。ウィンドウにフォーカスが戻ったときに
 * 読み直す。これが無いと、返信や解決が済んでいるのに古い画面を見て
 * 「何も起きていない」と受け取ってしまう。
 */
export function useThreads() {
  const [threads, setThreads] = useAtom(threadsAtom);
  const worktree = useAtomValue(selectedWorktreeAtom);
  const diff = useAtomValue(diffAtom);
  const { showError } = useToast();
  const generation = useRef(0);

  const revisionKey = diff?.resolved.revisionKey ?? null;

  const refresh = useCallback(() => {
    const gen = ++generation.current;
    if (!worktree) {
      setThreads([]);
      return;
    }
    api
      .listThreads(worktree, revisionKey)
      .then((list) => {
        if (gen === generation.current) setThreads(list);
      })
      .catch((e: unknown) => {
        if (gen === generation.current) showError(e);
      });
  }, [worktree, revisionKey, setThreads, showError]);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const add = useCallback(
    async (input: ThreadInput) => {
      try {
        await api.addThread(input);
        refresh();
      } catch (e) {
        showError(e);
      }
    },
    [refresh, showError],
  );

  const reply = useCallback(
    async (id: string, body: string) => {
      try {
        await api.replyThread(id, "you", body);
        refresh();
      } catch (e) {
        showError(e);
      }
    },
    [refresh, showError],
  );

  const resolve = useCallback(
    async (id: string) => {
      try {
        await api.resolveThread(id, "you");
        refresh();
      } catch (e) {
        showError(e);
      }
    },
    [refresh, showError],
  );

  const drop = useCallback(
    async (id: string) => {
      try {
        await api.dropThread(id, "you");
        refresh();
      } catch (e) {
        showError(e);
      }
    },
    [refresh, showError],
  );

  return { threads, refresh, add, reply, resolve, drop };
}
