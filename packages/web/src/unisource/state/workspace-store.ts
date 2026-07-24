import { useSyncExternalStore } from "react";

import type {
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
  ReviewRecord,
  SceneTemplate,
  ViewDef,
  Workspace,
} from "../model/kernel";
import type {
  ActivityItem,
  AnaReport,
  BiBarDef,
  ChangeEvent,
  ChangeEventInverse,
  ChatMessage,
  DocModel,
  Expression,
  FieldRef,
  KpiCardDef,
  Member,
  PluginDef,
  RawImport,
  SimScenario,
  SlotBinding,
} from "../model/view-layer";
import { cloneDemoSeed, type DemoSeed } from "../seed/demo-seed";
import {
  createExpressionRecords,
  type ExpressionCreateResult,
  type ExpressionDraft,
} from "../expression/expression-create-model";
import {
  copyObjectSubtree,
  type ObjectSubtreeCopyConfig,
  type ObjectSubtreeCopyResult,
} from "./object-subtree-copy";

export interface WorkspaceState {
  readonly workspace: Workspace;
  readonly members: readonly Member[];
  readonly objectTypes: readonly ObjectTypeDef[];
  readonly objects: readonly DataObject[];
  readonly relationTypes: readonly RelationType[];
  readonly relations: readonly DataRelation[];
  readonly comments: readonly Comment[];
  readonly permissions: PermissionMatrix;
  readonly sceneTemplates: readonly SceneTemplate[];
  readonly expressions: readonly Expression[];
  readonly views: readonly ViewDef[];
  readonly docModels: readonly DocModel[];
  readonly fieldRefs: readonly FieldRef[];
  readonly kpis: readonly KpiCardDef[];
  readonly biBars: readonly BiBarDef[];
  readonly anaReports: readonly AnaReport[];
  readonly rawImport: RawImport;
  readonly chatMessages: readonly ChatMessage[];
  readonly reviewRecords: readonly ReviewRecord[];
  readonly slotBindings: readonly SlotBinding[];
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
  readonly expectedObjectVersion?: number;
}

export interface FieldWriteResult {
  readonly event: ChangeEvent;
  readonly syncedRefs: number;
  readonly object: DataObject;
}

export interface RelationWriteResult {
  readonly relation: DataRelation;
}

export interface ViewConfigWriteResult {
  readonly view: ViewDef;
  readonly event: ChangeEvent;
}

export interface PluginStatePatch {
  readonly installed?: boolean;
  readonly enabled?: boolean;
  readonly version?: string;
  readonly updateTo?: string | null;
  readonly scope?: PluginDef["scope"];
}

export interface FieldWriteDescriptor {
  readonly kind: "updateField";
  readonly objectId: string;
  readonly fieldCode: FieldCode;
  readonly value: DataFieldPrimitive;
  readonly previousObject: DataObject;
  readonly expectedObjectVersion: number;
  readonly meta: FieldWriteMeta;
}

export interface ObjectCreateDescriptor {
  readonly kind: "createObject";
  readonly temporaryObjectId: string;
  readonly object: DataObject;
  readonly params: {
    readonly objectTypeCode: string;
    readonly fields: Record<FieldCode, DataFieldPrimitive>;
    readonly actor?: MemberId;
    readonly source?: "manual" | "ai";
    readonly summary?: string;
  };
}

export interface RelationCreateDescriptor {
  readonly kind: "createRelation";
  readonly temporaryRelationId: string;
  readonly relation: DataRelation;
  readonly params: {
    readonly relationTypeCode: string;
    readonly sourceId: string;
    readonly targetId: string;
    readonly fields?: Record<FieldCode, DataFieldValue>;
    readonly actor?: MemberId;
    readonly summary?: string;
  };
}

export interface RelationUnlinkDescriptor {
  readonly kind: "unlinkRelation";
  readonly relation: DataRelation;
  readonly previousRelation: DataRelation;
  readonly params: {
    readonly relationId: string;
    readonly expectedVersion: number;
    readonly actor?: MemberId;
    readonly summary?: string;
  };
}

export interface DeletedObjectSnapshot {
  readonly object: DataObject;
  readonly relations: readonly DataRelation[];
  readonly fieldRefs: readonly FieldRef[];
  readonly views: readonly ViewDef[];
}

export interface ObjectDeleteDescriptor {
  readonly kind: "deleteObject";
  readonly objectId: string;
  readonly actor: MemberId;
  readonly expectedVersion: number;
  readonly snapshot: DeletedObjectSnapshot;
}

