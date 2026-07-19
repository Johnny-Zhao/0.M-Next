import type {
  DataFieldPrimitive,
  DataObject,
  FieldDef,
  ObjectTypeDef,
  ViewDef,
} from "../model/kernel";
import type { WorkspaceState } from "../state/workspace-store";
import type { KernelValidationPanelConfig } from "../validation/kernel-validation-config";

export type ExpressionGridSortDirection = "asc" | "desc";

export interface ExpressionGridSort {
  readonly fieldCode: string;
  readonly direction: ExpressionGridSortDirection;
}

export interface ExpressionGridViewModelInput {
  readonly workspace: Pick<WorkspaceState, "objectTypes" | "objects">;
  readonly view: ViewDef;
  readonly search?: string;
  readonly filters?: Readonly<Record<string, string>>;
  readonly sort?: ExpressionGridSort;
  readonly page?: number;
}

export interface ExpressionGridFilterVm {
  readonly field: FieldDef;
  readonly value: string;
  readonly options: readonly string[];
}

export interface ExpressionGridValidationConfig
  extends KernelValidationPanelConfig {}

export interface ExpressionGridViewModel {
  readonly state: "ready" | "empty" | "unavailable";
  readonly message: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly emptyLabel: string;
  readonly objectType: ObjectTypeDef | null;
  readonly objects: readonly DataObject[];
  readonly filters: readonly ExpressionGridFilterVm[];
  readonly sort: ExpressionGridSort | null;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
  readonly total: number;
  readonly rangeStart: number;
  readonly rangeEnd: number;
  readonly validation: ExpressionGridValidationConfig | null;
}

interface ParsedExpressionGridConfig {
  readonly objectType: ObjectTypeDef;
  readonly columns: readonly FieldDef[];
  readonly filterFields: readonly FieldDef[];
  readonly defaultSort: ExpressionGridSort | null;
  readonly pageSize: number;
  readonly title: string;
  readonly description: string | null;
  readonly emptyLabel: string;
  readonly validation: ExpressionGridValidationConfig | null;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

export function buildExpressionGridViewModel(
  input: ExpressionGridViewModelInput,
): ExpressionGridViewModel {
  const parsed = parseExpressionGridConfig(input.workspace, input.view);
  if (typeof parsed === "string") return unavailable(input.view, parsed);
  const search = input.search?.trim().toLocaleLowerCase("zh-CN") ?? "";
  const filters = filterViewModels(
    parsed,
    input.workspace.objects,
    input.filters,
  );
  const filtered = input.workspace.objects
    .filter((object) => object.objectTypeCode === parsed.objectType.code)
    .filter((object) => matchesSearch(object, parsed.columns, search))
    .filter((object) => matchesFilters(object, filters));
  const sort = resolveSort(input.sort, parsed);
  const sorted = stableSort(filtered, sort);
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / parsed.pageSize));
  const requestedPage = Math.max(0, Math.trunc(input.page ?? 0));
  const page = Math.min(requestedPage, pageCount - 1);
  const offset = page * parsed.pageSize;
  return {
    state: total === 0 ? "empty" : "ready",
    message: total === 0 ? parsed.emptyLabel : null,
    title: parsed.title,
    description: parsed.description,
    emptyLabel: parsed.emptyLabel,
    objectType: { ...parsed.objectType, fields: parsed.columns },
    objects: sorted.slice(offset, offset + parsed.pageSize),
    filters,
    sort,
    page,
    pageSize: parsed.pageSize,
    pageCount,
    total,
    rangeStart: total === 0 ? 0 : offset + 1,
    rangeEnd: Math.min(total, offset + parsed.pageSize),
    validation: parsed.validation,
  };
}

