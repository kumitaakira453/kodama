import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";

import { updateCheckNonceAtom, updateStatusAtom } from "../../state/updater";
import { Button, IconButton } from "./Button";
import { Icon } from "./Icon";

type Phase = "hidden" | "available" | "downloading" | "error";

/**
 * 更新の通知。
 *
 * 起動時に一度確認し、メニューの「更新を確認」でも走る。更新があれば右下に
 * 出し、押せばダウンロードから再起動まで進む。
 */
export function UpdateBanner() {
  const [phase, setPhase] = useState<Phase>("hidden");
  const [update, setUpdate] = useState<Update | null>(null);
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const nonce = useAtomValue(updateCheckNonceAtom);
  const setStatus = useSetAtom(updateStatusAtom);

  useEffect(() => {
    // Tauri の外（dev のブラウザなど）では静かに何もしない。
    if (!("__TAURI_INTERNALS__" in window)) return;
    let cancelled = false;

    void (async () => {
      setStatus("checking");
      try {
        const found = await check();
        if (cancelled) return;
        if (found) {
          setUpdate(found);
          setPhase("available");
          setStatus("available");
        } else {
          setStatus("uptodate");
        }
      } catch {
        // 更新サーバに届かないだけで、アプリは使える。黙って諦める。
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nonce, setStatus]);

  const install = async () => {
    if (!update) return;
    setPhase("downloading");
    setError(null);
    try {
      let total = 0;
      let done = 0;
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") {
          total = e.data.contentLength ?? 0;
        } else if (e.event === "Progress") {
          done += e.data.chunkLength;
          setPct(total > 0 ? Math.round((done / total) * 100) : 0);
        }
      });
      await relaunch();
    } catch (err) {
      setError(String(err));
      setPhase("error");
    }
  };

  if (phase === "hidden" || !update) return null;

  return (
    <aside className="kd-update" role="status">
      <span className="kd-update__mark" aria-hidden>
        <Icon name="park" size={18} />
      </span>

      <div className="kd-update__body">
        <p className="kd-update__title">
          新しい版 {update.version} があります
        </p>
        <p className="kd-update__sub">いま v{update.currentVersion}</p>

        {update.body && phase === "available" ? (
          <p className="kd-update__note">{update.body}</p>
        ) : null}
        {phase === "error" ? (
          <p className="kd-update__error">更新できませんでした: {error}</p>
        ) : null}

        {phase === "downloading" ? (
          <div className="kd-update__progress">
            <span className="kd-update__bar">
              <span className="kd-update__fill" style={{ width: `${pct}%` }} />
            </span>
            <span className="kd-update__pct">受け取り中… {pct}%</span>
          </div>
        ) : (
          <div className="kd-update__actions">
            <Button variant="primary" onClick={() => void install()}>
              {phase === "error" ? "やり直す" : "更新して再起動"}
            </Button>
            <Button onClick={() => setPhase("hidden")}>あとで</Button>
          </div>
        )}
      </div>

      <IconButton
        name="close"
        label="閉じる"
        size={16}
        onClick={() => setPhase("hidden")}
      />
    </aside>
  );
}
