import { Channel } from "@tauri-apps/api/core";
import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";

import { api } from "../lib/ipc";
import type { WatchEvent } from "../lib/types";
import { diffAtom, selectedWorktreeAtom } from "../state/atoms";

interface WatchHandlers {
  onFiles: () => void;
  onLedger: () => void;
}

/**
 * 作業ツリーと台帳の変更を監視する。
 *
 * 台帳は CLI（AI 側）から書き換わる。diff を見ながら直させる運用なので、
 * フォーカスが戻るのを待たずに反映する。
 *
 * 作業ツリーの監視は内容が変わり得る比較（未コミット / ステージ済み）のときだけ
 * 張る。固定のコミットを見ているときにファイルが変わっても差分は変わらない。
 */
export function useWatch({ onFiles, onLedger }: WatchHandlers) {
  const worktree = useAtomValue(selectedWorktreeAtom);
  const diff = useAtomValue(diffAtom);
  const mutable = diff?.resolved.mutable ?? false;

  // ハンドラは毎描画で作り直されるので、購読を張り直さずに済むよう ref に置く。
  const handlers = useRef({ onFiles, onLedger });
  handlers.current = { onFiles, onLedger };

  useEffect(() => {
    if (!worktree) return;
    let stopped = false;
    let id: number | null = null;

    const channel = new Channel<WatchEvent>();
    channel.onmessage = (event) => {
      if (event.kind === "ledger") handlers.current.onLedger();
      else if (mutable) handlers.current.onFiles();
    };

    api
      .startWatch(worktree, channel)
      .then((handle) => {
        if (stopped) {
          void api.stopWatch(handle);
          return;
        }
        id = handle;
      })
      .catch(() => {
        // 監視できなくても手動の再読込で回る。うるさく通知しない。
      });

    return () => {
      stopped = true;
      if (id !== null) void api.stopWatch(id);
    };
  }, [worktree, mutable]);
}
