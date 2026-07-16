import type {
  DataFieldPrimitive,
  DataObject,
  FieldDef,
  ObjectTypeDef,
  RelationType,
} from "../model/kernel";
import { sessionStore, type SessionStore } from "../state/session-store";
import { workspaceStore, type WorkspaceStore } from "../state/workspace-store";

export type CreateRecordDraft = Readonly<Record<string, string | boolean>>;

export function initialRecordDraft(
  objectType: ObjectTypeDef,
  object?: DataObject,
): CreateRecordDraft {
  return Object.fromEntries(
    creatableFields(objectType).map((field) => {
      const value = object?.fields[field.code]?.value;
      if (field.dataType === "boolean") return [field.code, value === true];
      return [
        field.code,
        value === null || value === undefined ? "" : String(value),
      ];
    }),
  );
}

export interface CreateRecordValidation {
  readonly fields: Record<string, DataFieldPrimitive>;
  readonly errors: Readonly<Record<string, string>>;
}

export type CreateRecordResult =
  | { readonly state: "created"; readonly objectId: string }
  | {
      readonly state: "invalid";
      readonly errors: Readonly<Record<string, string>>;
    }
  | { readonly state: "permission-denied"; readonly message: string }
  | { readonly state: "failed"; readonly message: string };

export type UpdateRecordResult =
  | {
      readonly state: "updated";
      readonly changed: number;
      readonly queued: number;
    }
  | {
      readonly state: "invalid";
      readonly errors: Readonly<Record<string, string>>;
    }
  | { readonly state: "failed"; readonly message: string };

export function creatableFields(
  objectType: ObjectTypeDef,
): readonly FieldDef[] {
  return objectType.fields.filter(
    (field) => !field.computed && !field.readOnly,
  );
}

export function createRecordAvailability(
  objectType: ObjectTypeDef,
  relationTypes: readonly RelationType[],
): { readonly available: boolean; readonly reason: string | null } {
  const isHierarchicalChild = relationTypes.some(
    (relation) =>
      relation.hierarchical === true &&
      relation.targetTypeCode === objectType.code,
  );
  return isHierarchicalChild
    ? {
        available: false,
        reason: "该记录需在其所属对象中创建，以保证关系完整。",
      }
    : { available: true, reason: null };
}

export function initialCreateRecordDraft(
  objectType: ObjectTypeDef,
): CreateRecordDraft {
  return initialRecordDraft(objectType);
}

export function updateRecord(input: {
  readonly objectType: ObjectTypeDef;
  readonly object: DataObject;
  readonly draft: CreateRecordDraft;
  readonly session?: SessionStore;
}): UpdateRecordResult {
  const session = input.session ?? sessionStore;
  const validation = validateCreateRecord(input.objectType, input.draft);
  if (Object.keys(validation.errors).length > 0) {
    return { state: "invalid", errors: validation.errors };
  }

  let changed = 0;
  let queued = 0;
  try {
    for (const field of creatableFields(input.objectType)) {
      const previous = input.object.fields[field.code]?.value ?? null;
      const next = validation.fields[field.code] ?? null;
      if (Object.is(previous, next)) continue;
      const result = session.requestWrite({
        resourceCode: input.objectType.code,
        objectId: input.object.id,
        fieldCode: field.code,
        value: next,
      });
      changed += 1;
      if (result.queued) queued += 1;
    }
  } catch {
    return { state: "failed", message: "记录更新失败，请重试。" };
  }
  return { state: "updated", changed, queued };
}

export function validateCreateRecord(
  objectType: ObjectTypeDef,
  draft: CreateRecordDraft,
): CreateRecordValidation {
  const fields: Record<string, DataFieldPrimitive> = {};
  const errors: Record<string, string> = {};
  for (const field of creatableFields(objectType)) {
    const value = draft[field.code] ?? "";
    const parsed = parseCreateValue(field, value);
    if (parsed.error) {
      errors[field.code] = parsed.error;
      continue;
    }
    if (parsed.value === null) {
      if (field.required) errors[field.code] = `${field.name}为必填项`;
      continue;
    }
    fields[field.code] = parsed.value;
  }
  return { fields, errors };
}

export async function createRecord(input: {
  readonly objectType: ObjectTypeDef;
  readonly relationTypes: readonly RelationType[];
  readonly draft: CreateRecordDraft;
  readonly workspace?: WorkspaceStore;
  readonly session?: SessionStore;
}): Promise<CreateRecordResult> {
  const workspace = input.workspace ?? workspaceStore;
  const session = input.session ?? sessionStore;
  const availability = createRecordAvailability(
    input.objectType,
    input.relationTypes,
  );
  if (!availability.available) {
    return {
      state: "failed",
      message: availability.reason ?? "当前类型不可创建",
    };
  }
  const validation = validateCreateRecord(input.objectType, input.draft);
  if (Object.keys(validation.errors).length > 0) {
    return { state: "invalid", errors: validation.errors };
  }
  const actor = session.getSnapshot().currentMemberId;
  if (!session.can(actor, input.objectType.code, "editData")) {
    return { state: "permission-denied", message: "当前成员没有新建记录权限" };
  }
  const local = workspace.createObject({
    objectTypeCode: input.objectType.code,
    fields: validation.fields,
    actor,
    summary: `创建${input.objectType.name}`,
  });
  const completion = await workspace.waitForLastWrite();
  if (completion.state === "failed") {
    return { state: "failed", message: completion.message };
  }
  return {
    state: "created",
    objectId:
      completion.state === "synced"
        ? (completion.objectId ?? local.id)
        : local.id,
  };
}

function parseCreateValue(
  field: FieldDef,
  rawValue: string | boolean,
): { readonly value: DataFieldPrimitive; readonly error?: string } {
  if (field.dataType === "boolean") return { value: Boolean(rawValue) };
  const text = String(rawValue).trim();
  if (text === "") return { value: null };
  if (field.dataType === "number") {
    const value = Number(text);
    return Number.isFinite(value)
      ? { value }
      : { value: null, error: `${field.name}必须是有效数字` };
  }
  if (field.dataType === "enum") {
    if (!field.enumValues || field.enumValues.length === 0) {
      return { value: null, error: `${field.name}配置不可用` };
    }
    return field.enumValues.includes(text)
      ? { value: text }
      : { value: null, error: `${field.name}不是合法选项` };
  }
  return { value: text };
}
