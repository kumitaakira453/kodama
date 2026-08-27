import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Icon } from "./Icon";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ title, onClose, children }: ModalProps) {
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
        className="kd-modal"
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
      </div>
    </div>,
    document.body,
  );
}
