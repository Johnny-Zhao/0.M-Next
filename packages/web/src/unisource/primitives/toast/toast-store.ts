/**
 * Toast 纯逻辑 store(仓库模式:类外置状态 + useSyncExternalStore 绑定,可单测)。
 * 规则(交接规格 §02 Toast):写入类 5s 自动消失,含撤销(动作)的 8s。
 */

export interface UsToastAction {
  label: string;
  tone?: "gold" | "dim";
  onPress?: () => void;
}

export interface UsToastInput {
  title: string;
  desc?: string;
  actions?: UsToastAction[];
  durationMs?: number;
}

export interface UsToastItem extends Required<Pick<UsToastInput, "title">> {
  id: number;
  desc?: string;
  actions: UsToastAction[];
  durationMs: number;
}

export const TOAST_DURATION_DEFAULT = 5000;
export const TOAST_DURATION_WITH_ACTION = 8000;

let seq = 0;
let items: readonly UsToastItem[] = [];
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit(): void {
  for (const fn of listeners) fn();
}

export function getToasts(): readonly UsToastItem[] {
  return items;
}

export function subscribeToasts(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function pushToast(input: UsToastInput): number {
  const id = ++seq;
  const actions = input.actions ?? [];
  const durationMs =
    input.durationMs ??
    (actions.length > 0 ? TOAST_DURATION_WITH_ACTION : TOAST_DURATION_DEFAULT);
  items = [
    ...items,
    { id, title: input.title, desc: input.desc, actions, durationMs },
  ];
  if (durationMs !== Infinity) {
    timers.set(
      id,
      setTimeout(() => dismissToast(id), durationMs),
    );
  }
  emit();
  return id;
}

export function dismissToast(id: number): void {
  const timer = timers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(id);
  }
  if (items.some((t) => t.id === id)) {
    items = items.filter((t) => t.id !== id);
    emit();
  }
}

/** 仅测试用:清空全部状态与定时器。 */
export function resetToastsForTest(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  items = [];
  seq = 0;
}