function parseExpressionGridConfig(
  workspace: ExpressionGridViewModelInput["workspace"],
  view: ViewDef,
): ParsedExpressionGridConfig | string {
  if (view.kind !== "grid") return "当前视图不是表格表达。";
  const configuredType = readString(view.config.objectTypeCode);
  const objectType = configuredType
    ? workspace.objectTypes.find((type) => type.code === configuredType)
    : workspace.objectTypes[0];
  if (!objectType) {
    return configuredType
      ? `对象类型 ${configuredType} 不存在。`
      : "当前工作空间没有可展示的对象类型。";
  }
  const columns = parseColumns(view.config.columns, objectType);
  if (typeof columns === "string") return columns;
  const filterFields = parseFilterFields(view.config.filterFields, objectType);
  if (typeof filterFields === "string") return filterFields;
  const pageSize = parsePageSize(view.config.pageSize);
  if (pageSize === null) return "pageSize 必须是 1 到 200 的整数。";
  const defaultSort = parseSort(view.config.defaultSort, columns);
  if (typeof defaultSort === "string") return defaultSort;
  const validation = parseValidation(view.config.validation, workspace);
  if (typeof validation === "string") return validation;
  return {
    objectType,
    columns,
    filterFields,
    defaultSort,
    pageSize,
    title: readString(view.config.title) ?? objectType.name,
    description: readString(view.config.description),
    emptyLabel: readString(view.config.emptyLabel) ?? "暂无符合条件的记录。",
    validation,
  };
}

function parseColumns(
  value: unknown,
  objectType: ObjectTypeDef,
): readonly FieldDef[] | string {
  if (value === undefined) return objectType.fields;
  if (!Array.isArray(value)) return "columns 必须是字段配置数组。";
  if (value.length === 0) return objectType.fields;
  const columns: FieldDef[] = [];
  for (const item of value) {
    const fieldCode =
      typeof item === "string"
        ? item
        : isRecord(item)
          ? readString(item.fieldCode)
          : null;
    if (!fieldCode) return "列配置缺少 fieldCode。";
    const field = objectType.fields.find(
      (candidate) => candidate.code === fieldCode,
    );
    if (!field) return `列字段 ${fieldCode} 不存在。`;
    const override = isRecord(item) ? item : {};
    columns.push({
      ...field,
      name: readString(override.label) ?? field.name,
      unit: readString(override.unit) ?? field.unit,
    });
  }
  return columns;
}

function parseFilterFields(
  value: unknown,
  objectType: ObjectTypeDef,
): readonly FieldDef[] | string {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return "filterFields 必须是字段代码数组。";
  }
  const fields: FieldDef[] = [];
  for (const code of value) {
    const field = objectType.fields.find(
      (candidate) => candidate.code === code,
    );
    if (!field) return `筛选字段 ${code} 不存在。`;
    if (field.dataType !== "text" && field.dataType !== "enum") {
      return `筛选字段 ${code} 仅支持 text 或 enum。`;
    }
    fields.push(field);
  }
  return fields;
}

function parsePageSize(value: unknown): number | null {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_PAGE_SIZE
    ? value
    : null;
}

function parseSort(
  value: unknown,
  columns: readonly FieldDef[],
): ExpressionGridSort | null | string {
  if (value === undefined) return null;
  if (!isRecord(value)) return "defaultSort 配置无效。";
  const fieldCode = readString(value.fieldCode);
  const direction = value.direction;
  if (
    !fieldCode ||
    (direction !== "asc" && direction !== "desc") ||
    !columns.some((field) => field.code === fieldCode)
  ) {
    return "defaultSort 必须引用已展示的列。";
  }
  return { fieldCode, direction };
}

function parseValidation(
  value: unknown,
  workspace: ExpressionGridViewModelInput["workspace"],
): ExpressionGridValidationConfig | null | string {
  if (value === undefined) return null;
  if (!isRecord(value)) return "validation 配置无效。";
  if (value.enabled === false) return null;
  if (value.enabled !== true) return "validation.enabled 必须是布尔值。";
  const objectTypeCode = readString(value.objectTypeCode);
  if (
    objectTypeCode &&
    !workspace.objectTypes.some((type) => type.code === objectTypeCode)
  ) {
    return `校验对象类型 ${objectTypeCode} 不存在。`;
  }
  if (value.position !== undefined && value.position !== "bottom") {
    return "validation.position 当前仅支持 bottom。";
  }
  if (
    value.allowManualRun !== undefined &&
    typeof value.allowManualRun !== "boolean"
  ) {
    return "validation.allowManualRun 必须是布尔值。";
  }
  const scopeCanvasViewId = readString(value.scopeCanvasViewId);
  if (value.scopeCanvasViewId !== undefined && !scopeCanvasViewId) {
    return "validation.scopeCanvasViewId 配置无效。";
  }
  return {
    objectTypeCode,
    position: "bottom",
    allowManualRun: value.allowManualRun === true,
    scopeCanvasViewId: scopeCanvasViewId ?? undefined,
  };
}

