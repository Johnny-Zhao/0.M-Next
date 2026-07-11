import { useSyncExternalStore } from "react";

import type { SelectionRef } from "../model/kernel";

export interface SelectionState {
  readonly current: SelectionRef | null;
  readonly selected: readonly SelectionRef[];
}

type Listener = () => void;

function selectionKey(selection: SelectionRef): string {
  return `${selection.entityType}:${selection.entityId}:${selection.fieldCode ?? ""}`;
}

export class SelectionStore {
  private state: SelectionState = { current: null, selected: [] };
  private readonly listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SelectionState => this.state;

  set(selection: SelectionRef): void {
    this.state = { current: selection, selected: [selection] };
    this.emit();
  }

  add(selection: SelectionRef): void {
    const keys = new Set(this.state.selected.map(selectionKey));
    const selected = keys.has(selectionKey(selection))
      ? this.state.selected
      : [...this.state.selected, selection];
    this.state = { current: selection, selected };
    this.emit();
  }

  toggle(selection: SelectionRef): void {
    const key = selectionKey(selection);
    const selected = this.state.selected.some(
      (entry) => selectionKey(entry) === key,
    )
      ? this.state.selected.filter((entry) => selectionKey(entry) !== key)
      : [...this.state.selected, selection];
    this.state = { current: selected.at(-1) ?? null, selected };
    this.emit();
  }

  clear(): void {
    this.state = { current: null, selected: [] };
    this.emit();
  }

  reset(): void {
    this.clear();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const selectionStore = new SelectionStore();

export function useSelectionSnapshot(): SelectionState {
  return useSyncExternalStore(
    selectionStore.subscribe,
    selectionStore.getSnapshot,
    selectionStore.getSnapshot,
  );
}
