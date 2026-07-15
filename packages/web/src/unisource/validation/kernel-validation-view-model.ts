import type { DataObject, ObjectTypeDef, SelectionRef } from "../model/kernel";
import type { WorkspaceState } from "../state/workspace-store";
import type { RuleOutcome } from "./rules";

export type KernelValidationFilter =
  | "all"
  | "block"
  | "warn"
  | "no-issue"
  | "selection";

export interface KernelValidationItemVm {
  readonly key: string;
  readonly kind: "result" | "no-issue";
  readonly ruleCode: string | null;
  readonly severity: "BLOCK" | "WARN" | "INFO";
  readonly message: string;
  readonly objectName: string | null;
  readonly objectCode: string | null;
  readonly objectId: string | null;
  readonly fieldCode: string | null;
  readonly createdAt: string | null;
  readonly runId: string | null;
  readonly selection: SelectionRef | null;
  readonly affectedObjectIds: readonly string[];
  readonly state: "resolved" | "dangling";
  readonly stateLabel: string | null;
}

export interface KernelValidationViewModel {
  readonly status: "idle" | "running" | "ready" | "error";
  readonly error: string | null;
  readonly blockCount: number;
  readonly warnCount: number;
  readonly noIssue: boolean;
  readonly currentSelectionHasNoIssue: boolean;
  readonly items: readonly KernelValidationItemVm[];
  readonly emptyLabel: string;
}

export interface KernelValidationViewModelInput {
  readonly workspace: Pick<
    WorkspaceState,
    "objects" | "objectTypes" | "relations"
  >;
  readonly results: readonly RuleOutcome[];
  readonly status: KernelValidationViewModel["status"];
  readonly error: string | null;
  readonly filter: KernelValidationFilter;
  readonly selection: SelectionRef | null;
  readonly scopeObjectTypeCode: string | null;
}

export function buildKernelValidationViewModel(
  input: KernelValidationViewModelInput,
): KernelValidationViewModel {
  const scopedResults = input.results.filter((result) =>
    resultInScope(input.workspace, result, input.scopeObjectTypeCode),
  );
  const allItems = scopedResults.map((result, index) =>
    mapResult(input.workspace, result, index),
  );
  const noIssueItems = buildNoIssueItems(input, scopedResults);
  const selectionInScope = isSelectionInScope(input);
  const selectedItems = input.selection
    ? allItems.filter((item) => matchesSelection(item, input.selection!))
    : [];
  const selectedHasIssue = selectedItems.some(isIssue);
  const selectedNoIssue =
    input.status === "ready" && selectionInScope && !selectedHasIssue
      ? noIssueItems.filter((item) =>
          item.affectedObjectIds.some((id) =>
            selectionObjectIds(input.workspace, input.selection).includes(id),
          ),
        )
      : [];
  const items = filterItems(
    allItems,
    noIssueItems,
    selectedHasIssue ? selectedItems : selectedNoIssue,
    input.filter,
  );
  const blockCount = allItems.filter(
    (item) => item.severity === "BLOCK",
  ).length;
  const warnCount = allItems.filter((item) => item.severity === "WARN").length;
  return {
    status: input.status,
    error: input.error,
    blockCount,
    warnCount,
    noIssue: input.status === "ready" && blockCount === 0 && warnCount === 0,
    currentSelectionHasNoIssue:
      input.status === "ready" && selectionInScope && !selectedHasIssue,
    items,
    emptyLabel: emptyLabel(input, allItems, items, selectionInScope),
  };
}

function mapResult(
  workspace: KernelValidationViewModelInput["workspace"],
  result: RuleOutcome,
  index: number,
): KernelValidationItemVm {
  const selection = result.target ?? null;
  const stateLabel = danglingLabel(workspace, selection);
  const affectedObjectIds = selectionObjectIds(workspace, selection);
  const object =
    affectedObjectIds.length === 1
      ? workspace.objects.find(
          (candidate) => candidate.id === affectedObjectIds[0],
        )
      : null;
  return {
    key: `${result.runId ?? "run"}:${result.ruleCode}:${selection?.entityId ?? index}`,
    kind: "result",
    ruleCode: result.ruleCode,
    severity: severity(result.level),
    message: result.detail,
    objectName: object ? fieldText(object, "name") : null,
    objectCode: object ? fieldText(object, "code") : null,
    objectId: selection?.entityId ?? null,
    fieldCode: selection?.fieldCode ?? null,
    createdAt: result.createdAt ?? null,
    runId: result.runId ?? null,
    selection,
    affectedObjectIds,
    state: stateLabel ? "dangling" : "resolved",
    stateLabel,
  };
}

function resultInScope(
  workspace: KernelValidationViewModelInput["workspace"],
  result: RuleOutcome,
  scopeObjectTypeCode: string | null,
): boolean {
  if (scopeObjectTypeCode === null) return true;
  return selectionObjectIds(workspace, result.target ?? null).some(
    (id) =>
      workspace.objects.find((object) => object.id === id)?.objectTypeCode ===
      scopeObjectTypeCode,
  );
}

function selectionObjectIds(
  workspace: KernelValidationViewModelInput["workspace"],
  selection: SelectionRef | null,
): readonly string[] {
  if (!selection) return [];
  if (selection.entityType !== "relation") return [selection.entityId];
  const relation = workspace.relations.find(
    (candidate) => candidate.id === selection.entityId,
  );
  return relation ? [relation.sourceId, relation.targetId] : [];
}

