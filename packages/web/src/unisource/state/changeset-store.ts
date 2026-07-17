import { useSyncExternalStore } from "react";

import type {
  ChangeItem,
  ChangeSet,
  DataFieldPrimitive,
  MemberId,
} from "../model/kernel";
import { pushToast, type UsToastInput } from "../primitives";
import { cloneDemoSeed, type DemoSeed } from "../seed/demo-seed";
import { workspaceStore, type WorkspaceStore } from "./workspace-store";

export interface ChangeSetState {
  readonly changeSets: readonly ChangeSet[];
  readonly kernelChangeSets: readonly ChangeSet[];
  readonly kernelSyncAt: string | null;
  readonly kernelBusy: boolean;
}

export type ChangeSetResult =
  | { readonly ok: true; readonly changeSet: ChangeSet }
  | { readonly ok: false; readonly reason: string };

type Listener = () => void;

const kernelSyncClock = "2026-07-10T10:32:00+08:00";

export interface KernelChangeSetSource {
  setActor(actorId: MemberId): void;
  listAiChanges(): Promise<readonly ChangeSet[]>;
  confirmAiChange(
    setId: string,
    itemIds?: readonly string[],
  ): Promise<ChangeSetResult>;
  rejectAiChange(setId: string): Promise<ChangeSetResult>;
}

export class ChangeSetStore {
  private state: ChangeSetState;
  private readonly listeners = new Set<Listener>();
  private kernelSource: KernelChangeSetSource | null = null;
  private onKernelWriteSucceeded: ((actor: MemberId) => void) | null = null;
  private readonly showToast: (input: UsToastInput) => number;