function filterViewModels(
  parsed: ParsedExpressionGridConfig,
  objects: readonly DataObject[],
  values: Readonly<Record<string, string>> | undefined,
): readonly ExpressionGridFilterVm[] {
  return parsed.filterFields.map((field) => ({
    field,
    value: values?.[field.code]?.trim() ?? "",
    options:
      field.dataType === "enum"
        ? (field.enumValues ?? distinctValues(field.code))
        : [],
  }));

  function distinctValues(fieldCode: string): string[] {
    return Array.from(
      new Set(
        objects
          .filter((object) => object.objectTypeCode === parsed.objectType.code)
          .map((object) => object.fields[fieldCode]?.value)
          .filter((value): value is string => typeof value === "string"),
      ),
    ).sort((left, right) => left.localeCompare(right, "zh-CN"));
  }
}

function matchesSearch(
  object: DataObject,
  columns: readonly FieldDef[],
  search: string,
): boolean {
  if (!search) return true;
  return columns.some((field) =>
    String(fieldValue(object, field.code) ?? "")
      .toLocaleLowerCase("zh-CN")
      .includes(search),
  );
}

function matchesFilters(
  object: DataObject,
  filters: readonly ExpressionGridFilterVm[],
): boolean {
  return filters.every((filter) => {
    if (!filter.value) return true;
    const value = String(fieldValue(object, filter.field.code) ?? "");
    return filter.field.dataType === "enum"
      ? value === filter.value
      : value
          .toLocaleLowerCase("zh-CN")
          .includes(filter.value.toLocaleLowerCase("zh-CN"));
  });
}

function resolveSort(
  requested: ExpressionGridSort | undefined,
  parsed: ParsedExpressionGridConfig,
): ExpressionGridSort | null {
  if (
    requested &&
    parsed.columns.some((field) => field.code === requested.fieldCode)
  ) {
    return requested;
  }
  return parsed.defaultSort;
}

function stableSort(
  objects: readonly DataObject[],
  sort: ExpressionGridSort | null,
): readonly DataObject[] {
  if (!sort) return objects;
  return objects
    .map((object, index) => ({ object, index }))
    .sort((left, right) => {
      const compared = compareValues(
        fieldValue(left.object, sort.fieldCode),
        fieldValue(right.object, sort.fieldCode),
      );
      return compared === 0
        ? left.index - right.index
        : compared * (sort.direction === "asc" ? 1 : -1);
    })
    .map(({ object }) => object);
}

function compareValues(
  left: DataFieldPrimitive,
  right: DataFieldPrimitive,
): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  if (typeof left === "number" && typeof right === "number")
    return left - right;
  return String(left).localeCompare(String(right), "zh-CN", {
    numeric: true,
    sensitivity: "base",
  });
}

function fieldValue(object: DataObject, fieldCode: string): DataFieldPrimitive {
  return object.fields[fieldCode]?.value ?? null;
}

function unavailable(view: ViewDef, message: string): ExpressionGridViewModel {
  return {
    state: "unavailable",
    message,
    title: readString(view.config.title) ?? "表格表达不可用",
    description: readString(view.config.description),
    emptyLabel: readString(view.config.emptyLabel) ?? "暂无记录。",
    objectType: null,
    objects: [],
    filters: [],
    sort: null,
    page: 0,
    pageSize: DEFAULT_PAGE_SIZE,
    pageCount: 1,
    total: 0,
    rangeStart: 0,
    rangeEnd: 0,
    validation: null,
  };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