export type WriteCompletion =
  | { readonly state: "local" }
  | {
      readonly state: "synced";
      readonly objectId?: string;
      readonly relationId?: string;
    }
  | { readonly state: "failed"; readonly message: string };

export interface WriteSink {
  updateField(
    descriptor: FieldWriteDescriptor,
  ): void | Promise<WriteCompletion>;
  createObject(
    descriptor: ObjectCreateDescriptor,
  ): void | Promise<WriteCompletion>;
  createRelation(
    descriptor: RelationCreateDescriptor,
  ): void | Promise<WriteCompletion>;
  unlinkRelation(
    descriptor: RelationUnlinkDescriptor,
  ): void | Promise<WriteCompletion>;
  deleteObject(
    descriptor: ObjectDeleteDescriptor,
  ): void | Promise<WriteCompletion>;
  refreshObjects?(objectIds: readonly string[]): Promise<WriteCompletion>;
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
  private writeSink: WriteSink | null = null;
  private lastWriteCompletion: Promise<WriteCompletion> | null = null;

  constructor(seed: DemoSeed = cloneDemoSeed()) {
    this.state = seedToState(seed);
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): WorkspaceState => this.state;

  setWriteSink(sink: WriteSink | null): void {
    this.writeSink = sink;
    this.lastWriteCompletion = null;
  }

  waitForLastWrite(): Promise<WriteCompletion> {
    return this.lastWriteCompletion ?? Promise.resolve({ state: "local" });
  }

  async refreshObjects(objectIds: readonly string[]): Promise<WriteCompletion> {
    if (!this.writeSink?.refreshObjects) return { state: "local" };
    try {
      return await this.writeSink.refreshObjects(objectIds);
    } catch {
      return {
        state: "failed",
        message: "派生字段同步失败，请重新加载工作空间",
      };
    }
  }

  copyObjectSubtree(
    rootObjectId: string,
    config: ObjectSubtreeCopyConfig,
    actor: MemberId = "wangyun",
  ): Promise<ObjectSubtreeCopyResult> {
    return copyObjectSubtree(this, rootObjectId, config, actor);
  }

