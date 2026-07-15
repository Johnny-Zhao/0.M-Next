import type {
  DataFieldPrimitive,
  DataObject,
  FieldDef,
  ObjectTypeDef,
} from "../model/kernel";
import type { DocModel } from "../model/view-layer";
import type { WorkspaceState } from "../state/workspace-store";
import { formatCellValue } from "../grid/grid-view-model";

export interface StructuredDocumentPartConfig {
  readonly objectTypeCode: string;
  readonly fields: readonly string[];
  readonly editableFields: readonly string[];
}

export interface StructuredDocumentSectionConfig
  extends StructuredDocumentPartConfig {
  readonly relationTypeCode: string;
  readonly title: string;
  readonly createAction?: string;
}

export interface StructuredDocumentConfig {
  readonly root: StructuredDocumentPartConfig;
  readonly sections: readonly StructuredDocumentSectionConfig[];
}

export type StructuredDocumentConfigResult =
  | { readonly state: "absent" }
  | { readonly state: "invalid"; readonly message: string }
  | { readonly state: "ready"; readonly config: StructuredDocumentConfig };

export interface StructuredDocumentFieldVm {
  readonly objectId: string;
  readonly objectTypeCode: string;
  readonly objectVersion: number;
  readonly fieldCode: string;
  readonly fieldName: string;
  readonly field: FieldDef | null;
  readonly value: DataFieldPrimitive;
  readonly valueText: string;
  readonly state: "fresh" | "dangling";
  readonly editable: boolean;
  readonly editMessage: string | null;
}

export interface StructuredDocumentObjectVm {
  readonly objectId: string;
  readonly objectTypeCode: string;
  readonly label: string;
  readonly code: string;
  readonly fields: readonly StructuredDocumentFieldVm[];
}

export type StructuredDocumentSectionVm =
  | {
      readonly state: "missing";
      readonly title: string;
      readonly relationTypeCode: string;
      readonly createAction?: string;
      readonly message: string;
      readonly rows: readonly [];
    }
  | {
      readonly state: "ready";
      readonly title: string;
      readonly relationTypeCode: string;
      readonly createAction?: string;
      readonly message: null;
      readonly rows: readonly StructuredDocumentSectionRowVm[];
    };

export type StructuredDocumentSectionRowVm =
  | {
      readonly state: "ready";
      readonly relationId: string;
      readonly object: StructuredDocumentObjectVm;
    }
  | {
      readonly state: "dangling";
      readonly relationId: string;
      readonly objectId: string;
      readonly message: string;
    };

export interface StructuredDocumentViewModel {
  readonly state: "ready" | "dangling";
  readonly message: string | null;
  readonly root: StructuredDocumentObjectVm | null;
  readonly sections: readonly StructuredDocumentSectionVm[];
}

const terminalObjectStatuses = new Set(["archived", "deleted", "soft-deleted"]);

export function readStructuredDocumentConfig(
  viewConfig: Readonly<Record<string, unknown>>,
): StructuredDocumentConfigResult {
  const value = viewConfig.structuredDocument;
  if (value === undefined) return { state: "absent" };
  if (!isRecord(value)) return invalidConfig();
  const root = readPart(value.root);
  const sections = Array.isArray(value.sections)
    ? value.sections.map(readSection)
    : null;
  if (!root || !sections || sections.some((section) => !section)) {
    return invalidConfig();
  }
  return {
    state: "ready",
    config: { root, sections: sections as StructuredDocumentSectionConfig[] },
  };
}

export function buildStructuredDocumentViewModel(
  workspace: WorkspaceState,
  doc: DocModel,
  config: StructuredDocumentConfig,
): StructuredDocumentViewModel {
  const root = workspace.objects.find(
    (object) => object.id === doc.binding.objectId,
  );
  if (!root || doc.binding.state === "dangling") {
    return {
      state: "dangling",
      message: "引用对象不存在",
      root: null,
      sections: [],
    };
  }
  if (root.objectTypeCode !== config.root.objectTypeCode) {
    return {
      state: "dangling",
      message: "绑定对象类型不匹配",
      root: null,
      sections: [],
    };
  }
  const rootVm = resolveObject(workspace, root, config.root);
  return {
    state: "ready",
    message: null,
    root: rootVm,
    sections: config.sections.map((section) =>
      resolveSection(workspace, root, section),
    ),
  };
}

export function documentObjectSelection(object: StructuredDocumentObjectVm): {
  readonly entityType: "object";
  readonly entityId: string;
} {
  return { entityType: "object", entityId: object.objectId };
}

