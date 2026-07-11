import { useSyncExternalStore } from "react";

import type {
  CheckResult,
  Comment,
  DataFieldPrimitive,
  DataFieldValue,
  DataObject,
  DataRelation,
  FieldCode,
  MemberId,
  ObjectTypeDef,
  OutputSnapshot,
  PermissionMatrix,
  RelationType,
  ViewDef,
  Workspace,
} from "../model/kernel";
import type {
  ActivityItem,
  ChangeEvent,
  ChangeEventInverse,
  Expression,
  FieldRef,
  Member,
  PluginDef,
  SimScenario,
} from "../model/view-layer";
import { cloneDemoSeed, type DemoSeed } from "../seed/demo-seed";

export interface WorkspaceState {
  readonly workspace: Workspace;
  readonly members: readonly Member[];
  readonly objectTypes: readonly ObjectTypeDef[];
  readonly objects: readonly DataObject[];
  readonly relationTypes: readonly RelationType[];
  readonly relations: readonly DataRelation[];
  readonly comments: readonly Comment[];
  readonly permissions: PermissionMatrix;
  readonly expressions: readonly Expression[];
  readonly views: readonly ViewDef[];
  readonly fieldRefs: readonly FieldRef[];
  readonly checkResults: readonly CheckResult[];
  readonly changeEvents: readonly ChangeEvent[];
  readonly activity: readonly ActivityItem[];
  readonly outputSnapshots: readonly OutputSnapshot[];
  readonly plugins: readonly PluginDef[];
  readonly simScenarios: readonly SimScenario[];
}

export interface FieldWriteMeta {
  readonly actor: MemberId;
  readonly source?: "manual" | "ai";
  readonly viaAi?: boolean;
  readonly summary?: string;
}

export interface FieldWriteResult {
  readonly event: ChangeEvent;
  readonly syncedRefs: number;
  readonly object: DataObject;
}

export interface RelationWriteResult {
  readonly relation: DataRelation;
}

type Listener = () => void;

const now = "2026-07-10T10:24:00+08:00";

function valueCell(
  value: DataFieldPrimitive,
  previous: DataFieldValue | undefined,
  meta: FieldWriteMeta,
): DataFieldValue {
  return {
    value,
    fieldVersion: (previous?.fieldVersion ?? 0) + 1,
    updatedBy: meta.actor,
    updatedAt: now,
    source: meta.source ?? "manual",
  };
}

function eventId(sequence: number): string {
  return `us-change-${String(sequence).padStart(4, "0")}`;
}

function activityId(sequence: number): string {
  return `us-activity-${String(sequence).padStart(4, "0")}`;
}

export class WorkspaceStore {
  private state: WorkspaceState;
  private readonly listeners = new Set<Listener>();
  private readonly refTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private sequence = 0;

  constructor(seed: DemoSeed = cloneDemoSeed()) {
    this.state = seedToState(seed);
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): WorkspaceState => this.state;

  reset(seed: DemoSeed = cloneDemoSeed()): void {
    this.clearRefTimers();
    this.sequence = 0;
    this.state = seedToState(seed);
    this.emit();
  }

  getWorkspace(): Workspace {
    return this.state.workspace;
  }

  getMembers(): readonly Member[] {
    return this.state.members;
  }

  getExpressions(): readonly Expression[] {
    return this.state.expressions;
  }

  getObjectTypes(): readonly ObjectTypeDef[] {
    return this.state.objectTypes;
  }

  getObjects(typeCode?: string): readonly DataObject[] {
    return typeCode
      ? this.state.objects.filter(
          (object) => object.objectTypeCode === typeCode,
        )
      : this.state.objects;
  }

  getObject(objectId: string): DataObject | undefined {
    return this.state.objects.find((object) => object.id === objectId);
  }

  getRelations(objectId?: string): readonly DataRelation[] {
    if (!objectId) return this.state.relations;
    return this.state.relations.filter(
      (relation) =>
        relation.sourceId === objectId || relation.targetId === objectId,
    );
  }

  getFieldRefs(objectId: string, fieldCode: FieldCode): readonly FieldRef[] {
    return this.state.fieldRefs.filter(
      (ref) => ref.objectId === objectId && ref.fieldCode === fieldCode,
    );
  }

  getFieldRefsByExpr(exprId: string): readonly FieldRef[] {
    return this.state.fieldRefs.filter((ref) => ref.exprId === exprId);
  }

  getActivity(): readonly ActivityItem[] {
    return this.state.activity;
  }

  getCheckResults(): readonly CheckResult[] {
    return this.state.checkResults;
  }

  getPermissions(): PermissionMatrix {
    return this.state.permissions;
  }

