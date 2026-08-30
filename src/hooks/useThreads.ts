import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";

import { api } from "../lib/ipc";
import type { ThreadInput } from "../lib/types";
import {
  allThreadsAtom,
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
  const threads = useAtomValue(threadsAtom);
  const setAll = useSetAtom(allThreadsAtom);
  const worktree = useAtomValue(selectedWorktreeAtom);
  const diff = useAtomValue(diffAtom);
  const { showError } = useToast();
  const generation = useRef(0);

  const revisionKey = diff?.resolved.revisionKey ?? null;

  const refresh = useCallback(() => {
    const gen = ++generation.current;
    if (!worktree) {
      setAll([]);
      return;
    }
    // 比較で絞らずに取る。取り込まれた指摘をどこに出すかは、受け取った側で決める。
    // revisionKey は取得の条件ではないが、比較が変わると追跡の結果も変わるので
    // 読み直しの合図として見る。
    api
      .listThreads(worktree, null)
      .then((list) => {
        if (gen === generation.current) setAll(list);
      })
      .catch((e: unknown) => {
        if (gen === generation.current) showError(e);
      });
  }, [worktree, revisionKey, setAll, showError]);

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
      // 書いたものは押した瞬間に並べる。台帳へ書いて読み直すまで待つと、
      // 入力欄が空になったあと何も無い時間ができ、そのあと別の形で現れる。
      // 自分が書いた事実は往復の結果を待たなくても分かっている。
      setAll((prev) =>
        prev.map((v) =>
          v.thread.id === id
            ? {
                ...v,
                thread: {
                  ...v.thread,
                  comments: [
                    ...v.thread.comments,
                    {
                      id: `pending-${v.thread.comments.length}`,
                      author: "you",
                      body,
                      createdAt: Date.now(),
                    },
                  ],
                },
              }
            : v,
        ),
      );
      try {
        await api.replyThread(id, "you", body);
      } catch (e) {
        showError(e);
      }
      // 成否に関わらず読み直す。失敗していれば、仮に並べたものはここで消える。
      refresh();
    },
    [refresh, setAll, showError],
  );

  /**
   * 閉じる操作。押した時点で一覧から外す。
   *
   * 台帳への書き込みを待ってから消すと、押してから間が空く。閉じたのか
   * 効いていないのか分からず、もう一度押すことになる。
   */
  const close = useCallback(
    async (id: string, run: () => Promise<unknown>) => {
      setAll((prev) => prev.filter((v) => v.thread.id !== id));
      try {
        await run();
      } catch (e) {
        showError(e);
      }
      refresh();
    },
    [refresh, setAll, showError],
  );

  const edit = useCallback(
    async (id: string, commentId: string, body: string) => {
      // 押した瞬間に書き換える。往復を待つと、直したはずの文が元のまま残る。
      setAll((prev) =>
        prev.map((v) =>
          v.thread.id === id
            ? {
                ...v,
                thread: {
                  ...v.thread,
                  comments: v.thread.comments.map((c) =>
                    c.id === commentId ? { ...c, body } : c,
                  ),
                },
              }
            : v,
        ),
      );
      try {
        await api.editComment(id, commentId, body);
      } catch (e) {
        showError(e);
      }
      refresh();
    },
    [refresh, setAll, showError],
  );

  const remove = useCallback(
    async (id: string, commentId: string) => {
      setAll((prev) =>
        prev.flatMap((v) => {
          if (v.thread.id !== id) return [v];
          // 最初の発言は指摘の中身そのもの。消せば指摘ごと無くなる。
          if (v.thread.comments[0]?.id === commentId) return [];
          return [
            {
              ...v,
              thread: {
                ...v.thread,
                comments: v.thread.comments.filter((c) => c.id !== commentId),
              },
            },
          ];
        }),
      );
      try {
        await api.deleteComment(id, commentId);
      } catch (e) {
        showError(e);
      }
      refresh();
    },
    [refresh, setAll, showError],
  );

  const resolve = useCallback(
    (id: string) => close(id, () => api.resolveThread(id, "you")),
    [close],
  );

  const drop = useCallback(
    (id: string) => close(id, () => api.dropThread(id, "you")),
    [close],
  );

  return { threads, refresh, add, reply, edit, remove, resolve, drop };
}