  reset(seed: DemoSeed = cloneDemoSeed()): void {
    this.clearRefTimers();
    this.sequence = 0;
    this.lastWriteCompletion = null;
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

  createExpressionWithView(
    draft: ExpressionDraft,
    options: {
      readonly idFactory?: () => string;
      readonly createdAt?: string;
    } = {},
  ): ExpressionCreateResult {
    const result = createExpressionRecords(
      this.state,
      draft,
      options.idFactory,
      options.createdAt,
    );
    if (result.state !== "created") return result;
    return this.addExpressionConfig(result);
  }

  addExpressionConfig(asset: {
    readonly expression: Expression;
    readonly view: ViewDef;
  }): ExpressionCreateResult {
    const { expression, view } = asset;
    if (
      expression.viewIds.length !== 1 ||
      expression.viewIds[0] !== view.id ||
      expression.defaultViewId !== view.id ||
      expression.defaultForm !== view.kind ||
      view.exprId !== expression.id
    ) {
      return {
        state: "invalid",
        message: "Expression 与首个 View 引用不一致。",
      };
    }
    const idConflict =
      this.state.expressions.some((item) => item.id === expression.id) ||
      this.state.views.some((item) => item.id === view.id);
    if (idConflict) {
      return {
        state: "invalid",
        message: "表达或 View 标识已存在，无法加入工作空间。",
      };
    }
    const normalizedName = expression.name.trim().toLocaleLowerCase("zh-CN");
    if (
      this.state.expressions.some(
        (item) =>
          item.name.trim().toLocaleLowerCase("zh-CN") === normalizedName,
      )
    ) {
      return { state: "invalid", message: "当前工作空间已存在同名表达。" };
    }
    this.state = {
      ...this.state,
      expressions: [...this.state.expressions, expression],
      views: [...this.state.views, view],
    };
    this.emit();
    return { state: "created", expression, view };
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

  getView(viewId: string): ViewDef | undefined {
    return this.state.views.find((view) => view.id === viewId);
  }

  getFieldRefs(objectId: string, fieldCode: FieldCode): readonly FieldRef[] {
    return this.state.fieldRefs.filter(
      (ref) => ref.objectId === objectId && ref.fieldCode === fieldCode,
    );
  }

  getFieldRefsByExpr(exprId: string): readonly FieldRef[] {
    return this.state.fieldRefs.filter((ref) => ref.exprId === exprId);
  }

  getDocModel(exprId: string): DocModel | undefined {
    return this.state.docModels.find((doc) => doc.exprId === exprId);
  }

  getActivity(): readonly ActivityItem[] {
    return this.state.activity;
  }

  getReviewRecords(): readonly ReviewRecord[] {
    return this.state.reviewRecords;
  }

  getSlotBindings(): readonly SlotBinding[] {
    return this.state.slotBindings;
  }

  getPermissions(): PermissionMatrix {
    return this.state.permissions;
  }

  getChangeEvents(): readonly ChangeEvent[] {
    return this.state.changeEvents;
  }

  getKpis(): readonly KpiCardDef[] {
    return this.state.kpis;
  }

  getBiBars(): readonly BiBarDef[] {
    return this.state.biBars;
  }

  getAnaReports(): readonly AnaReport[] {
    return this.state.anaReports;
  }

  getPlugins(): readonly PluginDef[] {
    return this.state.plugins;
  }

  setPluginState(
    pluginId: string,
    patch: PluginStatePatch,
    actor: MemberId,
  ): PluginDef {
    void actor;
    const current = this.state.plugins.find((plugin) => plugin.id === pluginId);
    if (!current) throw new Error(`找不到插件 ${pluginId}`);
    const { updateTo: currentUpdateTo, ...currentWithoutUpdate } = current;
    const base: PluginDef = {
      ...currentWithoutUpdate,
      installed: patch.installed ?? current.installed,
      enabled: patch.enabled ?? current.enabled,
      version: patch.version ?? current.version,
      scope: patch.scope ?? current.scope,
    };
    const next: PluginDef =
      "updateTo" in patch
        ? patch.updateTo === null || patch.updateTo === undefined
          ? base
          : { ...base, updateTo: patch.updateTo }
        : currentUpdateTo
          ? { ...base, updateTo: currentUpdateTo }
          : base;
    this.state = {
      ...this.state,
      plugins: this.state.plugins.map((plugin) =>
        plugin.id === pluginId ? next : plugin,
      ),
    };
    // 插件注册表是 UI Mock 能力开关,不进入业务双轨、ChangeEvent 或活动流。
    this.emit();
    return next;
  }

  updateField(
    objectId: string,
    fieldCode: FieldCode,
    value: DataFieldPrimitive,
    meta: FieldWriteMeta,
  ): FieldWriteResult {
    const current = this.requireObject(objectId);
    const previousObject = structuredClone(current) as DataObject;
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
    this.notifyWriteSink((sink) =>
      sink.updateField({
        kind: "updateField",
        objectId,
        fieldCode,
        value,
        previousObject,
        expectedObjectVersion: current.version,
        meta,
      }),
    );
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
    this.notifyWriteSink((sink) =>
      sink.createRelation({
        kind: "createRelation",
        temporaryRelationId: relation.id,
        relation,
        params,
      }),
    );
    return { relation };
  }

  updateViewConfig(
    viewId: string,
    patch: Record<string, unknown>,
    meta: FieldWriteMeta,
  ): ViewConfigWriteResult {
    const current = this.requireView(viewId);
    const previousConfig = structuredClone(current.config) as Record<
      string,
      unknown
    >;
    const nextView: ViewDef = {
      ...current,
      config: { ...current.config, ...patch },
    };
    const event = this.createViewConfigEvent({
      actor: meta.actor,
      viewId,
      previousConfig,
      nextConfig: nextView.config,
    });
    this.state = {
      ...this.state,
      views: this.state.views.map((view) =>
        view.id === viewId ? nextView : view,
      ),
      changeEvents: [event, ...this.state.changeEvents],
      activity: [
        {
          id: activityId(this.sequence),
          actor: meta.actor,
          summary: meta.summary ?? `更新视图布局 ${viewId}`,
          tracks: ["view"],
          at: now,
        },
        ...this.state.activity,
      ],
    };
    this.emit();
    return { view: nextView, event };
  }

  createObject(params: {
    readonly objectTypeCode: string;
    readonly fields: Record<FieldCode, DataFieldPrimitive>;
    readonly actor?: MemberId;
    readonly source?: "manual" | "ai";
    readonly objectId?: string;
    readonly summary?: string;
  }): DataObject {
    const actor = params.actor ?? this.state.workspace.currentMemberId;
    const object: DataObject = {
      id:
        params.objectId ?? `obj-${params.objectTypeCode}-${this.sequence + 1}`,
      objectTypeCode: params.objectTypeCode,
      status: "active",
      version: 1,
      fields: Object.fromEntries(
        Object.entries(params.fields).map(([code, value]) => [
          code,
          valueCell(value, undefined, {
            actor,
            source: params.source ?? "manual",
          }),
        ]),
      ),
      createdBy: actor,
      createdAt: now,
      updatedBy: actor,
      updatedAt: now,
    };
    const event = this.createObjectEvent(object.id, actor);
    this.state = {
      ...this.state,
      objects: [object, ...this.state.objects],
      changeEvents: [event, ...this.state.changeEvents],
      activity: [
        {
          id: activityId(this.sequence),
          actor,
          summary: params.summary ?? `创建对象 ${params.objectTypeCode}`,
          tracks: ["data"],
          at: now,
        },
        ...this.state.activity,
      ],
    };
    this.emit();
    this.notifyWriteSink((sink) =>
      sink.createObject({
        kind: "createObject",
        temporaryObjectId: object.id,
        object,
        params,
      }),
    );
    return object;
  }

  setKpiVisible(kpiId: string, visible: boolean, actor: MemberId): KpiCardDef {
    const current = this.state.kpis.find((candidate) => candidate.id === kpiId);
    if (!current) throw new Error(`找不到 KPI ${kpiId}`);
    const next = { ...current, visible };
    const event = this.createViewKpiEvent(kpiId, actor, current.visible);
    this.state = {
      ...this.state,
      kpis: this.state.kpis.map((candidate) =>
        candidate.id === kpiId ? next : candidate,
      ),
      changeEvents: [event, ...this.state.changeEvents],
      activity: [
        {
          id: activityId(this.sequence),
          actor,
          summary: visible
            ? `显示看板卡 ${current.label}`
            : `隐藏看板卡 ${current.label}`,
          tracks: ["view"],
          at: now,
        },
        ...this.state.activity,
      ],
    };
    this.emit();
    return next;
  }

  bindSlot(
    target:
      | { readonly bindingId: string }
      | { readonly exprId: string; readonly slotId: string },
    objectId: string,
    meta: FieldWriteMeta,
  ): SlotBinding {
    const object = this.requireObject(objectId);
    const current = this.requireSlotBinding(target);
    const next: SlotBinding = {
      ...current,
      objectId,
      updatedBy: meta.actor,
      updatedAt: now,
    };
    const event = this.createSlotBindingEvent(
      current.id,
      meta.actor,
      current.objectId,
      objectId,
    );
    this.state = {
      ...this.state,
      slotBindings: this.state.slotBindings.map((candidate) =>
        candidate.id === current.id ? next : candidate,
      ),
      changeEvents: [event, ...this.state.changeEvents],
      activity: [
        {
          id: activityId(this.sequence),
          actor: meta.actor,
          summary:
            meta.summary ??
            `实例化槽位 ${current.slotId} → ${String(object.fields.name?.value ?? objectId)}`,
          tracks: ["data"],
          at: now,
        },
        ...this.state.activity,
      ],
    };
    this.emit();
    return next;
  }

  unbindSlot(
    target:
      | { readonly bindingId: string }
      | { readonly exprId: string; readonly slotId: string },
    meta: FieldWriteMeta,
  ): SlotBinding {
    const current = this.state.slotBindings.find((candidate) =>
      "bindingId" in target
        ? candidate.id === target.bindingId
        : candidate.exprId === target.exprId &&
          candidate.slotId === target.slotId,
    );
    if (!current) throw new Error("找不到槽位绑定");
    const next: SlotBinding = {
      ...current,
      objectId: null,
      updatedBy: meta.actor,
      updatedAt: now,
    };
    const event = this.createSlotBindingEvent(
      current.id,
      meta.actor,
      current.objectId,
      null,
    );
    this.state = {
      ...this.state,
      slotBindings: this.state.slotBindings.map((candidate) =>
        candidate.id === current.id ? next : candidate,
      ),
      changeEvents: [event, ...this.state.changeEvents],
      activity: [
        {
          id: activityId(this.sequence),
          actor: meta.actor,
          summary: meta.summary ?? `清空槽位 ${current.slotId}`,
          tracks: ["data"],
          at: now,
        },
        ...this.state.activity,
      ],
    };
    this.emit();
    return next;
  }

  addReviewRecord(record: Omit<ReviewRecord, "id" | "at">): ReviewRecord {
    this.sequence += 1;
    const next: ReviewRecord = {
      ...record,
      id: `review-${String(this.sequence).padStart(4, "0")}`,
      at: now,
    };
    this.state = {
      ...this.state,
      reviewRecords: [next, ...this.state.reviewRecords],
      activity: [
        {
          id: activityId(this.sequence),
          actor: record.actor,
          summary: record.note,
          tracks: ["view"],
          at: now,
        },
        ...this.state.activity,
      ],
    };
    this.emit();
    return next;
  }

  addActivity(item: Omit<ActivityItem, "id" | "at">): ActivityItem {
    this.sequence += 1;
    const next: ActivityItem = {
      ...item,
      id: activityId(this.sequence),
      at: now,
    };
    this.state = {
      ...this.state,
      activity: [next, ...this.state.activity],
    };
    this.emit();
    return next;
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
    this.notifyWriteSink((sink) =>
      sink.unlinkRelation({
        kind: "unlinkRelation",
        relation: nextRelation,
        previousRelation: relation,
        params: {
          relationId,
          expectedVersion: relation.version,
          actor,
          summary: `瑙ｉ櫎鍏崇郴 ${relation.relationTypeCode}`,
        },
      }),
    );
    return { relation: nextRelation };
  }

  deleteObject(objectId: string, actor: MemberId = "wangyun"): DataObject {
    const object = this.requireObject(objectId);
    const snapshot: DeletedObjectSnapshot = {
      object: structuredClone(object) as DataObject,
      relations: structuredClone(
        this.state.relations.filter(
          (relation) =>
            relation.sourceId === objectId || relation.targetId === objectId,
        ),
      ) as DataRelation[],
      fieldRefs: structuredClone(
        this.state.fieldRefs.filter((ref) => ref.objectId === objectId),
      ) as FieldRef[],
      views: structuredClone(
        this.state.views.filter((view) => view.kind === "canvas"),
      ) as ViewDef[],
    };
    const affectedRefIds = new Set(snapshot.fieldRefs.map((ref) => ref.id));
    const event = this.createObjectEvent(objectId, actor);
    this.state = {
      ...this.state,
      objects: this.state.objects.filter(
        (candidate) => candidate.id !== objectId,
      ),
      relations: this.state.relations.filter(
        (relation) =>
          relation.sourceId !== objectId && relation.targetId !== objectId,
      ),
      fieldRefs: this.state.fieldRefs.map((ref) =>
        affectedRefIds.has(ref.id) ? { ...ref, state: "dangling" } : ref,
      ),
      views: this.state.views.map((view) =>
        view.kind === "canvas"
          ? {
              ...view,
              config: removeObjectFromCanvasConfig(view.config, objectId),
            }
          : view,
      ),
      changeEvents: [event, ...this.state.changeEvents],
      activity: [
        {
          id: activityId(this.sequence),
          actor,
          summary: `删除数据源记录 ${String(object.fields.name?.value ?? objectId)}`,
          tracks: ["data"],
          at: now,
        },
        ...this.state.activity,
      ],
    };
    this.emit();
    this.notifyWriteSink((sink) =>
      sink.deleteObject({
        kind: "deleteObject",
        objectId,
        actor,
        expectedVersion: object.version,
        snapshot,
      }),
    );
    return object;
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

  addFieldRef(
    exprId: string,
    objectId: string,
    fieldCode: FieldCode,
    label: string,
    actor: MemberId = this.state.workspace.currentMemberId,
  ): FieldRef {
    const ref: FieldRef = {
      id: `ref-${exprId}-${fieldCode}-${this.sequence + 1}`,
      objectId,
      fieldCode,
      exprId,
      label,
      state: "fresh",
    };
    const event = this.createViewFieldEvent(objectId, fieldCode, actor);
    this.state = {
      ...this.state,
      fieldRefs: [...this.state.fieldRefs, ref],
      changeEvents: [event, ...this.state.changeEvents],
      activity: [
        {
          id: activityId(this.sequence),
          actor,
          summary: `插入字段引用 ${label}`,
          tracks: ["view"],
          at: now,
        },
        ...this.state.activity,
      ],
    };
    this.emit();
    return ref;
  }

  rebindFieldRef(
    refId: string,
    newFieldCode: FieldCode,
    actor: MemberId = this.state.workspace.currentMemberId,
  ): FieldRef {
    const ref = this.state.fieldRefs.find(
      (candidate) => candidate.id === refId,
    );
    if (!ref) throw new Error(`找不到引用 ${refId}`);
    const object = this.requireObject(ref.objectId);
    const type = this.state.objectTypes.find(
      (candidate) => candidate.code === object.objectTypeCode,
    );
    const field = type?.fields.find(
      (candidate) => candidate.code === newFieldCode,
    );
    const nextRef: FieldRef = {
      ...ref,
      fieldCode: newFieldCode,
      label: field?.name ?? ref.label,
      state: "fresh",
    };
    const event = this.createViewFieldEvent(ref.objectId, newFieldCode, actor);
    this.state = {
      ...this.state,
      fieldRefs: this.state.fieldRefs.map((candidate) =>
        candidate.id === refId ? nextRef : candidate,
      ),
      changeEvents: [event, ...this.state.changeEvents],
      activity: [
        {
          id: activityId(this.sequence),
          actor,
          summary: `重绑字段引用 ${nextRef.label}`,
          tracks: ["view"],
          at: now,
        },
        ...this.state.activity,
      ],
    };
    this.emit();
    return nextRef;
  }

  undo(eventIdToUndo: string): FieldWriteResult {
    const event = this.state.changeEvents.find(
      (candidate) => candidate.id === eventIdToUndo,
    );
    if (event?.inverseView) {
      const result = this.updateViewConfig(
        event.inverseView.viewId,
        event.inverseView.config,
        {
          actor: event.actor,
          summary: `恢复 ${event.id}`,
        },
      );
      return {
        event: result.event,
        syncedRefs: 0,
        object: this.state.objects[0]!,
      };
    }
    if (event?.inverseKpi) {
      this.setKpiVisible(
        event.inverseKpi.kpiId,
        event.inverseKpi.visible,
        event.actor,
      );
      return {
        event: this.state.changeEvents[0]!,
        syncedRefs: 0,
        object: this.state.objects[0]!,
      };
    }
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

  rollbackField(params: {
    readonly objectId: string;
    readonly previousObject: DataObject;
  }): void {
    const restored =
      params.previousObject.id === params.objectId
        ? params.previousObject
        : { ...params.previousObject, id: params.objectId };
    this.state = {
      ...this.state,
      objects: this.state.objects.map((object) =>
        object.id === params.objectId || object.id === params.previousObject.id
          ? restored
          : object,
      ),
    };
    this.emit();
  }

  reconcileObject(object: DataObject): void {
    const current = this.getObject(object.id);
    if (current && current.version > object.version) return;
    this.state = {
      ...this.state,
      objects: this.state.objects.map((candidate) =>
        candidate.id === object.id ? object : candidate,
      ),
    };
    this.emit();
  }

  removeObject(objectId: string): void {
    const affectedRefIds = new Set(
      this.state.fieldRefs
        .filter((ref) => ref.objectId === objectId)
        .map((ref) => ref.id),
    );
    this.state = {
      ...this.state,
      objects: this.state.objects.filter((object) => object.id !== objectId),
      relations: this.state.relations.filter(
        (relation) =>
          relation.sourceId !== objectId && relation.targetId !== objectId,
      ),
      fieldRefs: this.state.fieldRefs.map((ref) =>
        affectedRefIds.has(ref.id) ? { ...ref, state: "dangling" } : ref,
      ),
      views: this.state.views.map((view) =>
        view.kind === "canvas"
          ? {
              ...view,
              config: removeObjectFromCanvasConfig(view.config, objectId),
            }
          : view,
      ),
    };
    this.emit();
  }

  restoreObject(
    snapshot: DeletedObjectSnapshot,
    restoredObjectId = snapshot.object.id,
  ): void {
    const originalId = snapshot.object.id;
    const object =
      restoredObjectId === originalId
        ? snapshot.object
        : { ...snapshot.object, id: restoredObjectId };
    const relations = snapshot.relations.map((relation) =>
      replaceRelationEndpoint(relation, originalId, restoredObjectId),
    );
    const fieldRefs = snapshot.fieldRefs.map((ref) =>
      ref.objectId === originalId
        ? { ...ref, objectId: restoredObjectId }
        : ref,
    );
    const views = snapshot.views.map((view) => ({
      ...view,
      config: replaceObjectInCanvasConfig(
        view.config,
        originalId,
        restoredObjectId,
      ),
    }));
    const relationIds = new Set(relations.map((relation) => relation.id));
    const refIds = new Set(fieldRefs.map((ref) => ref.id));
    const viewIds = new Set(views.map((view) => view.id));
    this.state = {
      ...this.state,
      objects: [
        object,
        ...this.state.objects.filter(
          (candidate) =>
            candidate.id !== originalId && candidate.id !== restoredObjectId,
        ),
      ],
      relations: [
        ...relations,
        ...this.state.relations.filter(
          (relation) => !relationIds.has(relation.id),
        ),
      ],
      fieldRefs: [
        ...this.state.fieldRefs.map((ref) =>
          refIds.has(ref.id)
            ? (fieldRefs.find((candidate) => candidate.id === ref.id) ?? ref)
            : ref,
        ),
        ...fieldRefs.filter(
          (ref) =>
            !this.state.fieldRefs.some((candidate) => candidate.id === ref.id),
        ),
      ],
      views: this.state.views.map((view) =>
        viewIds.has(view.id)
          ? (views.find((candidate) => candidate.id === view.id) ?? view)
          : view,
      ),
    };
    this.emit();
  }

  reconcileObjectId(temporaryObjectId: string, object: DataObject): void {
    this.state = {
      ...this.state,
      objects: this.state.objects.map((candidate) =>
        candidate.id === temporaryObjectId ? object : candidate,
      ),
      relations: this.state.relations.map((relation) =>
        replaceRelationEndpoint(relation, temporaryObjectId, object.id),
      ),
      fieldRefs: this.state.fieldRefs.map((ref) =>
        ref.objectId === temporaryObjectId
          ? { ...ref, objectId: object.id }
          : ref,
      ),
      views: this.state.views.map((view) =>
        view.kind === "canvas"
          ? {
              ...view,
              config: replaceObjectInCanvasConfig(
                view.config,
                temporaryObjectId,
                object.id,
              ),
            }
          : view,
      ),
    };
    this.emit();
  }

  removeRelation(relationId: string): void {
    this.state = {
      ...this.state,
      relations: this.state.relations.filter(
        (relation) => relation.id !== relationId,
      ),
      views: this.state.views.map((view) =>
        view.kind === "canvas"
          ? {
              ...view,
              config: removeRelationFromCanvasConfig(view.config, relationId),
            }
          : view,
      ),
    };
    this.emit();
  }

  reconcileRelationId(
    temporaryRelationId: string,
    relation: DataRelation,
  ): void {
    this.state = {
      ...this.state,
      relations: this.state.relations.map((candidate) =>
        candidate.id === temporaryRelationId ? relation : candidate,
      ),
      views: this.state.views.map((view) =>
        view.kind === "canvas"
          ? {
              ...view,
              config: replaceRelationInCanvasConfig(
                view.config,
                temporaryRelationId,
                relation.id,
              ),
            }
          : view,
      ),
    };
    this.emit();
  }

  reconcileRelation(relation: DataRelation): void {
    this.state = {
      ...this.state,
      relations: this.state.relations.map((candidate) =>
        candidate.id === relation.id ? relation : candidate,
      ),
    };
    this.emit();
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

  private createObjectEvent(objectId: string, actor: MemberId): ChangeEvent {
    this.sequence += 1;
    return {
      id: eventId(this.sequence),
      track: "data",
      actor,
      target: { entityType: "object", entityId: objectId },
      syncedRefs: 0,
      at: now,
      inverse: null,
    };
  }

  private createSlotBindingEvent(
    bindingId: string,
    actor: MemberId,
    oldValue: string | null,
    nextValue: string | null,
  ): ChangeEvent {
    this.sequence += 1;
    return {
      id: eventId(this.sequence),
      track: "data",
      actor,
      target: { entityType: "object", entityId: bindingId },
      old: oldValue,
      next: nextValue,
      syncedRefs: 0,
      at: now,
      inverse: null,
    };
  }

  private createViewConfigEvent(params: {
    readonly actor: MemberId;
    readonly viewId: string;
    readonly previousConfig: Record<string, unknown>;
    readonly nextConfig: Record<string, unknown>;
  }): ChangeEvent {
    this.sequence += 1;
    return {
      id: eventId(this.sequence),
      track: "view",
      actor: params.actor,
      target: { entityType: "object", entityId: params.viewId },
      old: "视图配置",
      next: "视图配置已更新",
      syncedRefs: 0,
      at: now,
      inverse: null,
      inverseView: {
        viewId: params.viewId,
        config: params.previousConfig,
      },
    };
  }

  private createViewFieldEvent(
    objectId: string,
    fieldCode: FieldCode,
    actor: MemberId,
  ): ChangeEvent {
    this.sequence += 1;
    return {
      id: eventId(this.sequence),
      track: "view",
      actor,
      target: { entityType: "field", entityId: objectId, fieldCode },
      syncedRefs: 0,
      at: now,
      inverse: null,
    };
  }

  private createViewKpiEvent(
    kpiId: string,
    actor: MemberId,
    previousVisible: boolean,
  ): ChangeEvent {
    this.sequence += 1;
    return {
      id: eventId(this.sequence),
      track: "view",
      actor,
      target: { entityType: "object", entityId: kpiId },
      syncedRefs: 0,
      at: now,
      inverse: null,
      inverseKpi: { kpiId, visible: previousVisible },
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

  private requireSlotBinding(
    target:
      | { readonly bindingId: string }
      | { readonly exprId: string; readonly slotId: string },
  ): SlotBinding {
    const binding = this.state.slotBindings.find((candidate) =>
      "bindingId" in target
        ? candidate.id === target.bindingId
        : candidate.exprId === target.exprId &&
          candidate.slotId === target.slotId,
    );
    if (!binding) throw new Error("找不到槽位绑定");
    return binding;
  }

  private requireView(viewId: string): ViewDef {
    const view = this.getView(viewId);
    if (!view) throw new Error(`找不到视图 ${viewId}`);
    return view;
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

  private notifyWriteSink(
    callback: (sink: WriteSink) => void | Promise<WriteCompletion>,
  ): void {
    this.lastWriteCompletion = null;
    if (!this.writeSink) return;
    try {
      const completion = callback(this.writeSink);
      if (!completion) return;
      this.lastWriteCompletion = Promise.resolve(completion).catch(() => ({
        state: "failed" as const,
        message: "写入同步失败，请重新加载工作空间",
      }));
    } catch {
      this.lastWriteCompletion = Promise.resolve({
        state: "failed" as const,
        message: "写入同步失败，请重新加载工作空间",
      });
    }
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
    sceneTemplates: seed.sceneTemplates,
    expressions: seed.expressions,
    views: seed.views,
    docModels: seed.docModels,
    fieldRefs: seed.fieldRefs,
    kpis: seed.kpis,
    biBars: seed.biBars,
    anaReports: seed.anaReports,
    rawImport: seed.rawImport,
    chatMessages: seed.chatMessages,
    reviewRecords: seed.reviewRecords,
    slotBindings: seed.slotBindings,
    changeEvents: seed.changeEvents,
    activity: seed.activity,
    outputSnapshots: seed.outputSnapshots,
    plugins: seed.plugins,
    simScenarios: seed.simScenarios,
  };
}

function removeObjectFromCanvasConfig(
  config: Record<string, unknown>,
  objectId: string,
): Record<string, unknown> {
  const nodes = Array.isArray(config.nodes)
    ? config.nodes.filter(
        (node) =>
          typeof node === "object" &&
          node !== null &&
          "objectId" in node &&
          node.objectId !== objectId,
      )
    : [];
  return { ...config, nodes };
}

function replaceRelationEndpoint(
  relation: DataRelation,
  fromObjectId: string,
  toObjectId: string,
): DataRelation {
  return {
    ...relation,
    sourceId:
      relation.sourceId === fromObjectId ? toObjectId : relation.sourceId,
    targetId:
      relation.targetId === fromObjectId ? toObjectId : relation.targetId,
  };
}

function replaceObjectInCanvasConfig(
  config: Record<string, unknown>,
  fromObjectId: string,
  toObjectId: string,
): Record<string, unknown> {
  const nodes = Array.isArray(config.nodes)
    ? config.nodes.map((node) =>
        isRecord(node) && node.objectId === fromObjectId
          ? { ...node, objectId: toObjectId }
          : node,
      )
    : config.nodes;
  return { ...config, nodes };
}

function removeRelationFromCanvasConfig(
  config: Record<string, unknown>,
  relationId: string,
): Record<string, unknown> {
  const edges = Array.isArray(config.edges)
    ? config.edges.filter(
        (edge) =>
          !(
            isRecord(edge) &&
            "relationId" in edge &&
            edge.relationId === relationId
          ),
      )
    : config.edges;
  return { ...config, edges };
}

function replaceRelationInCanvasConfig(
  config: Record<string, unknown>,
  fromRelationId: string,
  toRelationId: string,
): Record<string, unknown> {
  const edges = Array.isArray(config.edges)
    ? config.edges.map((edge) =>
        isRecord(edge) && edge.relationId === fromRelationId
          ? { ...edge, relationId: toRelationId }
          : edge,
      )
    : config.edges;
  return { ...config, edges };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export const workspaceStore = new WorkspaceStore();

export function useWorkspaceSnapshot(): WorkspaceState {
  return useSyncExternalStore(
    workspaceStore.subscribe,
    workspaceStore.getSnapshot,
    workspaceStore.getSnapshot,
  );
}