  getChangeEvents(): readonly ChangeEvent[] {
    return this.state.changeEvents;
  }

  updateField(
    objectId: string,
    fieldCode: FieldCode,
    value: DataFieldPrimitive,
    meta: FieldWriteMeta,
  ): FieldWriteResult {
    const current = this.requireObject(objectId);
    const previous = current.fields[fieldCode];
    const affectedRefs = this.getFieldRefs(objectId, fieldCode);
    const affectedRefIds = new Set(affectedRefs.map((ref) => ref.id));
    const syncedRefs = affectedRefs.length;
    const nextObject: DataObject = {
      ...current,
      version: current.version + 1,
      updatedBy: meta.actor,
      updatedAt: now,
      fields: {
        ...current.fields,
        [fieldCode]: valueCell(value, previous, meta),
      },
    };
    const event = this.createFieldEvent({
      actor: meta.actor,
      fieldCode,
      objectId,
      oldValue: previous?.value ?? null,
      nextValue: value,
      syncedRefs,
      viaAi: meta.viaAi,
    });
    this.state = {
      ...this.state,
      objects: this.state.objects.map((object) =>
        object.id === objectId ? nextObject : object,
      ),
      fieldRefs: this.state.fieldRefs.map((ref) =>
        affectedRefIds.has(ref.id) ? { ...ref, state: "justSynced" } : ref,
      ),
      changeEvents: [event, ...this.state.changeEvents],
      activity: [
        {
          id: activityId(this.sequence),
          actor: meta.actor,
          summary:
            meta.summary ??
            `更新 ${fieldCode}: ${String(previous?.value ?? "空")} → ${String(value)}`,
          tracks: ["data"],
          at: now,
        },
        ...this.state.activity,
      ],
    };
    this.scheduleRefFresh(affectedRefs.map((ref) => ref.id));
    this.emit();
    return { event, syncedRefs, object: nextObject };
  }

  createRelation(params: {
    readonly relationTypeCode: string;
    readonly sourceId: string;
    readonly targetId: string;
    readonly fields?: Record<FieldCode, DataFieldValue>;
    readonly actor?: MemberId;
    readonly summary?: string;
  }): RelationWriteResult {
    const relationId = `rel-${params.sourceId}-${params.targetId}-${this.sequence + 1}`;
    const relation: DataRelation = {
      id: relationId,
      relationTypeCode: params.relationTypeCode,
      sourceId: params.sourceId,
      targetId: params.targetId,
      status: "active",
      fields: params.fields ?? {},
      version: 1,
      annotationIds: [],
    };
    const event = this.createRelationEvent(
      relation.id,
      params.actor ?? "wangyun",
    );
    this.state = {
      ...this.state,
      relations: [relation, ...this.state.relations],
      changeEvents: [event, ...this.state.changeEvents],
      activity: [
        this.relationActivity(
          params.actor ?? "wangyun",
          params.summary ?? `创建关系 ${params.relationTypeCode}`,
        ),
        ...this.state.activity,
      ],
    };
    this.emit();
    return { relation };
  }

  updateRelationField(
    relationId: string,
    fieldCode: FieldCode,
    value: DataFieldPrimitive,
    meta: FieldWriteMeta,
  ): RelationWriteResult {
    const relation = this.requireRelation(relationId);
    const previous = relation.fields[fieldCode];
    const nextRelation: DataRelation = {
      ...relation,
      version: relation.version + 1,
      fields: {
        ...relation.fields,
        [fieldCode]: valueCell(value, previous, meta),
      },
    };
    const event = this.createRelationEvent(relationId, meta.actor);
    this.state = {
      ...this.state,
      relations: this.state.relations.map((candidate) =>
        candidate.id === relationId ? nextRelation : candidate,
      ),
      changeEvents: [event, ...this.state.changeEvents],
      activity: [
        this.relationActivity(meta.actor, `更新关系字段 ${fieldCode}`),
        ...this.state.activity,
      ],
    };
    this.emit();
    return { relation: nextRelation };
  }

  unlinkRelation(
    relationId: string,
    actor: MemberId = "wangyun",
  ): RelationWriteResult {
    const relation = this.requireRelation(relationId);
    const nextRelation: DataRelation = {
      ...relation,
      status: "unlinked",
      version: relation.version + 1,
    };
    const event = this.createRelationEvent(relationId, actor);
    this.state = {
      ...this.state,
      relations: this.state.relations.map((candidate) =>
        candidate.id === relationId ? nextRelation : candidate,
      ),
      changeEvents: [event, ...this.state.changeEvents],
      activity: [
        this.relationActivity(actor, `解除关系 ${relation.relationTypeCode}`),
        ...this.state.activity,
      ],
    };
    this.emit();
    return { relation: nextRelation };
  }

