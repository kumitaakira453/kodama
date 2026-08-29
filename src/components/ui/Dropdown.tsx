import { useEffect, useRef, useState, type ReactNode } from "react";

import { Icon } from "./Icon";

interface DropdownProps {
  /** ボタンに出す本文。 */
  label: ReactNode;
  /** ボタンの左に添えるアイコン名。 */
  icon?: string;
  title?: string;
  /** ポップオーバーの最小幅。 */
  width?: number;
  /** 開いている間だけ描く。閉じているときは中身を作らない。 */
  children: (close: () => void) => ReactNode;
}

/**
 * 上部バーの選択 UI。外側クリックと Esc で閉じる。
 *
 * ネイティブメニューは動的な項目を並べるには重いので自前で持つ。
 */
export function Dropdown({
  label,
  icon,
  title,
  width = 280,
  children,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Node && !ref.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="kd-dd" ref={ref}>
      <button
        className="kd-dd__button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={title}
      >
        {icon ? <Icon name={icon} size={15} /> : null}
        <span className="kd-dd__label">{label}</span>
        <Icon name="expand_more" size={16} />
      </button>

      {open ? (
        <div className="kd-dd__menu" style={{ minWidth: width }} role="menu">
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}
