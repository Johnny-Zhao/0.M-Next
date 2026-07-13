import type {
  AiChangeItem,
  AiChangeSet,
  CheckResultItem,
  CommandError,
  ObjectHistoryEntry,
  ObjectType,
  OutputDetail,
  OutputMeta,
  ReviewAnnotation,
  SnapshotMeta,
  ViewObject,
} from "@m-next/views";

import type {
  ChangeItem,
  ChangeSet,
  DataFieldPrimitive,
  DataFieldValue,
  DataObject,
  DataObjectStatus,
  DataSource,
  FieldCode,
  FieldDataType,
  FieldDef,
  MemberId,
  ObjectTypeDef,
  SelectionRef,
} from "../model/kernel";
import type { ChangeEvent } from "../model/view-layer";
import type { RuleOutcome } from "../validation/rules";
import type {
  OutputArtifact,
  OutputArtifactMeta,
  SnapshotArtifact,
  Annotation,
  WriteRejection,
} from "./gateway";

type ObjectTypeWithKernelId = ObjectTypeDef & { readonly kernelId: string };

const MEMBER_IDS: readonly MemberId[] = [
  "wangyun",
  "lixiao",
  "chenmo",
  "zhouran",
  "ai",
];

const OBJECT_STATUSES: readonly DataObjectStatus[] = [
  "draft",
  "active",
  "presale",
  "dev",
  "sale",
  "eol",
];

const DEFAULT_RULE_GROUP: RuleOutcome["group"] = "字段约束";

export function mapViewObject(
  dto: ViewObject,
  type: ObjectTypeDef,
): DataObject {
  const source = mapDataSource(dto.source);
  const updatedBy = mapActor(dto.source);
  // G8: ViewObject exposes object-level audit only, so every field inherits it.
  const fields = Object.fromEntries(
    Object.entries(dto.fields).map(([fieldCode, value]) => [
      fieldCode,
      mapFieldValue(value, dto.version, updatedBy, dto.updatedAt, source),
    ]),
  );
  return {
    id: dto.objectId,
    objectTypeCode: type.code,
    status: mapObjectStatus(dto.status),
    version: dto.version,
    fields,
    createdBy: updatedBy,
    createdAt: dto.updatedAt,
    updatedBy,
    updatedAt: dto.updatedAt,
  };
}

export function mapObjectType(dto: ObjectType): ObjectTypeWithKernelId {
  return {
    kernelId: dto.id,
    code: dto.code,
    name: dto.name,
    group: "kernel",
    fields: dto.fields.map(mapFieldDefinition),
  };
}

export function mapHistoryEntry(
  dto: ObjectHistoryEntry,
  objectIdHint?: string,
): ChangeEvent {
  const actor = mapActor(dto.actorId ?? dto.actorDisplay ?? dto.source);
  const entityId = historyEntityId(dto, objectIdHint);
  const target = historyTarget(dto, entityId);
  const oldValue = toOptionalPrimitive(dto.before);
  const nextValue = toOptionalPrimitive(dto.after);
  return {
    id: dto.eventId,
    track: "data",
    actor,
    viaAi: dto.source.toLowerCase() === "ai" || actor === "ai",
    target,
    ...(oldValue !== undefined ? { old: oldValue } : {}),
    ...(nextValue !== undefined ? { next: nextValue } : {}),
    syncedRefs: 0,
    at: dto.occurredAt,
    inverse:
      dto.kind === "edit" && dto.fieldCode
        ? {
            objectId: entityId,
            fieldCode: dto.fieldCode,
            value: oldValue ?? null,
          }
        : null,
  };
}

export function mapCheckResult(dto: CheckResultItem): RuleOutcome {
  const target: SelectionRef = dto.fieldCode
    ? {
        entityType: "field",
        entityId: dto.objectId,
        fieldCode: dto.fieldCode,
      }
    : { entityType: "object", entityId: dto.objectId };
  return {
    ruleCode: dto.ruleCode,
    group: DEFAULT_RULE_GROUP,
    level: mapSeverity(dto.severity),
    title: dto.ruleCode,
    detail: dto.message,
    target,
    impact: [],
    fixes: [],
  };
}

