import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { cx } from "../cx";
import { IconSync } from "../icons";
import {
  dismissToast,
  getToasts,
  subscribeToasts,
  type UsToastItem,
} from "./toast-store";

export function useUsToasts(): readonly UsToastItem[] {
  return useSyncExternalStore(subscribeToasts, getToasts, getToasts);
}

/** ToastHost — 右下角通知宿主(墨底 + 金图标 + 「查看/撤销」)。 */
export function UsToastHost() {
  const toasts = useUsToasts();
  if (toasts.length === 0) return null;
  return createPortal(
    <div className="us-toast-host" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="us-toast">
          <span className="us-toast__icon">
            <IconSync size={11} />
          </span>
          <span style={{ flex: 1 }}>
            <span className="us-toast__title">{t.title}</span>
            {t.desc ? <span className="us-toast__desc">{t.desc}</span> : null}
            {t.actions.length > 0 ? (
              <span className="us-toast__actions">
                {t.actions.map((a, i) => (
                  <button
                    key={i}
                    type="button"
                    className={cx(
                      "us-toast__action",
                      a.tone === "dim" && "us-toast__action--dim",
                    )}
                    onClick={() => {
                      a.onPress?.();
                      dismissToast(t.id);
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </span>
            ) : null}
          </span>
        </div>
      ))}
    </div>,
    document.body,
  );
}
