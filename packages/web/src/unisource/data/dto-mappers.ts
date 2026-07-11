import type {
  CheckResultItem,
  ObjectHistoryEntry,
  ObjectType,
  ViewObject,
} from "@m-next/views";

import type {
  DataFieldPrimitive,
  DataFieldValue,
  DataObject,
  DataObjectStatus,
  DataSource,
  FieldDataType,
  FieldDef,
  MemberId,
  ObjectTypeDef,
  SelectionRef,
} from "../model/kernel";
import type { ChangeEvent } from "../model/view-layer";
import type { RuleOutcome } from "../validation/rules";

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

export function mapHistoryEntry(dto: ObjectHistoryEntry): ChangeEvent {
  const actor = mapActor(dto.actorId ?? dto.actorDisplay ?? dto.source);
  const entityId = historyEntityId(dto);
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

function historyEntityId(dto: ObjectHistoryEntry): string {
  return (
    extractEntityId(dto.after) ??
    extractEntityId(dto.before) ??
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
