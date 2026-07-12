import {
  CommandFailure,
  CommandClient,
  ViewClient,
  type FetchFn,
  type ObjectType,
  type RelationSummary,
  type ViewObject,
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
  ActivityItem,
  ChangeEvent,
  FieldRef,
  KpiCardDef,
  PluginDef,
  SlotBinding,
} from "../model/view-layer";
import { cloneDemoSeed, type DemoSeed } from "../seed/demo-seed";
import type { ChangeSetResult } from "../state/changeset-store";
import type {
  FieldWriteMeta,
  FieldWriteResult,
  RelationWriteResult,
  ViewConfigWriteResult,
} from "../state/workspace-store";
import type { RuleOutcome } from "../validation/rules";
import {
  mapCommandError,
  mapHistoryEntry,
  mapObjectType,
  mapViewObject,
} from "./dto-mappers";
import type { UnisourceGateway } from "./gateway";
import {
  objectBusinessKey,
  relationBusinessKey,
  remapSeedPresentation,
  type IdentityRemapReport,
} from "./identity-remap";

const PAGE_SIZE = 100;

export interface KernelGatewayLoadReport extends IdentityRemapReport {
  readonly objectCount: number;
  readonly relationCount: number;
  readonly historyCount: number;
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
  readonly changeEvents: readonly ChangeEvent[];
}

export class KernelGateway implements UnisourceGateway {
  private readonly viewClient: ViewClient;
  private readonly commandClient: CommandClient;
  private lastLoadReport: KernelGatewayLoadReport | null = null;
  private objectTypesByCode: ReadonlyMap<string, ObjectType> | null = null;
  private relationTypeIdsByCode: ReadonlyMap<string, string> | null = null;

  constructor(
    baseUrl: string,
    private readonly workspaceId: string,
    actorId: string,
    fetchFn?: FetchFn,
  ) {
    this.viewClient = new ViewClient(baseUrl, fetchFn);
    this.commandClient = new CommandClient(baseUrl, fetchFn);
    this.commandClient.setActorId(actorId);
  }

  setActor(actorId: MemberId): void {
    this.commandClient.setActorId(actorId);
  }

  getLastLoadReport(): KernelGatewayLoadReport | null {
    return this.lastLoadReport;
  }

  async loadWorkspace(): Promise<DemoSeed> {
    const graph = await this.loadKernelGraph();
    const remapped = remapSeedPresentation({
      seed: cloneDemoSeed(),
      kernelObjects: graph.objects,
      kernelRelations: graph.relations,
    });
    this.lastLoadReport = {
      ...remapped.report,
      objectCount: graph.objects.length,
      relationCount: graph.relations.length,
      historyCount: graph.changeEvents.length,
    };
    return {
      ...remapped.seed,
      workspace: {
        ...remapped.seed.workspace,
        id: this.workspaceId,
        updatedAt:
          latestChangeAt(graph.changeEvents) ??
          remapped.seed.workspace.updatedAt,
      },
      objectTypes: graph.objectTypes,
      objects: graph.objects,
      relationTypes: graph.relationTypes,
      relations: graph.relations,
      changeEvents: graph.changeEvents,
      activity: graph.changeEvents.map(historyActivity),
    };
  }

  async seedDemoData(
    seed: DemoSeed = cloneDemoSeed(),
  ): Promise<KernelSeedReport> {
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

    for (const object of seed.objects) {
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
    const currentRelations = await this.loadRelationsForObjects(currentObjects);
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

    for (const relation of seed.relations) {
      const relationTypeId = relationTypeIds.get(relation.relationTypeCode);
      const sourceSeed = seed.objects.find(
        (object) => object.id === relation.sourceId,
      );
      const targetSeed = seed.objects.find(
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

  async runRuleCheck(): Promise<string> {
    throw tus016();
  }

  async checkResults(
    ...args: Parameters<UnisourceGateway["checkResults"]>
  ): Promise<readonly RuleOutcome[]> {
    this.rejectWrite(...args);
  }

  async proposeAiChange(
    ...args: Parameters<UnisourceGateway["proposeAiChange"]>
  ): Promise<ChangeSet> {
    this.rejectWrite(...args);
  }

  async confirmAiChange(
    ...args: Parameters<UnisourceGateway["confirmAiChange"]>
  ): Promise<ChangeSetResult> {
    this.rejectWrite(...args);
  }

  async rejectAiChange(
    ...args: Parameters<UnisourceGateway["rejectAiChange"]>
  ): Promise<ChangeSetResult> {
    this.rejectWrite(...args);
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
    const objects = await this.loadObjectsForTypes([type]);
    const object = objects.find(
      (candidate) => objectBusinessKey(candidate) === expectedKey,
    );
    if (!object) throw new Error("内核对象创建成功,但读模型尚未认领到新对象");
    return object;
  }

  private async claimRelation(params: {
    readonly relationTypeCode: string;
    readonly sourceId: string;
    readonly targetId: string;
  }): Promise<DataRelation> {
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
    if (!relation) throw new Error("内核关系创建成功,但读模型尚未认领到新关系");
    return mapRelationSummary(relation);
  }

  private async loadKernelGraph(): Promise<KernelGraph> {
    const objectTypeDtos = await this.viewClient.objectTypes(this.workspaceId);
    this.objectTypesByCode = new Map(
      objectTypeDtos.map((type) => [type.code, type]),
    );
    const objectTypes = objectTypeDtos.map(mapObjectType);
    const objects = await this.loadObjectsForTypes(objectTypeDtos);
    const relations = await this.loadRelationsForObjects(objects);
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
    const changeEvents = await this.loadHistoryForObjects(objects);
    return { objectTypes, objects, relationTypes, relations, changeEvents };
  }

  private async loadObjectsForTypes(
    objectTypes: readonly ObjectType[],
  ): Promise<readonly DataObject[]> {
    const objects: DataObject[] = [];
    for (const objectType of objectTypes) {
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
          break;
        page += 1;
      }
    }
    return objects;
  }

  private async loadRelationsForObjects(
    objects: readonly DataObject[],
  ): Promise<readonly DataRelation[]> {
    const relations = new Map<string, DataRelation>();
    for (const object of objects) {
      const detail = await this.viewClient.object(this.workspaceId, object.id);
      for (const relation of detail.relations) {
        relations.set(relation.relationId, mapRelationSummary(relation));
      }
    }
    return [...relations.values()];
  }

  private async loadHistoryForObjects(
    objects: readonly DataObject[],
  ): Promise<readonly ChangeEvent[]> {
    const events: ChangeEvent[] = [];
    for (const object of objects) {
      const page = await this.viewClient.objectHistory(
        this.workspaceId,
        object.id,
        0,
        30,
      );
      events.push(
        ...page.items.map((item) => mapHistoryEntry(item, object.id)),
      );
    }
    return events.sort((a, b) => b.at.localeCompare(a.at));
  }
}

function objectsOfTypeLoaded(
  page: { readonly items: readonly ViewObject[]; readonly total: number },
  pageIndex: number,
): boolean {
  return (pageIndex + 1) * PAGE_SIZE >= page.total;
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
  relationTypes: readonly { readonly code: string; readonly name: string }[],
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

function historyActivity(event: ChangeEvent): ActivityItem {
  return {
    id: `activity-${event.id}`,
    actor: event.actor,
    summary: `${event.target.entityType} ${event.target.entityId}`,
    tracks: [event.track],
    at: event.at,
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

function latestChangeAt(events: readonly ChangeEvent[]): string | null {
  return events[0]?.at ?? null;
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
