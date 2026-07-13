import type {
  ChangeSet,
  DataFieldPrimitive,
  DataFieldValue,
  DataObject,
  DataObjectId,
  DataRelationId,
  FieldCode,
  MemberId,
  ReviewRecord,
} from "../model/kernel";
import type {
  FieldRef,
  KpiCardDef,
  PluginDef,
  SlotBinding,
} from "../model/view-layer";
import { cloneDemoSeed, type DemoSeed } from "../seed/demo-seed";
import { ChangeSetStore, type ChangeSetResult } from "../state/changeset-store";
import {
  type WorkspaceState,
  WorkspaceStore,
  type FieldWriteMeta,
  type FieldWriteResult,
  type PluginStatePatch,
  type RelationWriteResult,
  type ViewConfigWriteResult,
} from "../state/workspace-store";
import { runValidationRules, type RuleOutcome } from "../validation/rules";
import { annotationFromComment } from "./gateway";
import type {
  OutputArtifact,
  OutputArtifactMeta,
  OutputCreateOptions,
  OutputFormat,
  SnapshotArtifact,
  Annotation,
  CreateAnnotationInput,
  UnisourceGateway,
} from "./gateway";

export class MockUnisourceGateway implements UnisourceGateway {
  private readonly workspace: WorkspaceStore;
  private readonly changeSets: ChangeSetStore;
  private readonly validationRuns = new Map<string, readonly RuleOutcome[]>();
  private validationRunSequence = 0;

  constructor(seed: DemoSeed = cloneDemoSeed()) {
    const initialSeed = structuredClone(seed) as DemoSeed;
    this.workspace = new WorkspaceStore(initialSeed);
    this.changeSets = new ChangeSetStore(initialSeed, this.workspace);
  }

  setActor(actorId: MemberId): void {
    void actorId;
  }

  async loadWorkspace(): Promise<DemoSeed> {
    return structuredClone(
      toDemoSeed(this.workspace.getSnapshot(), this.changeSets.getSnapshot()),
    );
  }

  async updateField(
    objectId: DataObjectId,
    fieldCode: FieldCode,
    value: DataFieldPrimitive,
    meta: FieldWriteMeta,
  ): Promise<FieldWriteResult> {
    return this.workspace.updateField(objectId, fieldCode, value, meta);
  }

  async updateRelationField(
    relationId: DataRelationId,
    fieldCode: FieldCode,
    value: DataFieldPrimitive,
    meta: FieldWriteMeta,
  ): Promise<RelationWriteResult> {
    return this.workspace.updateRelationField(
      relationId,
      fieldCode,
      value,
      meta,
    );
  }

  async createObject(params: {
    readonly objectTypeCode: string;
    readonly fields: Record<FieldCode, DataFieldPrimitive>;
    readonly actor?: MemberId;
    readonly source?: "manual" | "ai";
    readonly objectId?: string;
    readonly summary?: string;
  }): Promise<DataObject> {
    return this.workspace.createObject(params);
  }

  async createRelation(params: {
    readonly relationTypeCode: string;
    readonly sourceId: DataObjectId;
    readonly targetId: DataObjectId;
    readonly fields?: Record<FieldCode, DataFieldValue>;
    readonly actor?: MemberId;
    readonly summary?: string;
  }): Promise<RelationWriteResult> {
    return this.workspace.createRelation(params);
  }

  async deleteObject(
    objectId: DataObjectId,
    actor?: MemberId,
    expectedVersion?: number,
  ): Promise<DataObject> {
    void expectedVersion;
    return this.workspace.deleteObject(objectId, actor);
  }

  async bindSlot(
    target:
      | { readonly bindingId: string }
      | { readonly exprId: string; readonly slotId: string },
    objectId: DataObjectId,
    meta: FieldWriteMeta,
  ): Promise<SlotBinding> {
    return this.workspace.bindSlot(target, objectId, meta);
  }

  async unbindSlot(
    target:
      | { readonly bindingId: string }
      | { readonly exprId: string; readonly slotId: string },
    meta: FieldWriteMeta,
  ): Promise<SlotBinding> {
    return this.workspace.unbindSlot(target, meta);
  }

  async undoByEvent(eventId: string): Promise<FieldWriteResult> {
    return this.workspace.undo(eventId);
  }

  async addFieldRef(
    exprId: string,
    objectId: DataObjectId,
    fieldCode: FieldCode,
    label: string,
    actor?: MemberId,
  ): Promise<FieldRef> {
    return this.workspace.addFieldRef(
      exprId,
      objectId,
      fieldCode,
      label,
      actor,
    );
  }

  async rebindFieldRef(
    refId: string,
    newFieldCode: FieldCode,
    actor?: MemberId,
  ): Promise<FieldRef> {
    return this.workspace.rebindFieldRef(refId, newFieldCode, actor);
  }

  async updateViewConfig(
    viewId: string,
    patch: Record<string, unknown>,
    meta: FieldWriteMeta,
  ): Promise<ViewConfigWriteResult> {
    return this.workspace.updateViewConfig(viewId, patch, meta);
  }

  async setKpiVisible(
    kpiId: string,
    visible: boolean,
    actor: MemberId,
  ): Promise<KpiCardDef> {
    return this.workspace.setKpiVisible(kpiId, visible, actor);
  }

  async setPluginState(
    pluginId: string,
    patch: PluginStatePatch,
    actor: MemberId,
  ): Promise<PluginDef> {
    return this.workspace.setPluginState(pluginId, patch, actor);
  }

