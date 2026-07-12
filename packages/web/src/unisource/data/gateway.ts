import type {
  ChangeSet,
  DataFieldPrimitive,
  DataObject,
  DataObjectId,
  DataRelationId,
  DataRelation,
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
import type { DemoSeed } from "../seed/demo-seed";
import type { ChangeSetResult } from "../state/changeset-store";
import type {
  FieldWriteMeta,
  FieldWriteResult,
  PluginStatePatch,
  RelationWriteResult,
  ViewConfigWriteResult,
} from "../state/workspace-store";
import type { RuleOutcome } from "../validation/rules";

export interface UnisourceGateway {
  /**
   * Update the actor used by write-side command clients.
   * @kernel Maps to CommandClient.setActorId / X-Actor-Id.
   * @mock No-op; local writes already carry actor metadata.
   */
  setActor(actorId: MemberId): void;

  /**
   * Load the complete UniSource workspace graph in the current demo shape.
   * @kernel Assemble from read-model endpoints; implemented in T-US-015.
   * @mock Return a cloned WorkspaceStore and ChangeSetStore snapshot.
   * @gap G8/G9: field provenance and history detail remain coarse.
   */
  loadWorkspace(): Promise<DemoSeed>;

  /**
   * Update one object field through the data write path.
   * @kernel POST /commands UpdateFields.
   * @mock Delegate to WorkspaceStore.updateField.
   * @gap G8: per-field audit is synthesized from the mock event.
   */
  updateField(
    objectId: DataObjectId,
    fieldCode: FieldCode,
    value: DataFieldPrimitive,
    meta: FieldWriteMeta,
  ): Promise<FieldWriteResult>;

  /**
   * Update one relation-owned field without changing endpoint objects.
   * @kernel POST /commands UpdateRelation.
   * @mock Delegate to WorkspaceStore.updateRelationField.
   * @gap G8: relation field provenance uses the mock relation event.
   */
  updateRelationField(
    relationId: DataRelationId,
    fieldCode: FieldCode,
    value: DataFieldPrimitive,
    meta: FieldWriteMeta,
  ): Promise<RelationWriteResult>;

  /**
   * Create one object with stored fields.
   * @kernel POST /commands CreateObject.
   * @mock Delegate to WorkspaceStore.createObject.
   * @gap Mechanical code-to-kernelId resolution; see pre-study section 6.3.
   */
  createObject(params: {
    readonly objectTypeCode: string;
    readonly fields: Record<FieldCode, DataFieldPrimitive>;
    readonly actor?: MemberId;
    readonly source?: "manual" | "ai";
    readonly objectId?: string;
    readonly summary?: string;
  }): Promise<DataObject>;

  /**
   * Create one relation between existing objects.
   * @kernel POST /commands CreateRelation.
   * @mock Delegate to WorkspaceStore.createRelation.
   * @gap Mechanical code-to-kernelId resolution; see pre-study section 6.3.
   */
  createRelation(params: {
    readonly relationTypeCode: string;
    readonly sourceId: DataObjectId;
    readonly targetId: DataObjectId;
    readonly fields?: Record<FieldCode, DataRelation["fields"][FieldCode]>;
    readonly actor?: MemberId;
    readonly summary?: string;
  }): Promise<RelationWriteResult>;

  /**
   * Delete one object from the active demo graph.
   * @kernel POST /commands Archive plus relation unlinking.
   * @mock Delegate to WorkspaceStore.deleteObject.
   * @gap G10: durable undo is based on history in later batches.
   */
  deleteObject(
    objectId: DataObjectId,
    actor?: MemberId,
    expectedVersion?: number,
  ): Promise<DataObject>;

  /**
   * Bind an object into a template slot.
   * @kernel POST /commands CreateRelation or UpdateRelation for slot_binding.
   * @mock Delegate to WorkspaceStore.bindSlot.
   * @gap G5: slot binding is still represented as frontend projection data.
   */
  bindSlot(
    target:
      | { readonly bindingId: string }
      | { readonly exprId: string; readonly slotId: string },
    objectId: DataObjectId,
    meta: FieldWriteMeta,
  ): Promise<SlotBinding>;

  /**
   * Clear a template slot binding.
   * @kernel POST /commands UpdateRelation for slot_binding.
   * @mock Delegate to WorkspaceStore.unbindSlot.
   * @gap G5: slot binding relation shape is finalized in the kernel adapter.
   */
  unbindSlot(
    target:
      | { readonly bindingId: string }
      | { readonly exprId: string; readonly slotId: string },
    meta: FieldWriteMeta,
  ): Promise<SlotBinding>;

  /**
   * Undo a previous change event by applying its inverse.
   * @kernel G10: read objectHistory, derive inverse, then POST /commands.
   * @mock Delegate to WorkspaceStore.undo.
   * @gap G10: inverse coverage is limited to existing mock event kinds.
   */
  undoByEvent(eventId: string): Promise<FieldWriteResult>;

  /**
   * Add a document field reference.
   * @kernel Frontend responsibility; no kernel write in this batch.
   * @mock Delegate to WorkspaceStore.addFieldRef.
   * @gap G7: persistent view reference contract is deferred.
   */
  addFieldRef(
    exprId: string,
    objectId: DataObjectId,
    fieldCode: FieldCode,
    label: string,
    actor?: MemberId,
  ): Promise<FieldRef>;

  /**
   * Rebind an existing document field reference.
   * @kernel Frontend responsibility; no kernel write in this batch.
   * @mock Delegate to WorkspaceStore.rebindFieldRef.
   * @gap G7: persistent view reference contract is deferred.
   */
  rebindFieldRef(
    refId: string,
    newFieldCode: FieldCode,
    actor?: MemberId,
  ): Promise<FieldRef>;

  /**
   * Update one view configuration blob.
   * @kernel Frontend responsibility for P4; kernel view config storage is later.
   * @mock Delegate to WorkspaceStore.updateViewConfig.
   * @gap G6: layout persistence stays in the frontend projection for now.
   */
  updateViewConfig(
    viewId: string,
    patch: Record<string, unknown>,
    meta: FieldWriteMeta,
  ): Promise<ViewConfigWriteResult>;

  /**
   * Toggle KPI visibility in BI and analysis views.
   * @kernel Frontend responsibility for P4.
   * @mock Delegate to WorkspaceStore.setKpiVisible.
   * @gap G6: KPI visibility is still a view preference projection.
   */
  setKpiVisible(
    kpiId: string,
    visible: boolean,
    actor: MemberId,
  ): Promise<KpiCardDef>;

  /**
   * Update the frontend plugin registry projection.
   * @kernel Frontend responsibility; not a kernel command.
   * @mock Delegate to WorkspaceStore.setPluginState.
   * @gap Frontend registry only until plugin contracts are promoted.
   */
  setPluginState(
    pluginId: string,
    patch: PluginStatePatch,
    actor: MemberId,
  ): Promise<PluginDef>;

  /**
   * Add one review or approval record.
   * @kernel Near mapping to CreateAnnotation or review command endpoint.
   * @mock Delegate to WorkspaceStore.addReviewRecord.
   * @gap G2/G8: resource permission projection and annotation mapping pending.
   */
  addReviewRecord(
    record: Omit<ReviewRecord, "id" | "at">,
  ): Promise<ReviewRecord>;

  /**
   * Trigger a validation run and return its run id.
   * @kernel POST /rule-commands RunRuleCheck.
   * @mock Run the local validation rule engine and cache results by run id.
   * @gap G9: server-side incremental rule results are wired in T-US-017.
   */
  runRuleCheck(): Promise<string>;

  /**
   * Read validation results for one run.
   * @kernel GET /views/check-results.
   * @mock Return cached results from runRuleCheck.
   * @gap G9: pagination and compare/fix payload parity are deferred.
   */
  checkResults(runId: string): Promise<readonly RuleOutcome[]>;

  /**
   * Read kernel-authoritative AI change sets without replacing scripted local sets.
   * @kernel GET /workspaces/{id}/views/ai-changes.
   * @mock Return the local ChangeSetStore projection.
   * @gap G1: displayed as an overlay until all scripted flows migrate.
   */
  listAiChanges(): Promise<readonly ChangeSet[]>;

  /**
   * Submit an AI change set for human confirmation.
   * @kernel POST /workspaces/{id}/ai-commands ProposeAiChange.
   * @mock Delegate to ChangeSetStore.submit.
   * @gap G1: item-level backend confirmation is tracked separately.
   */
  proposeAiChange(changeSet: ChangeSet): Promise<ChangeSet>;

  /**
   * Confirm an AI change set, optionally by item id.
   * @kernel POST /workspaces/{id}/ai-commands ConfirmAiChange.
   * @mock Delegate to ChangeSetStore.confirmAll or acceptItems.
   * @gap G1: itemIds is reserved for the backend item-confirmation card.
   */
  confirmAiChange(
    setId: string,
    itemIds?: readonly string[],
  ): Promise<ChangeSetResult>;

  /**
   * Reject an AI change set.
   * @kernel POST /workspaces/{id}/ai-commands RejectAiChange.
   * @mock Delegate to ChangeSetStore.reject.
   * @gap G1: review audit mapping is completed in the kernel adapter.
   */
  rejectAiChange(setId: string): Promise<ChangeSetResult>;
}

export interface WriteRejection {
  readonly code: string;
  readonly title: string;
  readonly currentVersion?: number;
  readonly conflictingFields: readonly {
    readonly fieldCode: FieldCode;
    readonly currentValue: unknown;
    readonly changedBy: string;
    readonly changedAt: string;
  }[];
}