  addRelationComment(relationId: string, comment: Comment): DataRelation {
    const relation = this.requireRelation(relationId);
    const nextRelation: DataRelation = {
      ...relation,
      annotationIds: [...relation.annotationIds, comment.id],
    };
    this.state = {
      ...this.state,
      comments: [comment, ...this.state.comments],
      relations: this.state.relations.map((candidate) =>
        candidate.id === relationId ? nextRelation : candidate,
      ),
    };
    this.emit();
    return nextRelation;
  }

  undo(eventIdToUndo: string): FieldWriteResult {
    const event = this.state.changeEvents.find(
      (candidate) => candidate.id === eventIdToUndo,
    );
    if (!event?.inverse) {
      throw new Error("找不到可撤销的变更");
    }
    const inverse = event.inverse;
    return this.updateField(
      inverse.objectId,
      inverse.fieldCode,
      inverse.value,
      {
        actor: event.actor,
        source: event.viaAi ? "ai" : "manual",
        viaAi: event.viaAi,
        summary: `撤销 ${event.id}`,
      },
    );
  }

  private createFieldEvent(params: {
    readonly actor: MemberId;
    readonly objectId: string;
    readonly fieldCode: FieldCode;
    readonly oldValue: DataFieldPrimitive;
    readonly nextValue: DataFieldPrimitive;
    readonly syncedRefs: number;
    readonly viaAi?: boolean;
  }): ChangeEvent {
    this.sequence += 1;
    const inverse: ChangeEventInverse = {
      objectId: params.objectId,
      fieldCode: params.fieldCode,
      value: params.oldValue,
    };
    return {
      id: eventId(this.sequence),
      track: "data",
      actor: params.actor,
      viaAi: params.viaAi,
      target: {
        entityType: "field",
        entityId: params.objectId,
        fieldCode: params.fieldCode,
      },
      old: params.oldValue,
      next: params.nextValue,
      syncedRefs: params.syncedRefs,
      at: now,
      inverse,
    };
  }

  private createRelationEvent(
    relationId: string,
    actor: MemberId,
  ): ChangeEvent {
    this.sequence += 1;
    return {
      id: eventId(this.sequence),
      track: "data",
      actor,
      target: { entityType: "relation", entityId: relationId },
      syncedRefs: 0,
      at: now,
      inverse: null,
    };
  }

  private relationActivity(actor: MemberId, summary: string): ActivityItem {
    return {
      id: activityId(this.sequence),
      actor,
      summary,
      tracks: ["data"],
      at: now,
    };
  }

  private requireObject(objectId: string): DataObject {
    const object = this.getObject(objectId);
    if (!object) throw new Error(`找不到对象 ${objectId}`);
    return object;
  }

  private requireRelation(relationId: string): DataRelation {
    const relation = this.state.relations.find(
      (candidate) => candidate.id === relationId,
    );
    if (!relation) throw new Error(`找不到关系 ${relationId}`);
    return relation;
  }

  private scheduleRefFresh(refIds: readonly string[]): void {
    for (const refId of refIds) {
      const previousTimer = this.refTimers.get(refId);
      if (previousTimer !== undefined) clearTimeout(previousTimer);
      this.refTimers.set(
        refId,
        setTimeout(() => {
          this.refTimers.delete(refId);
          this.state = {
            ...this.state,
            fieldRefs: this.state.fieldRefs.map((ref) =>
              ref.id === refId && ref.state === "justSynced"
                ? { ...ref, state: "fresh" }
                : ref,
            ),
          };
          this.emit();
        }, 10000),
      );
    }
  }

  private clearRefTimers(): void {
    for (const timer of this.refTimers.values()) clearTimeout(timer);
    this.refTimers.clear();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

function seedToState(seed: DemoSeed): WorkspaceState {
  return {
    workspace: seed.workspace,
    members: seed.members,
    objectTypes: seed.objectTypes,
    objects: seed.objects,
    relationTypes: seed.relationTypes,
    relations: seed.relations,
    comments: seed.comments,
    permissions: seed.permissions,
    expressions: seed.expressions,
    views: seed.views,
    fieldRefs: seed.fieldRefs,
    checkResults: seed.checkResults,
    changeEvents: seed.changeEvents,
    activity: seed.activity,
    outputSnapshots: seed.outputSnapshots,
    plugins: seed.plugins,
    simScenarios: seed.simScenarios,
  };
}

export const workspaceStore = new WorkspaceStore();

export function useWorkspaceSnapshot(): WorkspaceState {
  return useSyncExternalStore(
    workspaceStore.subscribe,
    workspaceStore.getSnapshot,
    workspaceStore.getSnapshot,
  );
}