export function mapAiChangeSet(dto: AiChangeSet): ChangeSet {
  return {
    id: dto.setId,
    source: "ai",
    status: mapAiChangeSetStatus(dto.status),
    title: dto.action || `内核 AI 变更集 ${shortId(dto.setId)}`,
    actor: "ai",
    createdAt: dto.createdAt,
    items: dto.items.map(mapAiChangeItem),
  };
}

export function mapSnapshotMeta(dto: SnapshotMeta): SnapshotArtifact {
  return {
    snapshotId: dto.snapshotId,
    createdBy: dto.createdBy,
    createdAt: dto.createdAt,
    dataVersion: dto.dataVersion,
    contentHash: dto.contentHash,
    scopeObjectType: dto.scopeObjectType,
  };
}

export function mapOutputMeta(dto: OutputMeta): OutputArtifactMeta {
  return {
    outputId: dto.outputId,
    snapshotId: dto.dataSnapshotId,
    format: dto.format,
    createdBy: dto.createdBy,
    createdAt: dto.createdAt,
    contentHash: dto.contentHash,
  };
}

export function mapOutputDetail(dto: OutputDetail): OutputArtifact {
  return {
    ...mapOutputMeta(dto.meta),
    artifact: dto.artifact,
  };
}

export function mapAnnotation(dto: ReviewAnnotation): Annotation {
  return {
    id: dto.id,
    anchor:
      dto.targetType === "field"
        ? {
            entityType: "field",
            entityId: dto.targetId,
            fieldCode: dto.fieldCode ?? undefined,
          }
        : { entityType: dto.targetType, entityId: dto.targetId },
    body: dto.body,
    author: mapActor(dto.createdBy),
    at: dto.createdAt,
    resolved: dto.status === "resolved",
    severity: mapAnnotationSeverity(dto.severity),
    anchoredDataVersion: dto.anchoredDataVersion,
    resolvedBy: dto.resolvedBy ? mapActor(dto.resolvedBy) : null,
    resolvedAt: dto.resolvedAt,
  };
}

export function mapCommandError(error: CommandError): WriteRejection {
  return {
    code: error.code,
    title: error.title,
    currentVersion: error.details?.currentVersion,
    conflictingFields: (error.details?.conflictingFields ?? []).map(
      (field) => ({
        fieldCode: field.fieldDefCode,
        currentValue: field.currentValue,
        changedBy: field.changedBy,
        changedAt: field.changedAt,
      }),
    ),
  };
}

function mapAiChangeItem(item: AiChangeItem): ChangeItem {
  const payload = item.payload;
  const entityId =
    readString(payload, "objectId") ??
    readString(payload, "targetId") ??
    readString(payload, "relationId") ??
    readString(payload, "id") ??
    item.itemId;
  const fieldCode =
    readString(payload, "fieldCode") ?? readString(payload, "fieldDefCode");
  const op = mapAiOp(item.opType);
  return {
    id: item.itemId,
    op,
    target: fieldCode
      ? { entityType: "field", entityId, fieldCode }
      : {
          entityType: op === "createRelation" ? "relation" : "object",
          entityId,
        },
    objectTypeCode: readString(payload, "objectTypeCode"),
    fields: readPrimitiveRecord(payload.fields),
    oldValue: toOptionalPrimitive(payload.oldValue ?? payload.before),
    nextValue: toOptionalPrimitive(
      payload.nextValue ?? payload.value ?? payload.after,
    ),
    confirmed: item.itemStatus === "APPLIED" || item.itemStatus === "SKIPPED",
    applied: item.itemStatus === "APPLIED",
    note: `${item.opType} · ${item.itemStatus}`,
  };
}

function mapAiChangeSetStatus(
  status: AiChangeSet["status"],
): ChangeSet["status"] {
  if (status === "CONFIRMED") return "resolved";
  if (status === "REJECTED") return "rejected";
  return "pending";
}

function mapAiOp(opType: string): ChangeItem["op"] {
  const normalized = opType.toUpperCase();
  if (normalized.includes("CREATE_RELATION")) return "createRelation";
  if (normalized.includes("CREATE_OBJECT")) return "createObject";
  return "updateField";
}

function readString(
  record: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readPrimitiveRecord(
  value: unknown,
): Record<FieldCode, DataFieldPrimitive> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => [
      key,
      toDataFieldPrimitive(fieldValue),
    ]),
  );
}

