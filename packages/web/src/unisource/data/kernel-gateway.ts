import {
  CommandFailure,
  CommandClient,
  ViewClient,
  type CheckResultItem,
  type FetchFn,
  type ObjectType,
  type RelationSummary,
  type ViewObject,
  type WorkspaceSummary,
} from "@m-next/views";

import type {
  ChangeSet,
  DataFieldPrimitive,
  DataFieldValue,
  DataObject,
  DataRelation,
  FieldCode,
  MemberId,
  RelationType,
  ReviewRecord,
} from "../model/kernel";
import type {
  ChangeEvent,
  FieldRef,
  KpiCardDef,
  PluginDef,
  SlotBinding,
} from "../model/view-layer";
import { cloneDemoSeed, type DemoSeed } from "../seed/demo-seed";
import {
  PresentationPresetRegistry,
  type PresentationPreset,
} from "../presentation/presentation-preset-registry";
import type { ChangeSetResult } from "../state/changeset-store";
import type {
  FieldWriteMeta,
  FieldWriteResult,
  RelationWriteResult,
  ViewConfigWriteResult,
} from "../state/workspace-store";
import type { RuleOutcome } from "../validation/rules";
import {
  mapAiChangeSet,
  mapAnnotation,
  mapCommandError,
  mapCheckResult,
  mapExchangeApply,
  mapExchangeDiff,
  mapHistoryEntry,
  mapLineage,
  mapObjectType,
  mapOutputDetail,
  mapOutputMeta,
  mapSnapshotMeta,
  mapViewObject,
} from "./dto-mappers";
import type {
  OutputArtifact,
  OutputArtifactMeta,
  OutputCreateOptions,
  OutputFormat,
  SnapshotArtifact,
  SnapshotTreeScope,
  Annotation,
  CreateAnnotationInput,
  ExchangeApplyOutcome,
  ExchangeDiff,
  ExchangeFormat,
  Lineage,
  LatestCheckRun,
  UnisourceGateway,
} from "./gateway";
import {
  objectBusinessKey,
  relationBusinessKey,
  remapSeedPresentation,
  type IdentityRemapReport,
} from "./identity-remap";

const PAGE_SIZE = 100;
const OBJECT_TYPE_LOAD_CONCURRENCY = 8;
export const RELATION_LOAD_CONCURRENCY = 8;
const CLAIM_READ_ATTEMPTS = 5;
const CLAIM_READ_DELAY_MS = 100;

export interface KernelGatewayLoadReport extends IdentityRemapReport {
  readonly objectCount: number;
  readonly relationCount: number;
  readonly historyCount: number;
  readonly relationLoadFailures: number;
}

export interface KernelSeedReport {
  readonly createdObjects: number;
  readonly skippedObjects: number;
  readonly createdRelations: number;
  readonly skippedRelations: number;
  readonly missingTypes: readonly string[];
  readonly failed: readonly string[];
}

interface KernelGraph {
  readonly objectTypes: readonly ReturnType<typeof mapObjectType>[];
  readonly objects: readonly DataObject[];
  readonly relationTypes: readonly RelationType[];
  readonly relations: readonly DataRelation[];
  readonly relationLoadFailures: number;
}

interface RelationLoadResult {
  readonly relations: readonly DataRelation[];
  readonly failedObjectIds: readonly string[];
}

export class KernelGateway implements UnisourceGateway {
  private readonly viewClient: ViewClient;
  private readonly commandClient: CommandClient;
  private readonly presetRegistry: PresentationPresetRegistry;
  private lastLoadReport: KernelGatewayLoadReport | null = null;
  private currentActor: MemberId;
  private objectTypesByCode: ReadonlyMap<string, ObjectType> | null = null;
  private relationTypeIdsByCode: ReadonlyMap<string, string> | null = null;
  private workspaceTemplateCode: string | null = null;
  private inFlightWorkspaceLoad: Promise<DemoSeed> | null = null;

  constructor(
    baseUrl: string,
    private readonly workspaceId: string,
    actorId: MemberId,
    fetchFn?: FetchFn,
    presetRegistry = new PresentationPresetRegistry(),
  ) {
    this.viewClient = new ViewClient(baseUrl, fetchFn);
    this.commandClient = new CommandClient(baseUrl, fetchFn);
    this.presetRegistry = presetRegistry;
    this.currentActor = actorId;
    this.commandClient.setActorId(actorId);
  }