export function documentFieldSelection(field: StructuredDocumentFieldVm): {
  readonly entityType: "field";
  readonly entityId: string;
  readonly fieldCode: string;
} {
  return {
    entityType: "field",
    entityId: field.objectId,
    fieldCode: field.fieldCode,
  };
}

function resolveSection(
  workspace: WorkspaceState,
  root: DataObject,
  section: StructuredDocumentSectionConfig,
): StructuredDocumentSectionVm {
  const relations = workspace.relations.filter(
    (relation) =>
      relation.relationTypeCode === section.relationTypeCode &&
      relation.sourceId === root.id &&
      relation.status === "active",
  );
  if (relations.length === 0) {
    return {
      state: "missing",
      title: section.title,
      relationTypeCode: section.relationTypeCode,
      createAction: section.createAction,
      message: "引用关系不存在",
      rows: [],
    };
  }
  return {
    state: "ready",
    title: section.title,
    relationTypeCode: section.relationTypeCode,
    createAction: section.createAction,
    message: null,
    rows: relations.map((relation) => {
      const object = workspace.objects.find(
        (candidate) => candidate.id === relation.targetId,
      );
      if (!object || object.objectTypeCode !== section.objectTypeCode) {
        return {
          state: "dangling" as const,
          relationId: relation.id,
          objectId: relation.targetId,
          message: !object ? "引用对象不存在" : "引用对象类型不匹配",
        };
      }
      return {
        state: "ready" as const,
        relationId: relation.id,
        object: resolveObject(workspace, object, section),
      };
    }),
  };
}

function resolveObject(
  workspace: WorkspaceState,
  object: DataObject,
  part: StructuredDocumentPartConfig,
): StructuredDocumentObjectVm {
  const type = workspace.objectTypes.find(
    (candidate) => candidate.code === object.objectTypeCode,
  );
  return {
    objectId: object.id,
    objectTypeCode: object.objectTypeCode,
    label: String(object.fields.name?.value ?? object.id),
    code: String(object.fields.code?.value ?? object.id),
    fields: part.fields.map((fieldCode) =>
      resolveField(object, type, fieldCode, part.editableFields),
    ),
  };
}

function resolveField(
  object: DataObject,
  type: ObjectTypeDef | undefined,
  fieldCode: string,
  editableFields: readonly string[],
): StructuredDocumentFieldVm {
  const field = type?.fields.find((candidate) => candidate.code === fieldCode);
  const value = object.fields[fieldCode]?.value;
  const state = value === undefined ? "dangling" : "fresh";
  const enumConfigUnavailable =
    field?.dataType === "enum" && (field.enumValues?.length ?? 0) === 0;
  const editable =
    state === "fresh" &&
    editableFields.includes(fieldCode) &&
    !!field &&
    !field.computed &&
    !field.readOnly &&
    !fieldCode.endsWith("_fx") &&
    !enumConfigUnavailable &&
    !terminalObjectStatuses.has(object.status);
  return {
    objectId: object.id,
    objectTypeCode: object.objectTypeCode,
    objectVersion: object.version,
    fieldCode,
    fieldName: field?.name ?? fieldCode,
    field: field ?? null,
    value: value ?? null,
    valueText:
      state === "dangling"
        ? "字段引用已失效"
        : formatFieldValue(value ?? null, field),
    state,
    editable,
    editMessage: enumConfigUnavailable ? "枚举字段配置不可用" : null,
  };
}

function formatFieldValue(
  value: DataFieldPrimitive,
  field: FieldDef | undefined,
): string {
  if (field) return formatCellValue(value, field);
  return value === null ? "—" : String(value);
}

function readPart(value: unknown): StructuredDocumentPartConfig | null {
  if (!isRecord(value)) return null;
  const objectTypeCode = readNonEmptyString(value.objectTypeCode);
  const fields = readStringArray(value.fields);
  const editableFields = readStringArray(value.editableFields);
  if (!objectTypeCode || !fields || !editableFields) return null;
  return { objectTypeCode, fields, editableFields };
}

function readSection(value: unknown): StructuredDocumentSectionConfig | null {
  if (!isRecord(value)) return null;
  const part = readPart(value);
  const relationTypeCode = readNonEmptyString(value.relationTypeCode);
  const title = readNonEmptyString(value.title);
  const createAction = readOptionalNonEmptyString(value.createAction);
  if (!part || !relationTypeCode || !title || createAction === null) {
    return null;
  }
  return { ...part, relationTypeCode, title, createAction };
}

function readStringArray(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readOptionalNonEmptyString(value: unknown): string | null | undefined {
  return value === undefined ? undefined : readNonEmptyString(value);
}

function invalidConfig(): StructuredDocumentConfigResult {
  return { state: "invalid", message: "结构化文档配置不可用" };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