  constructor(
    seed: DemoSeed = cloneDemoSeed(),
    private readonly workspace: WorkspaceStore = workspaceStore,
    options: {
      readonly kernelSource?: KernelChangeSetSource | null;
      readonly pushToast?: (input: UsToastInput) => number;
    } = {},
  ) {
    this.kernelSource = options.kernelSource ?? null;
    this.showToast = options.pushToast ?? pushToast;
    this.state = {
      changeSets: seed.changeSets,
      kernelChangeSets: [],
      kernelSyncAt: null,
      kernelBusy: false,
    };
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ChangeSetState => this.state;

  setKernelSource(
    source: KernelChangeSetSource | null,
    onKernelWriteSucceeded: ((actor: MemberId) => void) | null = null,
  ): void {
    this.kernelSource = source;
    this.onKernelWriteSucceeded = source ? onKernelWriteSucceeded : null;
    if (source === null) {
      this.state = {
        ...this.state,
        kernelChangeSets: [],
        kernelSyncAt: null,
        kernelBusy: false,
      };
      this.emit();
    }
  }

  reset(seed: DemoSeed = cloneDemoSeed()): void {
    this.state = {
      changeSets: seed.changeSets,
      kernelChangeSets: [],
      kernelSyncAt: null,
      kernelBusy: false,
    };
    this.emit();
  }

  getPending(): readonly ChangeSet[] {
    return this.state.changeSets.filter(
      (changeSet) => changeSet.status === "pending",
    );
  }

  submit(changeSet: ChangeSet): ChangeSet {
    this.state = {
      ...this.state,
      changeSets: [changeSet, ...this.state.changeSets],
    };
    this.emit();
    return changeSet;
  }

  async refreshKernelAiChanges(actor: MemberId): Promise<void> {
    if (!this.kernelSource) return;
    this.kernelSource.setActor(actor);
    this.state = { ...this.state, kernelBusy: true };
    this.emit();
    try {
      const kernelChangeSets = await this.kernelSource.listAiChanges();
      this.state = {
        ...this.state,
        kernelChangeSets,
        kernelSyncAt: kernelSyncClock,
        kernelBusy: false,
      };
      this.emit();
    } catch (error) {
      this.state = { ...this.state, kernelBusy: false };
      this.emit();
      this.showToast({
        title: "内核 AI 变更集同步失败",
        desc: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async confirmKernelItems(
    changeSetId: string,
    itemIds: readonly string[],
    actor: MemberId,
  ): Promise<void> {
    if (!this.kernelSource) return;
    this.kernelSource.setActor(actor);
    this.state = { ...this.state, kernelBusy: true };
    this.emit();
    try {
      const result = await this.kernelSource.confirmAiChange(
        changeSetId,
        itemIds.length > 0 ? itemIds : undefined,
      );
      if (!result.ok) {
        this.showToast({ title: "内核确认失败", desc: result.reason });
        this.state = { ...this.state, kernelBusy: false };
        this.emit();
        return;
      }
      this.onKernelWriteSucceeded?.(actor);
      const kernelChangeSets = await this.kernelSource.listAiChanges();
      this.state = {
        ...this.state,
        kernelChangeSets,
        kernelSyncAt: kernelSyncClock,
        kernelBusy: false,
      };
      this.emit();
      this.showToast({ title: "内核 AI 变更已确认" });
    } catch (error) {
      this.state = { ...this.state, kernelBusy: false };
      this.emit();
      this.showToast({
        title: "内核确认失败",
        desc: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async rejectKernel(changeSetId: string, actor: MemberId): Promise<void> {
    if (!this.kernelSource) return;
    this.kernelSource.setActor(actor);
    this.state = { ...this.state, kernelBusy: true };
    this.emit();
    try {
      const result = await this.kernelSource.rejectAiChange(changeSetId);
      if (!result.ok) {
        this.showToast({ title: "内核拒绝失败", desc: result.reason });
        this.state = { ...this.state, kernelBusy: false };
        this.emit();
        return;
      }
      const kernelChangeSets = await this.kernelSource.listAiChanges();
      this.state = {
        ...this.state,
        kernelChangeSets,
        kernelSyncAt: kernelSyncClock,
        kernelBusy: false,
      };
      this.emit();
      this.showToast({ title: "内核 AI 变更已拒绝" });
    } catch (error) {
      this.state = { ...this.state, kernelBusy: false };
      this.emit();
      this.showToast({
        title: "内核拒绝失败",
        desc: error instanceof Error ? error.message : String(error),
      });
    }
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

  approveChangeSet(changeSetId: string, approver: MemberId): ChangeSetResult {
    const result = this.confirmAll(changeSetId);
    if (!result.ok) return result;
    const target = result.changeSet.items[0]?.target ?? {
      entityType: "object" as const,
      entityId: changeSetId,
    };
    this.workspace.addReviewRecord({
      target,
      action: "approve",
      actor: approver,
      note: `${memberName(approver)} 批准了 ${memberName(result.changeSet.actor)} 的修改`,
    });
    this.workspace.addActivity({
      actor: approver,
      summary: `${memberName(approver)} 批准了 ${memberName(result.changeSet.actor)} 的修改`,
      tracks: ["data"],
    });
    return result;
  }

  rejectChangeSet(changeSetId: string, reviewer: MemberId): ChangeSetResult {
    const changeSet = this.findChangeSet(changeSetId);
    const result = this.reject(changeSetId);
    if (!result.ok || !changeSet) return result;
    this.workspace.addReviewRecord({
      target: changeSet.items[0]?.target ?? {
        entityType: "object",
        entityId: changeSetId,
      },
      action: "reject",
      actor: reviewer,
      note: `${memberName(reviewer)} 拒绝了 ${memberName(changeSet.actor)} 的修改`,
    });
    return result;
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
    if (item.op === "createObject") {
      if (!item.objectTypeCode || !item.fields) {
        throw new Error("创建对象变更缺少对象类型或字段");
      }
      this.workspace.createObject({
        objectTypeCode: item.objectTypeCode,
        fields: item.fields,
        actor: changeSet.actor,
        source: changeSet.source,
        objectId: item.target.entityId,
        summary: item.note ?? `${changeSet.title}: 创建对象`,
      });
      return;
    }
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
      ...this.state,
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

function memberName(memberId: MemberId): string {
  const names: Record<MemberId, string> = {
    wangyun: "王芸",
    lixiao: "李晓",
    chenmo: "陈默",
    zhouran: "周然",
    ai: "同源 AI",
  };
  return names[memberId];
}

export function useChangeSetSnapshot(): ChangeSetState {
  return useSyncExternalStore(
    changeSetStore.subscribe,
    changeSetStore.getSnapshot,
    changeSetStore.getSnapshot,
  );
}