  setActor(actorId: MemberId): void {
    this.currentActor = actorId;
    this.commandClient.setActorId(actorId);
  }

  getLastLoadReport(): KernelGatewayLoadReport | null {
    return this.lastLoadReport;
  }

  getWorkspaceTemplateCode(): string | null {
    return this.workspaceTemplateCode;
  }

  loadWorkspace(): Promise<DemoSeed> {
    if (this.inFlightWorkspaceLoad) return this.inFlightWorkspaceLoad;
    const load = this.loadWorkspaceInternal();
    this.inFlightWorkspaceLoad = load;
    void load.then(
      () => this.clearInFlightWorkspaceLoad(load),
      () => this.clearInFlightWorkspaceLoad(load),
    );
    return load;
  }

  private clearInFlightWorkspaceLoad(load: Promise<DemoSeed>): void {
    if (this.inFlightWorkspaceLoad === load) this.inFlightWorkspaceLoad = null;
  }

  private async loadWorkspaceInternal(): Promise<DemoSeed> {
    const [graph, workspaceSummary] = await Promise.all([
      this.loadKernelGraph(),
      this.loadWorkspaceSummary(),
    ]);
    const preset = this.presetRegistry.resolve(workspaceSummary.templateCode);
    this.workspaceTemplateCode = workspaceSummary?.templateCode ?? null;
    const remapped = remapSeedPresentation({
      seed: kernelPresentationSeed(preset, this.workspaceId, workspaceSummary),
      kernelObjects: graph.objects,
      kernelRelations: graph.relations,
      objectBindings: preset.objectBindings,
      relationBindings: preset.relationBindings,
    });
    this.lastLoadReport = {
      ...remapped.report,
      objectCount: graph.objects.length,
      relationCount: graph.relations.length,
      historyCount: 0,
      relationLoadFailures: graph.relationLoadFailures,
    };
    return {
      ...remapped.seed,
      workspace: {
        ...remapped.seed.workspace,
        id: this.workspaceId,
        name: workspaceSummary.name,
        updatedAt: workspaceSummary.updatedAt,
      },
      objectTypes: graph.objectTypes,
      objects: graph.objects,
      relationTypes: graph.relationTypes,
      relations: graph.relations,
      changeEvents: [],
      activity: [],
    };
  }

  private async loadWorkspaceSummary(): Promise<WorkspaceSummary> {
    const workspaces = await this.viewClient.workspaces();
    const workspace = workspaces.find(
      (workspace) => workspace.workspaceId === this.workspaceId,
    );
    if (!workspace) {
      throw new Error("指定工作空间不存在或当前用户无权访问。");
    }
    return workspace;
  }

