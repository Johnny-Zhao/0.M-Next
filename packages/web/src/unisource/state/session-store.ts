import { useSyncExternalStore } from "react";

import type {
  ChangeSet,
  DataFieldPrimitive,
  MemberId,
  PermLevel,
} from "../model/kernel";
import { changeSetStore, type ChangeSetStore } from "./changeset-store";
import { workspaceStore, type WorkspaceStore } from "./workspace-store";

export type PermissionAction = "read" | "editData" | "editView" | "admin";

export interface SessionState {
  readonly currentMemberId: MemberId;
}

export type WriteRequestResult =
  | {
      readonly queued: false;
      readonly eventId: string;
      readonly syncedRefs: number;
    }
  | { readonly queued: true; readonly changeSetId: string };

type Listener = () => void;

const writeLevels = new Set<PermLevel>(["admin", "edit", "owner"]);

export class SessionStore {
  private state: SessionState = { currentMemberId: "wangyun" };
  private readonly listeners = new Set<Listener>();
  private changeSetSequence = 0;

  constructor(
    private readonly workspace: WorkspaceStore = workspaceStore,
    private readonly changeSets: ChangeSetStore = changeSetStore,
  ) {}

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SessionState => this.state;

  switchMember(memberId: Exclude<MemberId, "ai">): void {
    this.state = { currentMemberId: memberId };
    this.emit();
  }

  reset(memberId: Exclude<MemberId, "ai"> = "wangyun"): void {
    this.state = { currentMemberId: memberId };
    this.changeSetSequence = 0;
    this.emit();
  }

  can(
    memberId: MemberId,
    resourceCode: string,
    action: PermissionAction,
  ): boolean {
    const effectiveMember =
      memberId === "ai" ? this.state.currentMemberId : memberId;
    const level =
      this.workspace.getPermissions()[effectiveMember]?.[resourceCode] ??
      "none";
    if (action === "read") return level !== "none";
    if (action === "admin") return level === "admin";
    if (action === "editView") return writeLevels.has(level);
    return writeLevels.has(level);
  }

  canDragCards(memberId: MemberId): boolean {
    // 演示身份策略:陈默=数据只读可转审批;周然/AI=纯只读禁拖,超出权限矩阵表达力。
    return memberId !== "zhouran" && memberId !== "ai";
  }

  requestWrite(params: {
    readonly resourceCode: string;
    readonly objectId: string;
    readonly fieldCode: string;
    readonly value: DataFieldPrimitive;
  }): WriteRequestResult {
    const actor = this.state.currentMemberId;
    if (this.can(actor, params.resourceCode, "editData")) {
      const result = this.workspace.updateField(
        params.objectId,
        params.fieldCode,
        params.value,
        { actor, summary: `直接写入 ${params.fieldCode}` },
      );
      return {
        queued: false,
        eventId: result.event.id,
        syncedRefs: result.syncedRefs,
      };
    }
    const changeSet = this.createManualChangeSet(params, actor);
    this.changeSets.submit(changeSet);
    return { queued: true, changeSetId: changeSet.id };
  }

  private createManualChangeSet(
    params: {
      readonly objectId: string;
      readonly fieldCode: string;
      readonly value: DataFieldPrimitive;
    },
    actor: MemberId,
  ): ChangeSet {
    this.changeSetSequence += 1;
    const object = this.workspace.getObject(params.objectId);
    return {
      id: `changeset-manual-session-${this.changeSetSequence}`,
      source: "manual",
      status: "pending",
      title: "越权写入转审批",
      actor,
      createdAt: "2026-07-10T10:32:00+08:00",
      items: [
        {
          id: `manual-session-item-${this.changeSetSequence}`,
          op: "updateField",
          target: {
            entityType: "field",
            entityId: params.objectId,
            fieldCode: params.fieldCode,
          },
          oldValue: object?.fields[params.fieldCode]?.value ?? null,
          nextValue: params.value,
          confidence: 1,
          confirmed: true,
        },
      ],
    };
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const sessionStore = new SessionStore();

export function useSessionSnapshot(): SessionState {
  return useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.getSnapshot,
    sessionStore.getSnapshot,
  );
}
