import type {
  DataFieldPrimitive,
  DataObject,
  FieldDef,
  ObjectTypeDef,
  ViewDef,
} from "../model/kernel";
import type { Member } from "../model/view-layer";
import type { WorkspaceState } from "../state/workspace-store";
import { formatCellValue } from "../grid/grid-view-model";

export interface MatrixConfig {
  readonly sourceTypeCode: string;
  readonly rowField: string;
  readonly colField: string;
  readonly cardFields: readonly string[];
  readonly summary: "count";
  readonly allowColumnMove: boolean;
  readonly dimValues: readonly DataFieldPrimitive[];
  readonly interactionHint: string;
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
  readonly dim: boolean;
  readonly fields: readonly {
    readonly code: string;
    readonly label: string;
    readonly text: string;
  }[];
}

export interface MatrixViewModel {
  readonly state: "ready" | "empty" | "unavailable";
  readonly message: string | null;
  readonly sourceTypeCode: string;
  readonly sourceLabel: string;
  readonly rowField: FieldDef;
  readonly colField: FieldDef;
  readonly cardFieldLabels: readonly string[];
  readonly summaryLabel: string;
  readonly columns: readonly MatrixColumnVm[];
  readonly rows: readonly MatrixRowVm[];
  readonly cards: readonly MatrixCardVm[];
  readonly allowColumnMove: boolean;
  readonly interactionHint: string;
}

export function parseMatrixConfig(view: ViewDef): MatrixConfig {
  return {
    sourceTypeCode: String(view.config.sourceTypeCode ?? ""),
    rowField: String(view.config.rowField ?? ""),
    colField: String(view.config.colField ?? ""),
    cardFields: Array.isArray(view.config.cardFields)
      ? (view.config.cardFields as string[])
      : [],
    summary: view.config.summary === "count" ? "count" : "count",
    allowColumnMove: view.config.allowColumnMove === true,
    dimValues: Array.isArray(view.config.dimValues)
      ? (view.config.dimValues as DataFieldPrimitive[])
      : [],
    interactionHint: String(
      view.config.interactionHint ?? "矩阵直接读取工作空间字段。",
    ),
  };
}

export function buildMatrixViewModel(
  workspace: WorkspaceState,
  view: ViewDef,
): MatrixViewModel {
  const config = parseMatrixConfig(view);
  const objectType = workspace.objectTypes.find(
    (type) => type.code === config.sourceTypeCode,
  );
  if (!objectType) {
    return unavailableMatrix(config, "未指定可用对象类型");
  }
  const rowField = objectType.fields.find(
    (field) => field.code === config.rowField,
  );
  const colField = objectType.fields.find(
    (field) => field.code === config.colField,
  );
  if (!rowField || !colField) {
    return unavailableMatrix(config, "矩阵配置引用的字段不存在");
  }
  const missingCardFields = config.cardFields.filter(
    (code) =>
      code !== "docRefs" &&
      !objectType.fields.some((field) => field.code === code),
  );
  if (missingCardFields.length > 0) {
    return unavailableMatrix(
      config,
      `矩阵配置引用的卡片字段不存在：${missingCardFields.join("、")}`,
    );
  }
  const objects = workspace.objects.filter(
    (object) => object.objectTypeCode === config.sourceTypeCode,
  );
  const columns = columnValues(objects, colField).map((value) => ({
    value,
    label: formatAxisValue(value, colField, workspace.members),
    tone: columnTone(value),
    count: objects.filter((object) => fieldValue(object, colField) === value)
      .length,
    dim: config.dimValues.includes(value),
  }));
  const rows = rowValues(objects, rowField, workspace.members).map((value) => ({
    value,
    label: formatAxisValue(value, rowField, workspace.members),
    avatar: memberAvatar(value, workspace.members),
    count: objects.filter((object) => fieldValue(object, rowField) === value)
      .length,
  }));
  return {
    state: objects.length === 0 ? "empty" : "ready",
    message: objects.length === 0 ? "暂无可展示数据" : null,
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
    summaryLabel: config.summary === "count" ? "记录数" : config.summary,
    columns,
    rows,
    cards: objects.map((object) => {
      const columnValue = fieldValue(object, colField);
      return {
        objectId: object.id,
        name: String(object.fields.name?.value ?? object.id),
        columnValue,
        rowValue: fieldValue(object, rowField),
        dim: config.dimValues.includes(columnValue),
        fields: cardFields(workspace, objectType, object, config.cardFields),
      };
    }),
    allowColumnMove: config.allowColumnMove,
    interactionHint: config.interactionHint,
  };
}

function unavailableMatrix(
  config: MatrixConfig,
  message: string,
): MatrixViewModel {
  const missingField = (code: string): FieldDef => ({
    code,
    name: code || "未指定字段",
    dataType: "text",
  });
  return {
    state: "unavailable",
    message,
    sourceTypeCode: config.sourceTypeCode,
    sourceLabel: "未指定数据源",
    rowField: missingField(config.rowField),
    colField: missingField(config.colField),
    cardFieldLabels: [],
    summaryLabel: config.summary === "count" ? "记录数" : config.summary,
    columns: [],
    rows: [],
    cards: [],
    allowColumnMove: false,
    interactionHint: config.interactionHint,
  };
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

function cardFields(
  workspace: WorkspaceState,
  objectType: ObjectTypeDef,
  object: DataObject,
  fieldCodes: readonly string[],
): MatrixCardVm["fields"] {
  return fieldCodes.flatMap((code) => {
    if (code === "docRefs") {
      return [
        {
          code,
          label: "关联文档",
          text: String(distinctDocRefs(workspace, object.id)),
        },
      ];
    }
    const field = objectType.fields.find(
      (candidate) => candidate.code === code,
    );
    if (!field) return [];
    return [
      {
        code,
        label: field.name,
        text: formatCellValue(object.fields[code]?.value ?? null, field),
      },
    ];
  });
}

function distinctDocRefs(workspace: WorkspaceState, objectId: string): number {
  return new Set(
    workspace.fieldRefs
      .filter((ref) => ref.objectId === objectId)
      .map((ref) => ref.exprId),
  ).size;
}