  async seedDemoData(seed?: DemoSeed): Promise<KernelSeedReport> {
    const workspace = await this.loadWorkspaceSummary();
    this.workspaceTemplateCode = workspace?.templateCode ?? null;
    if (this.workspaceTemplateCode !== "hardware_products") {
      return disabledSeedReport(this.workspaceTemplateCode);
    }
    const demoSeed = seed ?? cloneDemoSeed();
    const report = mutableSeedReport();
    const objectTypes = await this.viewClient.objectTypes(this.workspaceId);
    this.objectTypesByCode = new Map(
      objectTypes.map((type) => [type.code, type]),
    );
    const typeIds = new Map(objectTypes.map((type) => [type.code, type.id]));
    const existingObjects = await this.loadObjectsForTypes(objectTypes);
    const existingKeys = new Set(
      existingObjects.map(objectBusinessKey).filter(isString),
    );

    for (const object of demoSeed.objects) {
      const typeId = typeIds.get(object.objectTypeCode);
      const key = objectBusinessKey(object);
      if (!typeId || !key) {
        report.skippedObjects += 1;
        if (!typeId) report.missingTypes.add(object.objectTypeCode);
        continue;
      }
      if (existingKeys.has(key)) {
        report.skippedObjects += 1;
        continue;
      }
      try {
        await this.commandClient.createObject(
          this.workspaceId,
          typeId,
          rawFields(object),
        );
        existingKeys.add(key);
        report.createdObjects += 1;
      } catch (error) {
        report.failed.push(`object ${object.id}: ${errorMessage(error)}`);
      }
    }

    const currentObjects = await this.loadObjectsForTypes(objectTypes);
    const currentRelations = (
      await this.loadRelationsForObjects(currentObjects)
    ).relations;
    const currentObjectsById = byId(currentObjects);
    const currentObjectByKey = new Map(
      currentObjects
        .map((object) => [objectBusinessKey(object), object] as const)
        .filter(
          (entry): entry is readonly [string, DataObject] => entry[0] !== null,
        ),
    );
    const currentRelationKeys = new Set(
      currentRelations
        .map((relation) => relationBusinessKey(relation, currentObjectsById))
        .filter(isString),
    );
    const relationTypes = await this.viewClient.relationTypes(this.workspaceId);
    const relationTypeIds = new Map(
      relationTypes.map((type) => [type.code, type.id]),
    );
    this.relationTypeIdsByCode = relationTypeIds;

    for (const relation of demoSeed.relations) {
      const relationTypeId = relationTypeIds.get(relation.relationTypeCode);
      const sourceSeed = demoSeed.objects.find(
        (object) => object.id === relation.sourceId,
      );
      const targetSeed = demoSeed.objects.find(
        (object) => object.id === relation.targetId,
      );
      const source = sourceSeed
        ? currentObjectByKey.get(objectBusinessKey(sourceSeed) ?? "")
        : undefined;
      const target = targetSeed
        ? currentObjectByKey.get(objectBusinessKey(targetSeed) ?? "")
        : undefined;
      const key =
        source && target
          ? relationBusinessKey(
              { ...relation, sourceId: source.id, targetId: target.id },
              currentObjectsById,
            )
          : null;
      if (!relationTypeId || !source || !target || !key) {
        report.skippedRelations += 1;
        if (!relationTypeId) report.missingTypes.add(relation.relationTypeCode);
        continue;
      }
      if (currentRelationKeys.has(key)) {
        report.skippedRelations += 1;
        continue;
      }
      try {
        await this.commandClient.createRelation(
          this.workspaceId,
          relationTypeId,
          source.id,
          target.id,
          "unisource-seed",
        );
        currentRelationKeys.add(key);
        report.createdRelations += 1;
      } catch (error) {
        report.failed.push(`relation ${relation.id}: ${errorMessage(error)}`);
      }
    }
    return freezeSeedReport(report);
  }

  async updateField(
    objectId: string,
    fieldCode: FieldCode,
    value: DataFieldPrimitive,
    meta: FieldWriteMeta,
  ): Promise<FieldWriteResult> {
    const expectedObjectVersion = meta.expectedObjectVersion;
    if (typeof expectedObjectVersion !== "number") {
      throw new Error("KernelGateway.updateField 缺少 expectedObjectVersion");
    }
    return this.runWrite(async () => {
      await this.commandClient.updateFields(
        this.workspaceId,
        objectId,
        expectedObjectVersion,
        [{ fieldDefCode: fieldCode, value }],
      );
      const object = await this.loadObjectById(objectId);
      return {
        event: kernelWriteEvent("field", objectId, fieldCode, meta.actor),
        syncedRefs: 0,
        object,
      };
    });
  }

  async refreshObject(objectId: string): Promise<DataObject> {
    return this.loadObjectById(objectId);
  }

  async updateRelationField(
    ...args: Parameters<UnisourceGateway["updateRelationField"]>
  ): Promise<RelationWriteResult> {
    this.rejectWrite(...args);
  }

  async createObject(
    params: Parameters<UnisourceGateway["createObject"]>[0],
  ): Promise<DataObject> {
    return this.runWrite(async () => {
      const type = await this.requireObjectType(params.objectTypeCode);
      await this.commandClient.createObject(
        this.workspaceId,
        type.id,
        params.fields,
      );
      return this.claimObject(params.objectTypeCode, params.fields);
    });
  }

  async createRelation(
    params: Parameters<UnisourceGateway["createRelation"]>[0],
  ): Promise<RelationWriteResult> {
    return this.runWrite(async () => {
      const relationTypeId = await this.requireRelationTypeId(
        params.relationTypeCode,
      );
      const result = await this.commandClient.createRelation(
        this.workspaceId,
        relationTypeId,
        params.sourceId,
        params.targetId,
        "unisource",
      );
      const relation =
        result?.relationId && result.version
          ? {
              id: result.relationId,
              relationTypeCode: params.relationTypeCode,
              sourceId: params.sourceId,
              targetId: params.targetId,
              status: "active" as const,
              fields: {},
              version: result.version,
              annotationIds: [],
            }
          : await this.claimRelation(params);
      return { relation };
    });
  }

