import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { IconClose } from "./icons";

/**
 * Modal — 居中对话框容器(shadow.float;Esc/遮罩关闭)。
 * DeleteConfirmModal/ShareDialog(交接规格 08-①②)后续基于本容器补稿实现。
 */
export function UsModal({
  open,
  onClose,
  title,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="us-modal-backdrop" onClick={onClose}>
      <div
        className="us-modal"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="us-modal__header">
          <span className="us-modal__title">{title}</span>
          <button
            type="button"
            className="us-iconbtn"
            aria-label="关闭"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </div>
        <div className="us-modal__body">{children}</div>
        {footer ? <div className="us-modal__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
