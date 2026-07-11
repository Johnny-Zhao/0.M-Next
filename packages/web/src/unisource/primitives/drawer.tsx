import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { IconClose } from "./icons";

/**
 * Drawer — 右侧抽屉容器(360px,1280 档降 320 且 overlay;AI 对话/ChatDrawer 宿主)。
 * P0 仅容器:头部(标题+关闭)+ 滚动内容;Esc/遮罩关闭。
 */
export function UsDrawer({
  open,
  onClose,
  title,
  headerExtra,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  headerExtra?: ReactNode;
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
    <>
      <div className="us-drawer-backdrop" onClick={onClose} aria-hidden />
      <aside
        className="us-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
      >
        <div className="us-drawer__header">
          <span className="us-drawer__title">{title}</span>
          {headerExtra}
          <button
            type="button"
            className="us-iconbtn"
            aria-label="关闭"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </div>
        <div className="us-drawer__body">{children}</div>
      </aside>
    </>,
    document.body,
  );
}