function danglingLabel(
  workspace: KernelValidationViewModelInput["workspace"],
  selection: SelectionRef | null,
): string | null {
  if (!selection) return null;
  if (selection.entityType === "relation") {
    return workspace.relations.some(
      (relation) => relation.id === selection.entityId,
    )
      ? null
      : "引用关系不存在";
  }
  const object = workspace.objects.find(
    (candidate) => candidate.id === selection.entityId,
  );
  if (!object) return "引用对象不存在";
  if (selection.entityType === "field" && selection.fieldCode) {
    return fieldExists(workspace.objectTypes, object, selection.fieldCode)
      ? null
      : "字段引用已失效";
  }
  return null;
}

function fieldExists(
  types: readonly ObjectTypeDef[],
  object: DataObject,
  fieldCode: string,
): boolean {
  return (
    Object.hasOwn(object.fields, fieldCode) ||
    Boolean(
      types
        .find((type) => type.code === object.objectTypeCode)
        ?.fields.some((field) => field.code === fieldCode),
    )
  );
}

function buildNoIssueItems(
  input: KernelValidationViewModelInput,
  results: readonly RuleOutcome[],
): readonly KernelValidationItemVm[] {
  if (input.status !== "ready") return [];
  const issueObjectIds = new Set(
    results
      .filter((result) => severity(result.level) !== "INFO")
      .flatMap((result) =>
        selectionObjectIds(input.workspace, result.target ?? null),
      ),
  );
  return input.workspace.objects
    .filter(
      (object) =>
        (input.scopeObjectTypeCode === null ||
          object.objectTypeCode === input.scopeObjectTypeCode) &&
        !issueObjectIds.has(object.id),
    )
    .map((object) => noIssueItem(object));
}

function noIssueItem(object: DataObject): KernelValidationItemVm {
  return {
    key: `no-issue:${object.id}`,
    kind: "no-issue",
    ruleCode: null,
    severity: "INFO",
    message: "未发现 BLOCK/WARN",
    objectName: fieldText(object, "name"),
    objectCode: fieldText(object, "code"),
    objectId: object.id,
    fieldCode: null,
    createdAt: null,
    runId: null,
    selection: { entityType: "object", entityId: object.id },
    affectedObjectIds: [object.id],
    state: "resolved",
    stateLabel: null,
  };
}

function fieldText(object: DataObject, fieldCode: string): string | null {
  const value = object.fields[fieldCode]?.value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isSelectionInScope(input: KernelValidationViewModelInput): boolean {
  const objectIds = selectionObjectIds(input.workspace, input.selection);
  if (objectIds.length === 0) return false;
  return objectIds.some((id) => {
    const object = input.workspace.objects.find(
      (candidate) => candidate.id === id,
    );
    return (
      object !== undefined &&
      (input.scopeObjectTypeCode === null ||
        object.objectTypeCode === input.scopeObjectTypeCode)
    );
  });
}

function isIssue(item: KernelValidationItemVm): boolean {
  return item.severity === "BLOCK" || item.severity === "WARN";
}

function filterItems(
  allItems: readonly KernelValidationItemVm[],
  noIssueItems: readonly KernelValidationItemVm[],
  selectedItems: readonly KernelValidationItemVm[],
  filter: KernelValidationFilter,
): readonly KernelValidationItemVm[] {
  if (filter === "block")
    return allItems.filter((item) => item.severity === "BLOCK");
  if (filter === "warn")
    return allItems.filter((item) => item.severity === "WARN");
  if (filter === "selection") return selectedItems;
  if (filter === "no-issue") return noIssueItems;
  return allItems;
}

function matchesSelection(
  item: KernelValidationItemVm,
  selection: SelectionRef,
): boolean {
  if (
    item.objectId !== selection.entityId &&
    !item.affectedObjectIds.includes(selection.entityId)
  )
    return false;
  if (!selection.fieldCode || !item.fieldCode) return true;
  return item.fieldCode === selection.fieldCode;
}

function severity(
  level: RuleOutcome["level"],
): KernelValidationItemVm["severity"] {
  if (level === "error") return "BLOCK";
  if (level === "warning") return "WARN";
  return "INFO";
}

function emptyLabel(
  input: KernelValidationViewModelInput,
  allItems: readonly KernelValidationItemVm[],
  visibleItems: readonly KernelValidationItemVm[],
  selectionInScope: boolean,
): string {
  if (input.status === "idle") return "尚未校验，请点击“重新校验”。";
  if (input.status === "running") return "正在读取内核校验结果…";
  if (input.status === "error") return "校验失败，已保留上次成功结果。";
  if (input.filter === "selection" && !input.selection)
    return "请先在表格中选择一条记录。";
  if (input.filter === "selection" && !selectionInScope)
    return "当前选择不属于当前校验范围。";
  if (input.filter === "selection" && visibleItems.length === 0)
    return "当前选择没有可展示的校验结果。";
  if (input.filter === "no-issue" && visibleItems.length === 0)
    return "当前范围内没有无问题对象。";
  if (allItems.length === 0) return "本次校验未发现问题。";
  return "当前筛选没有结果。";
}
