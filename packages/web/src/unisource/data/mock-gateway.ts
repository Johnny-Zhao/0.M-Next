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
  WorkspaceStore,
  type FieldWriteMeta,
  type FieldWriteResult,
  type PluginStatePatch,
  type RelationWriteResult,
  type ViewConfigWriteResult,
} from "../state/workspace-store";
import { runValidationRules, type RuleOutcome } from "../validation/rules";
import type { UnisourceGateway } from "./gateway";

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

  async loadWorkspace(): Promise<DemoSeed> {
    const state = this.workspace.getSnapshot();
    return structuredClone({
      ...state,
      changeSets: this.changeSets.getSnapshot().changeSets,
    }) as DemoSeed;
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
  ): Promise<DataObject> {
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
