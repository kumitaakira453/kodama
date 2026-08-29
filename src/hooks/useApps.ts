import { useAtom } from "jotai";
import { atom } from "jotai";
import { useCallback, useEffect } from "react";

import { api } from "../lib/ipc";
import type { AppTarget } from "../lib/types";
import { useToast } from "./useToast";

/** 起動できるアプリ。起動時に 1 度だけ引く。 */
const appsAtom = atom<AppTarget[]>([]);

/**
 * 外部アプリの起動。
 *
 * 判定はすべて Rust 側で済ませ、フロントは返ってきた配列を並べるだけにする。
 * 押しても無反応になりうる項目をメニューに出さないため。
 */
export function useApps() {
  const [apps, setApps] = useAtom(appsAtom);
  const { showError } = useToast();

  useEffect(() => {
    if (apps.length > 0) return;
    api.installedApps().then(setApps).catch(showError);
  }, [apps.length, setApps, showError]);

  const open = useCallback(
    (appId: string, path: string, line: number | null) => {
      // 失敗はダイアログではなく通知に出す。黙って何も起きない状態を作らない。
      void api.openInApp(appId, path, line).catch(showError);
    },
    [showError],
  );

  return { apps, open };
}
