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
    this.replace({ current: selection, selected: [selection] });
  }

  add(selection: SelectionRef): void {
    const keys = new Set(this.state.selected.map(selectionKey));
    const selected = keys.has(selectionKey(selection))
      ? this.state.selected
      : [...this.state.selected, selection];
    this.replace({ current: selection, selected });
  }

  toggle(selection: SelectionRef): void {
    const key = selectionKey(selection);
    const selected = this.state.selected.some(
      (entry) => selectionKey(entry) === key,
    )
      ? this.state.selected.filter((entry) => selectionKey(entry) !== key)
      : [...this.state.selected, selection];
    this.replace({ current: selected.at(-1) ?? null, selected });
  }

  clear(): void {
    this.replace({ current: null, selected: [] });
  }

  reset(): void {
    this.clear();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  private replace(next: SelectionState): void {
    if (selectionStateEquals(this.state, next)) return;
    this.state = next;
    this.emit();
  }
}

function selectionStateEquals(
  left: SelectionState,
  right: SelectionState,
): boolean {
  return (
    selectionEquals(left.current, right.current) &&
    left.selected.length === right.selected.length &&
    left.selected.every(
      (selection, index) =>
        selectionKey(selection) === selectionKey(right.selected[index]!),
    )
  );
}

function selectionEquals(
  left: SelectionRef | null,
  right: SelectionRef | null,
): boolean {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      selectionKey(left) === selectionKey(right))
  );
}

export const selectionStore = new SelectionStore();

export function useSelectionSnapshot(): SelectionState {
  return useSyncExternalStore(
    selectionStore.subscribe,
    selectionStore.getSnapshot,
    selectionStore.getSnapshot,
  );
}