  async unlinkRelation(
    params: Parameters<UnisourceGateway["unlinkRelation"]>[0],
  ): Promise<RelationWriteResult> {
    return this.runWrite(async () => {
      await this.commandClient.unlink(
        this.workspaceId,
        params.relation.id,
        params.expectedVersion,
      );
      return {
        relation: {
          ...params.relation,
          status: "unlinked",
          version: params.expectedVersion + 1,
        },
      };
    });
  }

  async deleteObject(
    objectId: string,
    actor?: MemberId,
    expectedVersion?: number,
  ): Promise<DataObject> {
    void actor;
    return this.runWrite(async () => {
      const object = await this.loadObjectById(objectId);
      await this.commandClient.archive(
        this.workspaceId,
        "object",
        objectId,
        expectedVersion ?? object.version,
        "unisource-delete-object",
      );
      return object;
    });
  }

  async bindSlot(
    ...args: Parameters<UnisourceGateway["bindSlot"]>
  ): Promise<SlotBinding> {
    this.rejectWrite(...args);
  }

  async unbindSlot(
    ...args: Parameters<UnisourceGateway["unbindSlot"]>
  ): Promise<SlotBinding> {
    this.rejectWrite(...args);
  }

  async undoByEvent(
    ...args: Parameters<UnisourceGateway["undoByEvent"]>
  ): Promise<FieldWriteResult> {
    this.rejectWrite(...args);
  }

  async addFieldRef(
    ...args: Parameters<UnisourceGateway["addFieldRef"]>
  ): Promise<FieldRef> {
    this.rejectWrite(...args);
  }

  async rebindFieldRef(
    ...args: Parameters<UnisourceGateway["rebindFieldRef"]>
  ): Promise<FieldRef> {
    this.rejectWrite(...args);
  }

  async updateViewConfig(
    ...args: Parameters<UnisourceGateway["updateViewConfig"]>
  ): Promise<ViewConfigWriteResult> {
    this.rejectWrite(...args);
  }

  async setKpiVisible(
    ...args: Parameters<UnisourceGateway["setKpiVisible"]>
  ): Promise<KpiCardDef> {
    this.rejectWrite(...args);
  }

  async setPluginState(
    ...args: Parameters<UnisourceGateway["setPluginState"]>
  ): Promise<PluginDef> {
    this.rejectWrite(...args);
  }

  async addReviewRecord(
    ...args: Parameters<UnisourceGateway["addReviewRecord"]>
  ): Promise<ReviewRecord> {
    this.rejectWrite(...args);
  }

  async listAnnotations(
    target?: Parameters<UnisourceGateway["listAnnotations"]>[0],
  ): Promise<readonly Annotation[]> {
    if (!target) return [];
    const annotations = await this.viewClient.annotations(
      this.workspaceId,
      target.entityType,
      target.entityId,
      target.entityType === "field" ? target.fieldCode : null,
    );
    return annotations.map(mapAnnotation);
  }

  async createAnnotation(request: CreateAnnotationInput): Promise<Annotation> {
    return this.runWrite(async () => {
      const annotation = await this.commandClient.createAnnotation(
        this.workspaceId,
        {
          targetType: request.target.entityType,
          targetId: request.target.entityId,
          fieldCode:
            request.target.entityType === "field"
              ? request.target.fieldCode
              : null,
          anchoredDataVersion: request.anchoredDataVersion,
          severity: request.severity,
          body: request.body,
          roundId: null,
        },
      );
      return mapAnnotation(annotation);
    });
  }

  async resolveAnnotation(
    annotationId: string,
    comment?: string | null,
  ): Promise<Annotation> {
    return this.runWrite(async () =>
      mapAnnotation(
        await this.commandClient.resolveAnnotation(
          this.workspaceId,
          annotationId,
          comment,
        ),
      ),
    );
  }

  async reopenAnnotation(
    annotationId: string,
    comment?: string | null,
  ): Promise<Annotation> {
    return this.runWrite(async () =>
      mapAnnotation(
        await this.commandClient.reopenAnnotation(
          this.workspaceId,
          annotationId,
          comment,
        ),
      ),
    );
  }

  async runRuleCheck(objectTypeCode?: string | null): Promise<string> {
    return this.viewClient.runRuleCheck(
      this.workspaceId,
      this.currentActor,
      objectTypeCode,
    );
  }

