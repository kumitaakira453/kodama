import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Icon } from "./Icon";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 下端に固定して出す操作。本文がスクロールしても隠れない。 */
  footer?: ReactNode;
  /** 幅。選ぶだけのものは狭くする。 */
  size?: "sm" | "md";
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  size = "md",
}: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="kd-modal__backdrop" onClick={onClose}>
      <div
        className={`kd-modal kd-modal--${size}`}
        role="dialog"
        aria-modal
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="kd-modal__head">
          <h2 className="kd-modal__title">{title}</h2>
          <button
            className="kd-iconbtn"
            onClick={onClose}
            aria-label="閉じる"
            title="閉じる (Esc)"
          >
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="kd-modal__body">{children}</div>
        {footer ? <footer className="kd-modal__foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
