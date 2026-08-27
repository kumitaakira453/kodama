import { useAtom } from "jotai";
import { useCallback } from "react";

import { toastsAtom, type Toast } from "../../state/atoms";
import { Icon } from "./Icon";

const ICONS: Record<Toast["kind"], string> = {
  error: "error",
  info: "info",
  success: "check_circle",
};

/**
 * 失敗を握り潰さないための出口。エラーは必ずここか、より強いダイアログに出す。
 */
export function Toasts() {
  const [toasts, setToasts] = useAtom(toastsAtom);
  const dismiss = useCallback(
    (id: number) => setToasts((list) => list.filter((t) => t.id !== id)),
    [setToasts],
  );

  if (toasts.length === 0) return null;

  return (
    <div className="kd-toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`kd-toast kd-toast--${t.kind}`}>
          <Icon name={ICONS[t.kind]} size={16} />
          <span className="kd-toast__text">{t.text}</span>
          <button
            className="kd-toast__close"
            onClick={() => dismiss(t.id)}
            aria-label="閉じる"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