  async latestCheckRun(): Promise<LatestCheckRun> {
    return this.viewClient.latestCheckRun(this.workspaceId);
  }

  async checkResults(runId: string): Promise<readonly RuleOutcome[]> {
    const items: CheckResultItem[] = [];
    let page = 0;
    const size = 50;
    while (true) {
      const result = await this.viewClient.checkResults(
        this.workspaceId,
        runId,
        page,
        size,
      );
      items.push(...result.items);
      if (
        result.items.length === 0 ||
        (page + 1) * result.pageSize >= result.total
      )
        break;
      page += 1;
    }
    return items.map(mapCheckResult);
  }

  async captureSnapshot(
    scopeObjectType?: string | null,
    treeScope?: SnapshotTreeScope | null,
  ): Promise<SnapshotArtifact> {
    return this.runWrite(async () => {
      const snapshot = await this.viewClient.captureSnapshot(
        this.workspaceId,
        this.currentActor,
        scopeObjectType ?? null,
        treeScope ?? null,
      );
      return mapSnapshotMeta(snapshot);
    });
  }

  async createOutput(
    snapshotId: string,
    format: OutputFormat,
    options: OutputCreateOptions = {},
  ): Promise<OutputArtifactMeta> {
    return this.runWrite(async () => {
      const output = await this.viewClient.createOutput(
        this.workspaceId,
        this.currentActor,
        {
          snapshotId,
          format,
          templateId: options.templateId ?? null,
          templateVersion: options.templateVersion ?? null,
          objectType: options.objectType ?? null,
          fieldOrder: options.fieldOrder ?? null,
          ...(options.sectionMapping
            ? { sectionMapping: options.sectionMapping }
            : {}),
        },
      );
      return mapOutputMeta(output);
    });
  }

  async getOutput(outputId: string): Promise<OutputArtifact> {
    return this.runWrite(async () => {
      const output = await this.viewClient.getOutput(
        this.workspaceId,
        outputId,
      );
      return mapOutputDetail(output);
    });
  }

  async exchangePreview(
    format: ExchangeFormat,
    payload: string,
  ): Promise<ExchangeDiff> {
    const diff = await this.viewClient.exchangePreview(
      this.workspaceId,
      format,
      payload,
    );
    return mapExchangeDiff(diff);
  }

  async exchangeApply(
    format: ExchangeFormat,
    payload: string,
  ): Promise<ExchangeApplyOutcome> {
    return this.runWrite(async () =>
      mapExchangeApply(
        await this.commandClient.exchangeApply(
          this.workspaceId,
          format,
          payload,
        ),
      ),
    );
  }

  async lineage(objectId: string, fieldCode: string): Promise<Lineage> {
    return mapLineage(
      await this.viewClient.lineage(this.workspaceId, objectId, fieldCode),
    );
  }

  async listAiChanges(): Promise<readonly ChangeSet[]> {
    const sets = await this.viewClient.aiChanges(
      this.workspaceId,
      this.currentActor,
      { status: "PROPOSED" },
    );
    return sets.map(mapAiChangeSet);
  }

  async proposeAiChange(changeSet: ChangeSet): Promise<ChangeSet> {
    return this.runWrite(async () => {
      await this.commandClient.proposeAiChange(this.workspaceId, {
        action: "SUGGEST_FIELDS",
        selection: {
          objectIds: [
            ...new Set(
              changeSet.items
                .map((item) => item.target.entityId)
                .filter((id) => id.length > 0),
            ),
          ],
          checkResultIds: [],
        },
        instruction: changeSet.title,
      });
      return changeSet;
    });
  }

  async confirmAiChange(
    setId: string,
    itemIds?: readonly string[],
  ): Promise<ChangeSetResult> {
    return this.runWrite(async () => {
      await this.commandClient.confirmAiChange(
        this.workspaceId,
        setId,
        itemIds,
      );
      return {
        ok: true,
        changeSet: await this.readAiChangeSet(setId, "resolved"),
      };
    });
  }

  async rejectAiChange(setId: string): Promise<ChangeSetResult> {
    return this.runWrite(async () => {
      await this.commandClient.rejectAiChange(this.workspaceId, setId);
      return {
        ok: true,
        changeSet: await this.readAiChangeSet(setId, "rejected"),
      };
    });
  }

