import type {
  DataFieldPrimitive,
  DataObject,
  FieldDataType,
  FieldDef,
  ObjectTypeDef,
} from "../model/kernel";
import type { FieldRef } from "../model/view-layer";
import type { UsPillTone } from "../primitives";

export interface GridColumnVm {
  readonly code: string;
  readonly name: string;
  readonly dataType: FieldDataType;
  readonly typeMark: string;
  readonly unit?: string;
}

export interface GridCellVm {
  readonly field: FieldDef;
  readonly value: DataFieldPrimitive;
  readonly text: string;
  readonly refState: FieldRef["state"] | null;
  readonly masked: boolean;
}

export interface GridRowVm {
  readonly objectId: string;
  readonly selected: boolean;
  readonly statusLabel: string;
  readonly statusTone: UsPillTone;
  readonly cells: readonly GridCellVm[];
}

export interface GridStatusBarVm {
  readonly total: number;
  readonly selected: number;
  readonly averageLabel: string | null;
}

export interface GridViewModel {
  readonly columns: readonly GridColumnVm[];
  readonly rows: readonly GridRowVm[];
  readonly status: GridStatusBarVm;
}

export interface GridViewModelInput {
  readonly objectType: ObjectTypeDef;
  readonly objects: readonly DataObject[];
  readonly selectedIds?: ReadonlySet<string>;
  readonly fieldRefs?: readonly FieldRef[];
  readonly search?: string;
  readonly hideEol?: boolean;
  readonly maskValues?: boolean;
}

const typeMarks: Record<FieldDataType, string> = {
  text: "Aa",
  number: "#",
  enum: "Aa",
  date: "date",
  person: "person",
  docLink: "doc",
};

const statusLabels: Record<DataObject["status"], string> = {
  draft: "草稿",
  active: "有效",
  presale: "预售",
  dev: "研发中",
  sale: "在售",
  eol: "停产",
  archived: "已归档",
  deleted: "已删除",
  "soft-deleted": "已软删除",
};

const statusTones: Record<DataObject["status"], UsPillTone> = {
  draft: "dev",
  active: "sale",
  presale: "presale",
  dev: "dev",
  sale: "sale",
  eol: "eol",
  archived: "eol",
  deleted: "eol",
  "soft-deleted": "eol",
};

export function buildGridViewModel(input: GridViewModelInput): GridViewModel {
  const columns = input.objectType.fields.map((field) => ({
    code: field.code,
    name: field.name,
    dataType: field.dataType,
    typeMark: typeMarks[field.dataType],
    unit: field.unit,
  }));
  const query = input.search?.trim().toLowerCase() ?? "";
  const objects = input.objects.filter((object) => {
    if (input.hideEol && object.status === "eol") return false;
    if (!query) return true;
    return Object.values(object.fields).some((field) =>
      String(field.value ?? "")
        .toLowerCase()
        .includes(query),
    );
  });

  return {
    columns,
    rows: objects.map((object) => buildRow(input, object)),
    status: buildStatus(input.objectType.fields, objects, input.selectedIds),
  };
}

function buildRow(input: GridViewModelInput, object: DataObject): GridRowVm {
  return {
    objectId: object.id,
    selected: input.selectedIds?.has(object.id) ?? false,
    statusLabel: statusLabels[object.status],
    statusTone: statusTones[object.status],
    cells: input.objectType.fields.map((field) => ({
      field,
      value: object.fields[field.code]?.value ?? null,
      text: input.maskValues
        ? "···"
        : formatCellValue(object.fields[field.code]?.value ?? null, field),
      refState: latestRefState(input.fieldRefs, object.id, field.code),
      masked: input.maskValues ?? false,
    })),
  };
}

function buildStatus(
  fields: readonly FieldDef[],
  objects: readonly DataObject[],
  selectedIds: ReadonlySet<string> | undefined,
): GridStatusBarVm {
  const numericField = fields.find((field) => field.dataType === "number");
  const values = numericField
    ? objects
        .map((object) => object.fields[numericField.code]?.value)
        .filter((value): value is number => typeof value === "number")
    : [];
  const average =
    values.length > 0
      ? Math.round(
          values.reduce((sum, value) => sum + value, 0) / values.length,
        )
      : null;
  return {
    total: objects.length,
    selected: selectedIds?.size ?? 0,
    averageLabel:
      average === null || !numericField
        ? null
        : `${numericField.name} AVG ${formatCellValue(average, numericField)}`,
  };
}

export function formatCellValue(
  value: DataFieldPrimitive,
  field: FieldDef,
): string {
  if (value === null) return "—";
  if (field.dataType === "number" && typeof value === "number") {
    return field.unit === "CNY"
      ? `¥${value.toLocaleString("zh-CN")}`
      : field.unit
        ? `${value.toLocaleString("zh-CN")} ${field.unit}`
        : String(value);
  }
  return String(value);
}

function latestRefState(
  refs: readonly FieldRef[] | undefined,
  objectId: string,
  fieldCode: string,
): FieldRef["state"] | null {
  return (
    refs?.find(
      (ref) => ref.objectId === objectId && ref.fieldCode === fieldCode,
    )?.state ?? null
  );
}
