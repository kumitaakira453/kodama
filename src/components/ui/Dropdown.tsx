import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Icon } from "./Icon";

interface DropdownProps {
  /** ボタンに出す本文。 */
  label: ReactNode;
  /** ボタンの左に添えるアイコン名。 */
  icon?: string;
  title?: string;
  /** ポップオーバーの最小幅。 */
  width?: number;
  /** 差分の行に収める小さい版。上部バーの版より一回り小さくなる。 */
  compact?: boolean;
  /** 開いている間だけ描く。閉じているときは中身を作らない。 */
  children: (close: () => void) => ReactNode;
}

/** ポップオーバーと画面端の間に残す余白。 */
const EDGE = 8;

/** これより下が狭ければ上向きに開く。 */
const MIN_BELOW = 180;

interface Placement {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

/**
 * 上部バーとファイル見出しの選択 UI。外側クリックと Esc で閉じる。
 *
 * ネイティブメニューは動的な項目を並べるには重いので自前で持つ。
 * ポップオーバーは body へ出す。差分の行は仮想化のため transform を持ち、
 * transform は stacking context を作るので、行の中に置くと z-index を上げても
 * 後続の行の下に潜る。スクロール領域の overflow にも切られる。
 */
export function Dropdown({
  label,
  icon,
  title,
  width = 280,
  compact = false,
  children,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Placement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useLayoutEffect(() => {
    setPlace(open ? placeMenu(buttonRef.current, width) : null);
  }, [open, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return;
      if (buttonRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // 下地が動くと基準にしたボタンの位置がずれる。追いかけずに閉じる。
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) {
        return;
      }
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  return (
    <div className="kd-dd" data-compact={compact || undefined}>
      <button
        ref={buttonRef}
        className="kd-dd__button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={title}
      >
        {icon ? <Icon name={icon} size={compact ? 13 : 15} /> : null}
        <span className="kd-dd__label">{label}</span>
        <Icon name="expand_more" size={compact ? 14 : 16} />
      </button>

      {open && place
        ? createPortal(
            <div
              ref={menuRef}
              className="kd-dd__menu"
              role="menu"
              style={{
                left: place.left,
                top: place.top,
                bottom: place.bottom,
                maxHeight: place.maxHeight,
                minWidth: width,
                maxWidth: window.innerWidth - EDGE * 2,
              }}
            >
              {children(close)}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** ボタンの直下に置く。下が狭ければ上へ返し、左右は画面内に収める。 */
function placeMenu(button: HTMLElement | null, width: number): Placement | null {
  if (!button) return null;
  const rect = button.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom - EDGE * 2;
  const above = rect.top - EDGE * 2;
  const left = Math.max(
    EDGE,
    Math.min(rect.left, window.innerWidth - width - EDGE),
  );
  if (below < MIN_BELOW && above > below) {
    return {
      left,
      bottom: window.innerHeight - rect.top + 6,
      maxHeight: above,
    };
  }
  return { left, top: rect.bottom + 6, maxHeight: below };
}