  async addReviewRecord(
    record: Omit<ReviewRecord, "id" | "at">,
  ): Promise<ReviewRecord> {
    return this.workspace.addReviewRecord(record);
  }

  async listAnnotations(
    target?: Parameters<UnisourceGateway["listAnnotations"]>[0],
  ): Promise<readonly Annotation[]> {
    const annotations = this.workspace
      .getSnapshot()
      .comments.map(annotationFromComment);
    if (!target) return annotations;
    return annotations.filter(
      (annotation) =>
        annotation.anchor.entityType === target.entityType &&
        annotation.anchor.entityId === target.entityId &&
        (annotation.anchor.fieldCode ?? null) === (target.fieldCode ?? null),
    );
  }

  async createAnnotation(request: CreateAnnotationInput): Promise<Annotation> {
    return {
      id: "mock-annotation",
      anchor: request.target,
      body: request.body,
      author: "wangyun",
      at: "2026-07-10T10:32:00+08:00",
      resolved: false,
      severity: request.severity,
      anchoredDataVersion: request.anchoredDataVersion,
      resolvedBy: null,
      resolvedAt: null,
    };
  }

  async resolveAnnotation(annotationId: string): Promise<Annotation> {
    return (
      (await this.listAnnotations()).find(
        (annotation) => annotation.id === annotationId,
      ) ?? mockAnnotation(annotationId, true)
    );
  }

  async reopenAnnotation(annotationId: string): Promise<Annotation> {
    return mockAnnotation(annotationId, false);
  }

  async runRuleCheck(): Promise<string> {
    this.validationRunSequence += 1;
    const runId = `mock-rule-run-${String(this.validationRunSequence).padStart(4, "0")}`;
    this.validationRuns.set(
      runId,
      runValidationRules(this.workspace.getSnapshot()),
    );
    return runId;
  }

  async checkResults(runId: string): Promise<readonly RuleOutcome[]> {
    return this.validationRuns.get(runId) ?? [];
  }

  async captureSnapshot(
    scopeObjectType?: string | null,
  ): Promise<SnapshotArtifact> {
    return {
      snapshotId: "mock-snapshot",
      createdBy: "mock",
      createdAt: "2026-07-10T10:32:00+08:00",
      dataVersion: 1,
      contentHash: "mock",
      scopeObjectType: scopeObjectType ?? null,
    };
  }

  async createOutput(
    snapshotId: string,
    format: OutputFormat,
    options: OutputCreateOptions = {},
  ): Promise<OutputArtifactMeta> {
    void options;
    return {
      outputId: `mock-output-${format}`,
      snapshotId,
      format,
      createdBy: "mock",
      createdAt: "2026-07-10T10:32:00+08:00",
      contentHash: "mock",
    };
  }

  async getOutput(outputId: string): Promise<OutputArtifact> {
    return {
      outputId,
      snapshotId: "mock-snapshot",
      format: "markdown",
      artifact: "# Mock output",
      createdBy: "mock",
      createdAt: "2026-07-10T10:32:00+08:00",
      contentHash: "mock",
    };
  }

  async listAiChanges(): Promise<readonly ChangeSet[]> {
    return this.changeSets.getSnapshot().changeSets;
  }

  async proposeAiChange(changeSet: ChangeSet): Promise<ChangeSet> {
    return this.changeSets.submit(changeSet);
  }

  async confirmAiChange(
    setId: string,
    itemIds?: readonly string[],
  ): Promise<ChangeSetResult> {
    return itemIds === undefined
      ? this.changeSets.confirmAll(setId)
      : this.changeSets.acceptItems(setId, itemIds);
  }

  async rejectAiChange(setId: string): Promise<ChangeSetResult> {
    return this.changeSets.reject(setId);
  }
}

export function createMockUnisourceGateway(seed?: DemoSeed): UnisourceGateway {
  return new MockUnisourceGateway(seed);
}

export function toDemoSeed(
  state: WorkspaceState,
  changeSetState: { readonly changeSets: DemoSeed["changeSets"] },
): DemoSeed {
  return {
    workspace: state.workspace,
    members: state.members,
    objectTypes: state.objectTypes,
    objects: state.objects,
    relationTypes: state.relationTypes,
    relations: state.relations,
    comments: state.comments,
    permissions: state.permissions,
    sceneTemplates: state.sceneTemplates,
    expressions: state.expressions,
    views: state.views,
    docModels: state.docModels,
    fieldRefs: state.fieldRefs,
    kpis: state.kpis,
    biBars: state.biBars,
    anaReports: state.anaReports,
    rawImport: state.rawImport,
    chatMessages: state.chatMessages,
    reviewRecords: state.reviewRecords,
    slotBindings: state.slotBindings,
    changeSets: changeSetState.changeSets,
    changeEvents: state.changeEvents,
    activity: state.activity,
    outputSnapshots: state.outputSnapshots,
    plugins: state.plugins,
    simScenarios: state.simScenarios,
  };
}

function mockAnnotation(id: string, resolved: boolean): Annotation {
  return {
    id,
    anchor: { entityType: "object", entityId: "mock" },
    body: "Mock annotation",
    author: "wangyun",
    at: "2026-07-10T10:32:00+08:00",
    resolved,
    severity: "info",
    anchoredDataVersion: 1,
    resolvedBy: resolved ? "wangyun" : null,
    resolvedAt: resolved ? "2026-07-10T10:32:00+08:00" : null,
  };
}