function shortId(value: string): string {
  return value.length > 8 ? value.slice(0, 8) : value;
}

function mapFieldDefinition(field: ObjectType["fields"][number]): FieldDef {
  return {
    code: field.code,
    name: field.name,
    dataType: mapFieldDataType(field.dataType),
    enumValues: readStringArray(field.constraints.enumValues),
    unit:
      typeof field.constraints.unit === "string"
        ? field.constraints.unit
        : undefined,
  };
}

function mapFieldDataType(value: string): FieldDataType {
  const normalized = value.toLowerCase();
  if (
    normalized === "number" ||
    normalized === "integer" ||
    normalized === "decimal"
  ) {
    return "number";
  }
  if (normalized === "enum" || normalized === "select") return "enum";
  if (normalized === "date" || normalized === "datetime") return "date";
  if (normalized === "person" || normalized === "user") return "person";
  if (
    normalized === "doclink" ||
    normalized === "doc_link" ||
    normalized === "document"
  ) {
    return "docLink";
  }
  // Unknown kernel value types stay readable until the adapter gains a registry.
  return "text";
}

function mapFieldValue(
  value: unknown,
  version: number,
  updatedBy: MemberId,
  updatedAt: string,
  source: DataSource,
): DataFieldValue {
  return {
    value: toDataFieldPrimitive(value),
    fieldVersion: version,
    updatedBy,
    updatedAt,
    source,
  };
}

function mapObjectStatus(value: string): DataObjectStatus {
  const normalized = value.toLowerCase();
  return isObjectStatus(normalized) ? normalized : "active";
}

function mapDataSource(value: string | null): DataSource {
  return value?.toLowerCase() === "ai" ? "ai" : "manual";
}

function mapActor(value: unknown): MemberId {
  if (isMemberId(value)) return value;
  // actorDisplay is lossy in history DTOs; prefer known ids, then readable names.
  const text = typeof value === "string" ? value.toLowerCase() : "";
  if (text.includes("ai")) return "ai";
  if (text.includes("li")) return "lixiao";
  if (text.includes("chen")) return "chenmo";
  if (text.includes("zhou")) return "zhouran";
  return "wangyun";
}

function historyTarget(
  dto: ObjectHistoryEntry,
  entityId: string,
): SelectionRef {
  if (dto.kind === "link" || dto.kind === "unlink") {
    return { entityType: "relation", entityId };
  }
  if (dto.kind === "edit" && dto.fieldCode) {
    return { entityType: "field", entityId, fieldCode: dto.fieldCode };
  }
  return { entityType: "object", entityId };
}

function historyEntityId(
  dto: ObjectHistoryEntry,
  objectIdHint?: string,
): string {
  return (
    extractEntityId(dto.after) ??
    extractEntityId(dto.before) ??
    objectIdHint ??
    dto.correlationId ??
    dto.eventId
  );
}

function extractEntityId(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Readonly<Record<string, unknown>>;
  for (const key of ["relationId", "objectId", "entityId", "id"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return undefined;
}

function toOptionalPrimitive(value: unknown): DataFieldPrimitive | undefined {
  if (value === undefined) return undefined;
  return toDataFieldPrimitive(value);
}

function toDataFieldPrimitive(value: unknown): DataFieldPrimitive {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value === undefined) return null;
  return JSON.stringify(value);
}

function mapSeverity(value: string): RuleOutcome["level"] {
  const normalized = value.toUpperCase();
  if (normalized === "BLOCK") return "error";
  if (normalized === "OK") return "passed";
  return "warning";
}

function mapAnnotationSeverity(value: string): Annotation["severity"] {
  const normalized = value.toLowerCase();
  if (normalized === "block") return "block";
  if (
    normalized === "warn" ||
    normalized === "issue" ||
    normalized === "suggest"
  )
    return "warn";
  return "info";
}

function readStringArray(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

function isMemberId(value: unknown): value is MemberId {
  return typeof value === "string" && MEMBER_IDS.includes(value as MemberId);
}

function isObjectStatus(value: string): value is DataObjectStatus {
  return OBJECT_STATUSES.includes(value as DataObjectStatus);
}
