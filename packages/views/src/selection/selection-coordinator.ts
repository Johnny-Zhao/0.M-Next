import type { SelectionRef } from "./selection-ref";

export type SelectionListener = (selection: SelectionRef | null) => void;

export class SelectionCoordinator {
  private workspaceId: string | null = null;
  private selection: SelectionRef | null = null;
  private readonly listeners = new Set<SelectionListener>();

  switchWorkspace(workspaceId: string): void {
    if (this.workspaceId === workspaceId) return;
    this.workspaceId = workspaceId;
    this.publish(null);
  }

  select(selection: SelectionRef): void {
    this.publish(selection);
  }

  current(): SelectionRef | null {
    return this.selection;
  }

  subscribe(listener: SelectionListener): () => void {
    this.listeners.add(listener);
    listener(this.selection);
    return () => this.listeners.delete(listener);
  }

  private publish(selection: SelectionRef | null): void {
    this.selection = selection;
    this.listeners.forEach((listener) => listener(selection));
  }
}
