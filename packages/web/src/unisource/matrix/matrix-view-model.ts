import type {
  DataFieldPrimitive,
  DataObject,
  FieldDef,
  ObjectTypeDef,
  ViewDef,
} from "../model/kernel";
import type { Member } from "../model/view-layer";
import type { WorkspaceState } from "../state/workspace-store";

export interface MatrixConfig {
  readonly sourceTypeCode: string;
  readonly rowField: string;
  readonly colField: string;
  readonly cardFields: readonly string[];
  readonly summary: "count";
}

export interface MatrixColumnVm {
  readonly value: DataFieldPrimitive;
  readonly label: string;
  readonly tone: "dev" | "presale" | "sale" | "eol";
  readonly count: number;
  readonly dim: boolean;
}

export interface MatrixRowVm {
  readonly value: DataFieldPrimitive;
  readonly label: string;
  readonly avatar: Member["avatar"];
  readonly count: number;
}

export interface MatrixCardVm {
  readonly objectId: string;
  readonly name: string;
  readonly columnValue: DataFieldPrimitive;
  readonly rowValue: DataFieldPrimitive;
  readonly priceText: string;
  readonly docRefs: number;
  readonly dim: boolean;
}

export interface MatrixViewModel {
  readonly sourceTypeCode: string;
  readonly sourceLabel: string;
  readonly rowField: FieldDef;
  readonly colField: FieldDef;
  readonly cardFieldLabels: readonly string[];
  readonly columns: readonly MatrixColumnVm[];
  readonly rows: readonly MatrixRowVm[];
  readonly cards: readonly MatrixCardVm[];
}

export function parseMatrixConfig(view: ViewDef): MatrixConfig {
  return {
    sourceTypeCode: String(view.config.sourceTypeCode ?? "product_specs"),
    rowField: String(view.config.rowField ?? "owner"),
    colField: String(view.config.colField ?? "lifecycle"),
    cardFields: Array.isArray(view.config.cardFields)
      ? (view.config.cardFields as string[])
      : ["price", "docRefs"],
    summary: view.config.summary === "count" ? "count" : "count",
  };
}

export function buildMatrixViewModel(
  workspace: WorkspaceState,
  view: ViewDef,
): MatrixViewModel {
  const config = parseMatrixConfig(view);
  const objectType = requireObjectType(workspace, config.sourceTypeCode);
  const rowField = requireField(objectType, config.rowField);
  const colField = requireField(objectType, config.colField);
  const objects = workspace.objects.filter(
    (object) => object.objectTypeCode === config.sourceTypeCode,
  );
  const columns = columnValues(objects, colField).map((value) => ({
    value,
    label: formatAxisValue(value, colField, workspace.members),
    tone: columnTone(value),
    count: objects.filter((object) => fieldValue(object, colField) === value)
      .length,
    dim: value === "停产",
  }));
  const rows = rowValues(objects, rowField, workspace.members).map((value) => ({
    value,
    label: formatAxisValue(value, rowField, workspace.members),
    avatar: memberAvatar(value, workspace.members),
    count: objects.filter((object) => fieldValue(object, rowField) === value)
      .length,
  }));
  return {
    sourceTypeCode: objectType.code,
    sourceLabel: objectType.name,
    rowField,
    colField,
    cardFieldLabels: config.cardFields.map((code) =>
      code === "docRefs"
        ? "关联文档"
        : (objectType.fields.find((field) => field.code === code)?.name ??
          code),
    ),
    columns,
    rows,
    cards: objects.map((object) => {
      const columnValue = fieldValue(object, colField);
      return {
        objectId: object.id,
        name: String(object.fields.name?.value ?? object.id),
        columnValue,
        rowValue: fieldValue(object, rowField),
        priceText: formatMoney(object.fields.price?.value),
        docRefs: distinctDocRefs(workspace, object.id),
        dim: columnValue === "停产",
      };
    }),
  };
}

function requireObjectType(
  workspace: WorkspaceState,
  code: string,
): ObjectTypeDef {
  const objectType = workspace.objectTypes.find((type) => type.code === code);
  if (!objectType) throw new Error(`Missing object type ${code}`);
  return objectType;
}

function requireField(objectType: ObjectTypeDef, code: string): FieldDef {
  const field = objectType.fields.find((candidate) => candidate.code === code);
  if (!field) throw new Error(`Missing field ${code}`);
  return field;
}

function fieldValue(object: DataObject, field: FieldDef): DataFieldPrimitive {
  return object.fields[field.code]?.value ?? null;
}

function columnValues(
  objects: readonly DataObject[],
  field: FieldDef,
): readonly DataFieldPrimitive[] {
  if (field.enumValues) return field.enumValues;
  return uniqueValues(objects.map((object) => fieldValue(object, field)));
}

function rowValues(
  objects: readonly DataObject[],
  field: FieldDef,
  members: readonly Member[],
): readonly DataFieldPrimitive[] {
  const values = new Set(objects.map((object) => fieldValue(object, field)));
  if (field.dataType === "person") {
    return members
      .filter((member) => values.has(member.id))
      .map((member) => member.id);
  }
  if (field.enumValues)
    return field.enumValues.filter((value) => values.has(value));
  return uniqueValues(Array.from(values));
}

function uniqueValues(
  values: readonly DataFieldPrimitive[],
): readonly DataFieldPrimitive[] {
  return Array.from(new Set(values));
}

function formatAxisValue(
  value: DataFieldPrimitive,
  field: FieldDef,
  members: readonly Member[],
): string {
  if (field.dataType === "person") {
    return members.find((member) => member.id === value)?.name ?? String(value);
  }
  return String(value ?? "—");
}

function memberAvatar(
  value: DataFieldPrimitive,
  members: readonly Member[],
): Member["avatar"] {
  return (
    members.find((member) => member.id === value)?.avatar ??
    members.find((member) => member.id === "ai")!.avatar
  );
}

function columnTone(value: DataFieldPrimitive): MatrixColumnVm["tone"] {
  if (value === "研发中") return "dev";
  if (value === "预售") return "presale";
  if (value === "停产") return "eol";
  return "sale";
}

function formatMoney(value: DataFieldPrimitive): string {
  return typeof value === "number" ? `¥${value.toLocaleString("zh-CN")}` : "—";
}

function distinctDocRefs(workspace: WorkspaceState, objectId: string): number {
  return new Set(
    workspace.fieldRefs
      .filter((ref) => ref.objectId === objectId)
      .map((ref) => ref.exprId),
  ).size;
}
