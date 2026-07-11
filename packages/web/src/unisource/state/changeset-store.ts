import { useSyncExternalStore } from "react";

import type {
  ChangeItem,
  ChangeSet,
  DataFieldPrimitive,
} from "../model/kernel";
import { cloneDemoSeed, type DemoSeed } from "../seed/demo-seed";
import { workspaceStore, type WorkspaceStore } from "./workspace-store";

export interface ChangeSetState {
  readonly changeSets: readonly ChangeSet[];
}

export type ChangeSetResult =
  | { readonly ok: true; readonly changeSet: ChangeSet }
  | { readonly ok: false; readonly reason: string };

type Listener = () => void;

export class ChangeSetStore {
  private state: ChangeSetState;
  private readonly listeners = new Set<Listener>();

  constructor(
    seed: DemoSeed = cloneDemoSeed(),
    private readonly workspace: WorkspaceStore = workspaceStore,
  ) {
    this.state = { changeSets: seed.changeSets };
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ChangeSetState => this.state;

  reset(seed: DemoSeed = cloneDemoSeed()): void {
    this.state = { changeSets: seed.changeSets };
    this.emit();
  }

  getPending(): readonly ChangeSet[] {
    return this.state.changeSets.filter(
      (changeSet) => changeSet.status === "pending",
    );
  }

  submit(changeSet: ChangeSet): ChangeSet {
    this.state = { changeSets: [changeSet, ...this.state.changeSets] };
    this.emit();
    return changeSet;
  }

  confirmAll(changeSetId: string): ChangeSetResult {
    const changeSet = this.findChangeSet(changeSetId);
    if (!changeSet) return missingChangeSet(changeSetId);
    const blocked = changeSet.items.find(
      (item) =>
        (item.needsConfirm === true || (item.confidence ?? 1) < 0.8) &&
        item.confirmed !== true,
    );
    if (blocked) {
      return {
        ok: false,
        reason: "低置信项需逐项确认后才能整单写入",
      };
    }
    return this.applyItems(
      changeSet,
      changeSet.items
        .filter((item) => item.applied !== true)
        .map((item) => item.id),
    );
  }

  reject(changeSetId: string): ChangeSetResult {
    const changeSet = this.findChangeSet(changeSetId);
    if (!changeSet) return missingChangeSet(changeSetId);
    const rejected = { ...changeSet, status: "rejected" as const };
    this.replace(rejected);
    return { ok: true, changeSet: rejected };
  }

  acceptItems(
    changeSetId: string,
    itemIds: readonly string[],
  ): ChangeSetResult {
    const changeSet = this.findChangeSet(changeSetId);
    if (!changeSet) return missingChangeSet(changeSetId);
    return this.applyItems(changeSet, itemIds);
  }

  private applyItems(
    changeSet: ChangeSet,
    itemIds: readonly string[],
  ): ChangeSetResult {
    const requested = new Set(itemIds);
    const nextItems = changeSet.items.map((item) => {
      if (!requested.has(item.id) || item.applied === true) return item;
      this.applyItem(changeSet, item);
      return { ...item, applied: true, confirmed: true };
    });
    const resolved = nextItems.every((item) => item.applied === true);
    const nextChangeSet: ChangeSet = {
      ...changeSet,
      status: resolved ? "resolved" : "pending",
      items: nextItems,
    };
    this.replace(nextChangeSet);
    return { ok: true, changeSet: nextChangeSet };
  }

  private applyItem(changeSet: ChangeSet, item: ChangeItem): void {
    if (
      item.op !== "updateField" ||
      item.target.entityType !== "field" ||
      !item.target.fieldCode
    ) {
      throw new Error("当前演示变更集只支持字段写入");
    }
    this.workspace.updateField(
      item.target.entityId,
      item.target.fieldCode,
      item.nextValue as DataFieldPrimitive,
      {
        actor: changeSet.actor,
        source: changeSet.source,
        viaAi: changeSet.source === "ai",
        summary: item.note ?? `${changeSet.title}: ${item.target.fieldCode}`,
      },
    );
  }

  private findChangeSet(changeSetId: string): ChangeSet | undefined {
    return this.state.changeSets.find(
      (candidate) => candidate.id === changeSetId,
    );
  }

  private replace(changeSet: ChangeSet): void {
    this.state = {
      changeSets: this.state.changeSets.map((candidate) =>
        candidate.id === changeSet.id ? changeSet : candidate,
      ),
    };
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const changeSetStore = new ChangeSetStore();

function missingChangeSet(changeSetId: string): ChangeSetResult {
  return { ok: false, reason: `找不到变更集 ${changeSetId}` };
}

export function useChangeSetSnapshot(): ChangeSetState {
  return useSyncExternalStore(
    changeSetStore.subscribe,
    changeSetStore.getSnapshot,
    changeSetStore.getSnapshot,
  );
}
