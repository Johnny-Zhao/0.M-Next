import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

export type ToastTone = "success" | "error" | "info";

export interface ToastApi {
  readonly success: (message: string) => void;
  readonly error: (message: string) => void;
  readonly info: (message: string) => void;
}

interface ToastItem {
  readonly id: string;
  readonly tone: ToastTone;
  readonly message: string;
}

const noopToast: ToastApi = {
  success: () => {},
  error: () => {},
  info: () => {},
};

const ToastContext = createContext<ToastApi>(noopToast);

export function ToastProvider({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  const [items, setItems] = useState<readonly ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string): void => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string): void => {
      const text = message.trim();
      if (!text) return;
      const id = `toast-${Date.now()}-${nextId.current++}`;
      setItems((current) => [...current, { id, tone, message: text }]);
      const timer = window.setTimeout(() => dismiss(id), 3000);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) {
        window.clearTimeout(timer);
      }
      timers.current.clear();
    },
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
      info: (message) => push("info", message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-label="状态提示" className="toast-viewport" role="region">
        {items.map((item) => (
          <div
            className={`toast-card toast-card-${item.tone}`}
            key={item.id}
            role={item.tone === "error" ? "alert" : "status"}
          >
            <strong>{toastToneLabel(item.tone)}</strong>
            <span>{item.message}</span>
            <button
              aria-label="关闭提示"
              onClick={() => dismiss(item.id)}
              type="button"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function toastToneLabel(tone: ToastTone): string {
  if (tone === "success") return "成功";
  if (tone === "error") return "错误";
  return "提示";
}
