import { useSyncExternalStore } from "react";

interface ExpressionCreateDialogState {
  readonly open: boolean;
  readonly revision: number;
}

type Listener = () => void;

let state: ExpressionCreateDialogState = { open: false, revision: 0 };
const listeners = new Set<Listener>();

export function openExpressionCreateDialog(): void {
  state = { open: true, revision: state.revision + 1 };
  emit();
}

export function closeExpressionCreateDialog(): void {
  if (!state.open) return;
  state = { ...state, open: false };
  emit();
}

export function getExpressionCreateDialogState(): ExpressionCreateDialogState {
  return state;
}

export function useExpressionCreateDialogState(): ExpressionCreateDialogState {
  return useSyncExternalStore(
    subscribe,
    getExpressionCreateDialogState,
    getExpressionCreateDialogState,
  );
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  listeners.forEach((listener) => listener());
}
