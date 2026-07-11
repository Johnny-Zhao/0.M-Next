import type { ChangeItem, ChangeSet } from "../model/kernel";
import type { WorkspaceState } from "../state/workspace-store";

export interface ImportDiffRowVm {
  readonly id: string;
  readonly op: "add" | "change" | "skip";
  readonly status: "written" | "pending" | "needsConfirm";
  readonly title: string;
  readonly oldText: string;
  readonly nextText: string;
  readonly confidence: number;
  readonly confidenceTone: "ok" | "change";
  readonly needsConfirm: boolean;
  readonly groupTitle: string;
}

export interface ImportGroupVm {
  readonly title: string;
  readonly rows: readonly ImportDiffRowVm[];
}

export interface ImportViewModel {
  readonly steps: readonly {
    readonly label: string;
    readonly state: "done" | "current" | "todo";
  }[];
  readonly groups: readonly ImportGroupVm[];
  readonly addCount: number;
  readonly changeCount: number;
  readonly skipCount: number;
  readonly pendingCount: number;
  readonly canConfirm: boolean;
  readonly disabledReason: string | null;
  readonly confirmableItemIds: readonly string[];
}

export function buildImportViewModel(params: {
  readonly workspace: WorkspaceState;
  readonly changeSet: ChangeSet | undefined;
  readonly confirmedIds?: ReadonlySet<string>;
}): ImportViewModel {
  const rows =
    params.changeSet?.items.map((item) =>
      buildRow(params.workspace, item, params.confirmedIds ?? new Set()),
    ) ?? [];
  const pendingRows = rows.filter((row) => row.status !== "written");
  const blocked = pendingRows.find((row) => row.needsConfirm);
  const confirmable = params.changeSet
    ? params.changeSet.items
        .filter((item) => item.applied !== true)
        .filter((item) => {
          const row = rows.find((candidate) => candidate.id === item.id);
          return row?.op !== "skip";
        })
        .map((item) => item.id)
    : [];
  const allWritten =
    rows.length > 0 && rows.every((row) => row.status === "written");
  return {
    steps: [
      { label: "输入", state: "done" },
      { label: "语义匹配", state: "done" },
      { label: "定位增删改", state: allWritten ? "done" : "current" },
      { label: "写入", state: allWritten ? "done" : "todo" },
    ],
    groups: groupRows(rows),
    addCount: rows.filter((row) => row.op === "add").length,
    changeCount: rows.filter((row) => row.op === "change").length,
    skipCount: rows.filter((row) => row.op === "skip").length,
    pendingCount: pendingRows.length,
    canConfirm: pendingRows.length > 0 && !blocked,
    disabledReason: blocked ? "低置信项需逐项确认" : null,
    confirmableItemIds: confirmable,
  };
}

function buildRow(
  workspace: WorkspaceState,
  item: ChangeItem,
  confirmedIds: ReadonlySet<string>,
): ImportDiffRowVm {
  const current = currentValue(workspace, item);
  const isSkip =
    item.op === "updateField" &&
    current !== undefined &&
    current === item.nextValue &&
    item.oldValue === item.nextValue;
  const confidence = item.confidence ?? 1;
  const confirmed = item.confirmed === true || confirmedIds.has(item.id);
  const needsConfirm =
    item.applied !== true &&
    (item.needsConfirm === true || confidence < 0.8) &&
    !confirmed;
  return {
    id: item.id,
    op: isSkip ? "skip" : item.op === "createObject" ? "add" : "change",
    status:
      item.applied === true || isSkip
        ? "written"
        : needsConfirm
          ? "needsConfirm"
          : "pending",
    title: itemTitle(item),
    oldText: String(item.oldValue ?? "空"),
    nextText: String(item.nextValue ?? item.fields?.name ?? "新对象"),
    confidence,
    confidenceTone: confidence >= 0.8 ? "ok" : "change",
    needsConfirm,
    groupTitle: targetGroupTitle(workspace, item),
  };
}

function currentValue(workspace: WorkspaceState, item: ChangeItem): unknown {
  if (item.target.entityType !== "field" || !item.target.fieldCode)
    return undefined;
  return workspace.objects.find((object) => object.id === item.target.entityId)
    ?.fields[item.target.fieldCode]?.value;
}

function itemTitle(item: ChangeItem): string {
  if (item.op === "createObject") return `新增 ${item.fields?.name ?? "对象"}`;
  return item.target.fieldCode ?? item.id;
}

function targetGroupTitle(workspace: WorkspaceState, item: ChangeItem): string {
  const objectTypeCode =
    item.objectTypeCode ??
    workspace.objects.find((object) => object.id === item.target.entityId)
      ?.objectTypeCode;
  return (
    workspace.objectTypes.find((type) => type.code === objectTypeCode)?.name ??
    objectTypeCode ??
    "未分组"
  );
}

function groupRows(rows: readonly ImportDiffRowVm[]): readonly ImportGroupVm[] {
  const titles = Array.from(new Set(rows.map((row) => row.groupTitle)));
  return titles.map((title) => ({
    title,
    rows: rows.filter((row) => row.groupTitle === title),
  }));
}