  private rejectWrite(...args: readonly unknown[]): never {
    void args;
    throw tus016();
  }

  private async runWrite<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CommandFailure) {
        throw mapCommandError(error.commandError);
      }
      throw error;
    }
  }

  private async readAiChangeSet(
    setId: string,
    fallbackStatus: ChangeSet["status"],
  ): Promise<ChangeSet> {
    const sets = await this.viewClient.aiChanges(
      this.workspaceId,
      this.currentActor,
      { setId },
    );
    return (
      sets.map(mapAiChangeSet)[0] ?? kernelAiFallback(setId, fallbackStatus)
    );
  }

  private async requireObjectType(code: string): Promise<ObjectType> {
    const objectTypes = await this.loadObjectTypeMap();
    const type = objectTypes.get(code);
    if (!type) throw new Error(`找不到对象类型 ${code}`);
    return type;
  }

  private async requireRelationTypeId(code: string): Promise<string> {
    const relationTypes = await this.loadRelationTypeIdMap();
    const relationTypeId = relationTypes.get(code);
    if (!relationTypeId) throw new Error(`找不到关系类型 ${code}`);
    return relationTypeId;
  }

  private async loadObjectTypeMap(): Promise<ReadonlyMap<string, ObjectType>> {
    if (this.objectTypesByCode) return this.objectTypesByCode;
    const objectTypes = await this.viewClient.objectTypes(this.workspaceId);
    this.objectTypesByCode = new Map(
      objectTypes.map((type) => [type.code, type]),
    );
    return this.objectTypesByCode;
  }

  private async loadRelationTypeIdMap(): Promise<ReadonlyMap<string, string>> {
    if (this.relationTypeIdsByCode) return this.relationTypeIdsByCode;
    const relationTypes = await this.viewClient.relationTypes(this.workspaceId);
    this.relationTypeIdsByCode = new Map(
      relationTypes.map((type) => [type.code, type.id]),
    );
    return this.relationTypeIdsByCode;
  }

  private async loadObjectById(objectId: string): Promise<DataObject> {
    const detail = await this.viewClient.object(this.workspaceId, objectId);
    const type = await this.requireObjectType(detail.object.objectType);
    return mapViewObject(detail.object, mapObjectType(type));
  }

  private async claimObject(
    objectTypeCode: string,
    fields: Record<FieldCode, DataFieldPrimitive>,
  ): Promise<DataObject> {
    const type = await this.requireObjectType(objectTypeCode);
    const expectedKey = objectBusinessKey(objectStub(objectTypeCode, fields));
    if (!expectedKey) throw new Error("无法按业务键认领新对象");
    for (let attempt = 0; attempt < CLAIM_READ_ATTEMPTS; attempt += 1) {
      const objects = await this.loadObjectsForTypes([type]);
      const object = objects.find(
        (candidate) => objectBusinessKey(candidate) === expectedKey,
      );
      if (object) return object;
      if (attempt + 1 < CLAIM_READ_ATTEMPTS) await nextReadModelTurn();
    }
    throw new Error("内核对象创建成功,但读模型尚未认领到新对象");
  }

  private async claimRelation(params: {
    readonly relationTypeCode: string;
    readonly sourceId: string;
    readonly targetId: string;
  }): Promise<DataRelation> {
    for (let attempt = 0; attempt < CLAIM_READ_ATTEMPTS; attempt += 1) {
      const details = await Promise.all([
        this.viewClient.object(this.workspaceId, params.sourceId),
        this.viewClient.object(this.workspaceId, params.targetId),
      ]);
      const relation = details
        .flatMap((detail) => detail.relations)
        .find(
          (candidate) =>
            candidate.relationType === params.relationTypeCode &&
            candidate.sourceId === params.sourceId &&
            candidate.targetId === params.targetId,
        );
      if (relation) return mapRelationSummary(relation);
      if (attempt + 1 < CLAIM_READ_ATTEMPTS) await nextReadModelTurn();
    }
    throw new Error("内核关系创建成功,但读模型尚未认领到新关系");
  }

  private async loadKernelGraph(): Promise<KernelGraph> {
    const objectTypeDtos = await this.viewClient.objectTypes(this.workspaceId);
    this.objectTypesByCode = new Map(
      objectTypeDtos.map((type) => [type.code, type]),
    );
    const objectTypes = objectTypeDtos.map(mapObjectType);
    const objects = await this.loadObjectsForTypes(objectTypeDtos);
    const relationLoad = await this.loadRelationsForObjects(objects);
    const relations = relationLoad.relations;
    const relationTypeDtos = await this.viewClient.relationTypes(
      this.workspaceId,
    );
    this.relationTypeIdsByCode = new Map(
      relationTypeDtos.map((type) => [type.code, type.id]),
    );
    const relationTypes = mapRelationTypes(
      relationTypeDtos,
      relations,
      objects,
    );
    return {
      objectTypes,
      objects,
      relationTypes,
      relations,
      relationLoadFailures: relationLoad.failedObjectIds.length,
    };
  }

  private async loadObjectsForTypes(
    objectTypes: readonly ObjectType[],
  ): Promise<readonly DataObject[]> {
    const objectsByType = await mapWithConcurrency(
      objectTypes,
      OBJECT_TYPE_LOAD_CONCURRENCY,
      (objectType) => this.loadObjectsForType(objectType),
    );
    return objectsByType.flat();
  }

  private async loadObjectsForType(
    objectType: ObjectType,
  ): Promise<readonly DataObject[]> {
    const objects: DataObject[] = [];
    let page = 0;
    while (true) {
      const result = await this.viewClient.objects(
        this.workspaceId,
        objectType.code,
        page,
        PAGE_SIZE,
      );
      objects.push(
        ...result.items.map((item) =>
          mapViewObject(item, mapObjectType(objectType)),
        ),
      );
      if (result.items.length === 0 || objectsOfTypeLoaded(result, page))
        return objects;
      page += 1;
    }
  }

  private async loadRelationsForObjects(
    objects: readonly DataObject[],
  ): Promise<RelationLoadResult> {
    const relations = new Map<string, DataRelation>();
    const failedObjectIds: string[] = [];
    const details = await mapWithConcurrency(
      objects,
      RELATION_LOAD_CONCURRENCY,
      async (object) => {
        try {
          return await this.viewClient.object(this.workspaceId, object.id);
        } catch {
          failedObjectIds.push(object.id);
          return null;
        }
      },
    );
    for (const detail of details) {
      if (!detail) continue;
      for (const relation of detail.relations) {
        relations.set(relation.relationId, mapRelationSummary(relation));
      }
    }
    return { relations: [...relations.values()], failedObjectIds };
  }

  async loadObjectHistory(objectId: string): Promise<readonly ChangeEvent[]> {
    const page = await this.viewClient.objectHistory(
      this.workspaceId,
      objectId,
      0,
      30,
    );
    return page.items
      .map((item) => mapHistoryEntry(item, objectId))
      .sort((a, b) => b.at.localeCompare(a.at));
  }
}

