import type {
  DataFieldPrimitive,
  DataObject,
  FieldDef,
  ObjectTypeDef,
  SelectionRef,
} from "../model/kernel";
import type {
  DocumentDataReferenceConfig,
  DocumentDataTableConfig,
  OutputSectionMapping,
} from "@m-next/views";
import type { DocModel } from "../model/view-layer";
import type { WorkspaceState } from "../state/workspace-store";
import type { KernelValidationPanelConfig } from "../validation/kernel-validation-config";
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
  readonly bodyFieldCode?: string;
  readonly validation?: KernelValidationPanelConfig;
  readonly output?: StructuredDocumentOutputConfig;
  readonly dataReferenceTemplates: readonly StructuredDocumentDataReferenceTemplate[];
  readonly dataTableTemplates: readonly StructuredDocumentDataTableTemplate[];
  readonly preferSelectedRoot?: boolean;
  readonly root: StructuredDocumentPartConfig;
  readonly sections: readonly StructuredDocumentSectionConfig[];
}

export interface StructuredDocumentOutputConfig {
  readonly fieldOrder: readonly string[];
  readonly format: "docx";
  readonly maxDepth?: number;
  readonly relationType?: string;
  readonly relatedRelationTypes: readonly string[];
  readonly sectionMapping?: OutputSectionMapping;
}

export interface StructuredDocumentDataReferenceTemplate {
  readonly id: string;
  readonly label: string;
  readonly config: DocumentDataReferenceConfig;
}

export interface StructuredDocumentDataTableTemplate {
  readonly id: string;
  readonly label: string;
  readonly config: DocumentDataTableConfig;
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
  readonly body: StructuredDocumentFieldVm | null;
  readonly sections: readonly StructuredDocumentSectionVm[];
}

export type StructuredDocumentOutlineItem =
  | {
      readonly kind: "root";
      readonly id: string;
      readonly label: string;
      readonly objectId: string;
      readonly state: "ready";
    }
  | {
      readonly kind: "section";
      readonly id: string;
      readonly label: string;
      readonly relationTypeCode: string;
      readonly state: "ready" | "missing";
      readonly message: string | null;
    }
  | {
      readonly kind: "row";
      readonly id: string;
      readonly label: string;
      readonly objectId: string | null;
      readonly relationId: string;
      readonly sectionId: string;
      readonly state: "ready" | "dangling";
      readonly message: string | null;
    };

export function buildStructuredDocumentOutline(
  viewModel: StructuredDocumentViewModel,
): readonly StructuredDocumentOutlineItem[] {
  if (!viewModel.root) return [];
  const rootItem: StructuredDocumentOutlineItem = {
    kind: "root",
    id: `structured-document-root-${viewModel.root.objectId}`,
    label: viewModel.root.label,
    objectId: viewModel.root.objectId,
    state: "ready",
  };
  const items: StructuredDocumentOutlineItem[] = [rootItem];
  viewModel.sections.forEach((section) => {
    const sectionId = `structured-document-section-${section.relationTypeCode}`;
    items.push({
      kind: "section",
      id: sectionId,
      label: section.title,
      relationTypeCode: section.relationTypeCode,
      state: section.state,
      message: section.message,
    });
    if (section.state !== "ready") return;
    section.rows.forEach((row) => {
      items.push(
        row.state === "ready"
          ? {
              kind: "row",
              id: `structured-document-row-${row.relationId}`,
              label: row.object.label,
              objectId: row.object.objectId,
              relationId: row.relationId,
              sectionId,
              state: "ready",
              message: null,
            }
          : {
              kind: "row",
              id: `structured-document-row-${row.relationId}`,
              label: "引用对象不可用",
              objectId: null,
              relationId: row.relationId,
              sectionId,
              state: "dangling",
              message: row.message,
            },
      );
    });
  });
  return items;
}

export function structuredDocumentOutlineSelection(
  item: StructuredDocumentOutlineItem,
): SelectionRef | null {
  return item.kind !== "section" && item.objectId
    ? { entityType: "object", entityId: item.objectId }
    : null;
}

export function resolveStructuredDocumentActiveOutlineId(
  items: readonly StructuredDocumentOutlineItem[],
  activeId: string | null,
): string | null {
  if (activeId && items.some((item) => item.id === activeId)) return activeId;
  return (
    items.find((item) => item.kind === "root")?.id ??
    items.find((item) => item.state === "ready")?.id ??
    null
  );
}

const terminalObjectStatuses = new Set(["archived", "deleted", "soft-deleted"]);

export function readStructuredDocumentConfig(
  viewConfig: Readonly<Record<string, unknown>>,
): StructuredDocumentConfigResult {
  const value = viewConfig.structuredDocument;
  if (value === undefined) return { state: "absent" };
  if (!isRecord(value)) return invalidConfig();
  const root = readPart(value.root);
  const bodyFieldCode = readOptionalNonEmptyString(value.bodyFieldCode);
  const output = readOutputConfig(value.output);
  const validation = readValidationConfig(value.validation);
  const dataReferenceTemplates = readDataReferenceTemplates(
    value.dataReferenceTemplates,
  );
  const dataTableTemplates = readDataTableTemplates(value.dataTableTemplates);
  const preferSelectedRoot = value.preferSelectedRoot === true;
  const sections = Array.isArray(value.sections)
    ? value.sections.map(readSection)
    : null;
  if (
    !root ||
    !sections ||
    !dataReferenceTemplates ||
    !dataTableTemplates ||
    output === null ||
    validation === null ||
    sections.some((section) => !section)
  ) {
    return invalidConfig();
  }
  return {
    state: "ready",
    config: {
      bodyFieldCode: bodyFieldCode ?? undefined,
      validation: validation ?? undefined,
      output: output ?? undefined,
      dataReferenceTemplates,
      dataTableTemplates,
      preferSelectedRoot,
      root,
      sections: sections as StructuredDocumentSectionConfig[],
    },
  };
}