function kernelPresentationSeed(
  preset: PresentationPreset,
  workspaceId: string,
  workspace: WorkspaceSummary,
): DemoSeed {
  const base = cloneDemoSeed();
  return {
    ...base,
    workspace: {
      ...base.workspace,
      id: workspaceId,
      name: workspace.name,
      updatedAt: workspace.updatedAt,
    },
    objectTypes: [],
    objects: [],
    relationTypes: [],
    relations: [],
    comments: [],
    permissions:
      preset.code === "hardware_products"
        ? base.permissions
        : { wangyun: {}, lixiao: {}, chenmo: {}, zhouran: {}, ai: {} },
    sceneTemplates: [],
    expressions: preset.expressions,
    views: preset.views,
    docModels: preset.docModels,
    fieldRefs: preset.fieldRefs,
    kpis: preset.kpis,
    biBars: preset.biBars,
    anaReports: preset.anaReports,
    rawImport: { text: "", spans: [], semanticChips: [], recent: [] },
    chatMessages: [],
    reviewRecords: [],
    slotBindings: preset.slotBindings,
    changeSets: [],
    changeEvents: [],
    activity: [],
    outputSnapshots: [],
    plugins: [],
    simScenarios: [],
  };
}

function objectsOfTypeLoaded(
  page: { readonly items: readonly ViewObject[]; readonly total: number },
  pageIndex: number,
): boolean {
  return (pageIndex + 1) * PAGE_SIZE >= page.total;
}

function nextReadModelTurn(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, CLAIM_READ_DELAY_MS);
  });
}

function mapRelationSummary(relation: RelationSummary): DataRelation {
  return {
    id: relation.relationId,
    relationTypeCode: relation.relationType,
    sourceId: relation.sourceId,
    targetId: relation.targetId,
    status: "active",
    fields: {},
    version: relation.version,
    annotationIds: [],
  };
}

function mapRelationTypes(
  relationTypes: readonly {
    readonly code: string;
    readonly name: string;
    readonly hierarchical?: boolean;
  }[],
  relations: readonly DataRelation[],
  objects: readonly DataObject[],
): readonly RelationType[] {
  const objectsById = byId(objects);
  return relationTypes.map((type) => {
    const sample = relations.find(
      (relation) => relation.relationTypeCode === type.code,
    );
    return {
      code: type.code,
      name: type.name,
      sourceTypeCode: sample
        ? (objectsById.get(sample.sourceId)?.objectTypeCode ?? "")
        : "",
      targetTypeCode: sample
        ? (objectsById.get(sample.targetId)?.objectTypeCode ?? "")
        : "",
      hierarchical: type.hierarchical,
    };
  });
}

function rawFields(object: DataObject): Record<string, DataFieldPrimitive> {
  return Object.fromEntries(
    Object.entries(object.fields).map(([code, field]) => [code, field.value]),
  );
}

function objectStub(
  objectTypeCode: string,
  fields: Record<FieldCode, DataFieldPrimitive>,
): DataObject {
  return {
    id: "kernel-claim-object",
    objectTypeCode,
    status: "active",
    version: 1,
    fields: Object.fromEntries(
      Object.entries(fields).map(([code, value]) => [code, fieldValue(value)]),
    ),
    createdBy: "wangyun",
    createdAt: "2026-07-10T10:24:00+08:00",
    updatedBy: "wangyun",
    updatedAt: "2026-07-10T10:24:00+08:00",
  };
}

function fieldValue(value: DataFieldPrimitive): DataFieldValue {
  return {
    value,
    fieldVersion: 1,
    updatedBy: "wangyun",
    updatedAt: "2026-07-10T10:24:00+08:00",
    source: "manual",
  };
}

function kernelWriteEvent(
  entityType: ChangeEvent["target"]["entityType"],
  entityId: string,
  fieldCode: FieldCode | undefined,
  actor: MemberId,
): ChangeEvent {
  return {
    id: `kernel-write-${entityId}`,
    track: "data",
    actor,
    target:
      entityType === "field" && fieldCode
        ? { entityType, entityId, fieldCode }
        : { entityType, entityId },
    syncedRefs: 0,
    at: "2026-07-10T10:24:00+08:00",
    inverse: null,
  };
}

function kernelAiFallback(
  setId: string,
  status: ChangeSet["status"],
): ChangeSet {
  return {
    id: setId,
    source: "ai",
    status,
    title: `内核 AI 变更集 ${shortId(setId)}`,
    actor: "ai",
    createdAt: "2026-07-10T10:24:00+08:00",
    items: [],
  };
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  map: (item: T) => Promise<R>,
): Promise<readonly R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await map(items[index]!);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function shortId(value: string): string {
  return value.length > 8 ? value.slice(0, 8) : value;
}

function byId<T extends { readonly id: string }>(
  items: readonly T[],
): ReadonlyMap<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function isString(value: string | null): value is string {
  return value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function tus016(): Error {
  return new Error("T-US-016: KernelGateway write path is not connected yet");
}

function mutableSeedReport(): {
  createdObjects: number;
  skippedObjects: number;
  createdRelations: number;
  skippedRelations: number;
  missingTypes: Set<string>;
  failed: string[];
} {
  return {
    createdObjects: 0,
    skippedObjects: 0,
    createdRelations: 0,
    skippedRelations: 0,
    missingTypes: new Set(),
    failed: [],
  };
}

function freezeSeedReport(
  report: ReturnType<typeof mutableSeedReport>,
): KernelSeedReport {
  return {
    createdObjects: report.createdObjects,
    skippedObjects: report.skippedObjects,
    createdRelations: report.createdRelations,
    skippedRelations: report.skippedRelations,
    missingTypes: [...report.missingTypes].sort(),
    failed: report.failed,
  };
}

function disabledSeedReport(templateCode: string | null): KernelSeedReport {
  return {
    createdObjects: 0,
    skippedObjects: 0,
    createdRelations: 0,
    skippedRelations: 0,
    missingTypes: [],
    failed: [`门锁演示 Seeder 不适用于 ${templateCode ?? "unknown"} Profile`],
  };
}