export function buildStructuredDocumentViewModel(
  workspace: WorkspaceState,
  doc: DocModel,
  config: StructuredDocumentConfig,
  selectedRootObjectId: string | null = null,
): StructuredDocumentViewModel {
  const selectedRoot =
    config.preferSelectedRoot && selectedRootObjectId
      ? workspace.objects.find((object) => object.id === selectedRootObjectId)
      : null;
  const root =
    selectedRoot?.objectTypeCode === config.root.objectTypeCode
      ? selectedRoot
      : workspace.objects.find((object) => object.id === doc.binding.objectId);
  if (
    !root ||
    (root.id === doc.binding.objectId && doc.binding.state === "dangling")
  ) {
    return {
      state: "dangling",
      message: "引用对象不存在",
      root: null,
      body: null,
      sections: [],
    };
  }
  if (root.objectTypeCode !== config.root.objectTypeCode) {
    return {
      state: "dangling",
      message: "绑定对象类型不匹配",
      root: null,
      body: null,
      sections: [],
    };
  }
  const rootPart = config.bodyFieldCode
    ? {
        ...config.root,
        fields: config.root.fields.filter(
          (fieldCode) => fieldCode !== config.bodyFieldCode,
        ),
      }
    : config.root;
  const rootVm = resolveObject(workspace, root, rootPart);
  const rootType = workspace.objectTypes.find(
    (candidate) => candidate.code === root.objectTypeCode,
  );
  return {
    state: "ready",
    message: null,
    root: rootVm,
    body: config.bodyFieldCode
      ? resolveField(
          root,
          rootType,
          config.bodyFieldCode,
          [config.bodyFieldCode],
          true,
        )
      : null,
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
  allowMissingValue = false,
): StructuredDocumentFieldVm {
  const field = type?.fields.find((candidate) => candidate.code === fieldCode);
  const value = object.fields[fieldCode]?.value;
  const state =
    !field || (value === undefined && !allowMissingValue)
      ? "dangling"
      : "fresh";
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

function readDataReferenceTemplates(
  value: unknown,
): readonly StructuredDocumentDataReferenceTemplate[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  return value.flatMap((item) => {
    if (!isRecord(item) || !isRecord(item.config)) return [];
    const id = readNonEmptyString(item.id);
    const label = readNonEmptyString(item.label);
    return id && label
      ? [{ id, label, config: item.config as DocumentDataReferenceConfig }]
      : [];
  });
}

function readDataTableTemplates(
  value: unknown,
): readonly StructuredDocumentDataTableTemplate[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  return value.flatMap((item) => {
    if (!isRecord(item) || !isRecord(item.config)) return [];
    const id = readNonEmptyString(item.id);
    const label = readNonEmptyString(item.label);
    return id && label && typeof item.config.objectTypeCode === "string"
      ? [
          {
            id,
            label,
            config: item.config as unknown as DocumentDataTableConfig,
          },
        ]
      : [];
  });
}

function readOutputConfig(
  value: unknown,
): StructuredDocumentOutputConfig | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || value.format !== "docx") return null;
  const fieldOrder = readStringArray(value.fieldOrder);
  const relatedRelationTypes = readStringArray(value.relatedRelationTypes);
  const relationType = readOptionalNonEmptyString(value.relationType);
  const maxDepth =
    typeof value.maxDepth === "number" && Number.isInteger(value.maxDepth)
      ? value.maxDepth
      : undefined;
  if (
    !fieldOrder ||
    !relatedRelationTypes ||
    relationType === null ||
    (maxDepth !== undefined && (maxDepth < 1 || maxDepth > 5))
  ) {
    return null;
  }
  return {
    fieldOrder,
    format: "docx",
    maxDepth,
    relationType: relationType ?? undefined,
    relatedRelationTypes,
    sectionMapping: isRecord(value.sectionMapping)
      ? (value.sectionMapping as OutputSectionMapping)
      : undefined,
  };
}

function readValidationConfig(
  value: unknown,
): KernelValidationPanelConfig | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || value.position !== "bottom") return null;
  const objectTypeCode =
    value.objectTypeCode === null
      ? null
      : readOptionalNonEmptyString(value.objectTypeCode);
  const scopeCanvasViewId = readOptionalNonEmptyString(value.scopeCanvasViewId);
  if (
    objectTypeCode === undefined ||
    scopeCanvasViewId === null ||
    typeof value.allowManualRun !== "boolean"
  ) {
    return null;
  }
  return {
    objectTypeCode: objectTypeCode ?? null,
    position: "bottom",
    allowManualRun: value.allowManualRun,
    scopeCanvasViewId: scopeCanvasViewId ?? undefined,
  };
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
