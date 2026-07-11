import type {
  DataFieldPrimitive,
  DataObject,
  FieldDef,
  ObjectTypeDef,
} from "../model/kernel";
import type {
  DocBlock,
  DocInline,
  DocModel,
  FieldRef,
  FieldRefState,
} from "../model/view-layer";
import type { WorkspaceState } from "../state/workspace-store";
import { formatCellValue } from "../grid/grid-view-model";

export interface DocRefVm {
  readonly refId: string;
  readonly objectId: string;
  readonly fieldCode: string;
  readonly fieldName: string;
  readonly value: DataFieldPrimitive;
  readonly valueText: string;
  readonly state: FieldRefState;
  readonly label: string;
  readonly chipDomId: string;
  readonly confidenceLabel?: string;
}

export type DocInlineVm =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "ref"; readonly ref: DocRefVm };

export type DocBlockVm =
  | { readonly kind: "meta"; readonly items: readonly string[] }
  | { readonly kind: "h1"; readonly text: string; readonly ref?: DocRefVm }
  | { readonly kind: "h2"; readonly text: string }
  | {
      readonly kind: "paragraph";
      readonly id: string;
      readonly inlines: readonly DocInlineVm[];
    }
  | {
      readonly kind: "dataTable";
      readonly id: string;
      readonly title: string;
      readonly sourceLabel: string;
      readonly rows: readonly {
        readonly label: string;
        readonly ref: DocRefVm;
      }[];
    };

export interface DocFieldRefGroupVm {
  readonly fieldCode: string;
  readonly fieldName: string;
  readonly valueText: string;
  readonly count: number;
  readonly state: FieldRefState;
  readonly firstRefId: string;
  readonly confidenceLabel?: string;
}

export interface DocViewModel {
  readonly doc: DocModel;
  readonly bindingObject: DataObject | null;
  readonly bindingType: ObjectTypeDef | null;
  readonly blocks: readonly DocBlockVm[];
  readonly refs: readonly DocRefVm[];
  readonly fields: readonly DocFieldRefGroupVm[];
  readonly refCount: number;
  readonly allFresh: boolean;
  readonly justSyncedCount: number;
  readonly danglingCount: number;
  readonly howState: "ok" | "change" | "danger";
  readonly howLabel: string;
  readonly wordCount: number;
}

export function buildDocViewModel(
  workspace: WorkspaceState,
  doc: DocModel,
): DocViewModel {
  const docRefIds = collectDocRefIds(doc.blocks);
  const refMap = new Map(
    workspace.fieldRefs
      .filter((ref) => ref.exprId === doc.exprId || docRefIds.has(ref.id))
      .map((ref) => [ref.id, resolveRef(workspace, ref)]),
  );
  const bindingObject =
    workspace.objects.find((object) => object.id === doc.binding.objectId) ??
    null;
  const bindingType =
    workspace.objectTypes.find(
      (type) => type.code === bindingObject?.objectTypeCode,
    ) ?? null;
  const blocks = doc.blocks.map((block) => resolveBlock(block, refMap));
  const refs = Array.from(refMap.values());
  const justSyncedCount = refs.filter(
    (ref) => ref.state === "justSynced",
  ).length;
  const danglingCount = refs.filter((ref) => ref.state === "dangling").length;
  const how =
    danglingCount > 0
      ? { state: "danger" as const, label: `${danglingCount} 处引用悬空` }
      : justSyncedCount > 0
        ? {
            state: "change" as const,
            label: `刚刚同步 ${justSyncedCount} 处引用`,
          }
        : {
            state: "ok" as const,
            label: `✓ ${refs.length} 处引用 · 全部最新`,
          };
  return {
    doc,
    bindingObject,
    bindingType,
    blocks,
    refs,
    fields: groupFieldRefs(refs),
    refCount: refs.length,
    allFresh: danglingCount === 0 && justSyncedCount === 0,
    justSyncedCount,
    danglingCount,
    howState: how.state,
    howLabel: how.label,
    wordCount: countDocText(doc.blocks),
  };
}

export function filterFieldOptions(
  fields: readonly FieldDef[],
  query: string,
): readonly FieldDef[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return fields;
  return fields.filter(
    (field) =>
      field.name.toLowerCase().includes(keyword) ||
      field.code.toLowerCase().includes(keyword),
  );
}

export interface PopoverState {
  readonly open: boolean;
  readonly activeIndex: number;
}

export type PopoverAction =
  | { readonly kind: "ArrowDown"; readonly size: number }
  | { readonly kind: "ArrowUp"; readonly size: number }
  | { readonly kind: "Enter"; readonly size: number }
  | { readonly kind: "Escape" };

export type PopoverResult =
  | { readonly state: PopoverState; readonly selectedIndex?: number }
  | { readonly state: PopoverState; readonly cancelled: true };

export function popoverReducer(
  state: PopoverState,
  action: PopoverAction,
): PopoverResult {
  if (action.kind === "Escape") {
    return { state: { open: false, activeIndex: 0 }, cancelled: true };
  }
  if (action.kind === "Enter") {
    return {
      state,
      selectedIndex: action.size === 0 ? undefined : state.activeIndex,
    };
  }
  if (action.size === 0) return { state: { ...state, activeIndex: 0 } };
  const delta = action.kind === "ArrowDown" ? 1 : -1;
  return {
    state: {
      ...state,
      activeIndex: (state.activeIndex + delta + action.size) % action.size,
    },
  };
}

function resolveBlock(
  block: DocBlock,
  refs: ReadonlyMap<string, DocRefVm>,
): DocBlockVm {
  if (block.kind === "paragraph") {
    return {
      ...block,
      inlines: block.inlines.map((inline) => resolveInline(inline, refs)),
    };
  }
  if (block.kind === "dataTable") {
    return {
      ...block,
      rows: block.rows.map((row) => ({
        label: row.label,
        ref: refs.get(row.refId) ?? missingRef(row.refId),
      })),
    };
  }
  if (block.kind === "h1") {
    return {
      ...block,
      ref: block.refId ? refs.get(block.refId) : undefined,
    };
  }
  return block;
}

function resolveInline(
  inline: DocInline,
  refs: ReadonlyMap<string, DocRefVm>,
): DocInlineVm {
  if (inline.kind === "text") return inline;
  return {
    kind: "ref",
    ref: refs.get(inline.refId) ?? missingRef(inline.refId),
  };
}

function resolveRef(workspace: WorkspaceState, ref: FieldRef): DocRefVm {
  const object = workspace.objects.find((item) => item.id === ref.objectId);
  const type = workspace.objectTypes.find(
    (candidate) => candidate.code === object?.objectTypeCode,
  );
  const field = type?.fields.find(
    (candidate) => candidate.code === ref.fieldCode,
  );
  const value = object?.fields[ref.fieldCode]?.value ?? null;
  const state: FieldRefState =
    ref.state === "dangling" || !object || !field ? "dangling" : ref.state;
  return {
    refId: ref.id,
    objectId: ref.objectId,
    fieldCode: ref.fieldCode,
    fieldName: field?.name ?? ref.fieldCode,
    value,
    valueText:
      state === "dangling" ? "字段已删除" : formatMaybeField(value, field),
    state,
    label: ref.label,
    chipDomId: `ref-${ref.id}`,
    confidenceLabel:
      state === "lowConfidence" && ref.confidence !== undefined
        ? `${Math.round(ref.confidence * 100)}%`
        : undefined,
  };
}

function missingRef(refId: string): DocRefVm {
  return {
    refId,
    objectId: "",
    fieldCode: "",
    fieldName: "未知字段",
    value: null,
    valueText: "字段已删除",
    state: "dangling",
    label: "悬空引用",
    chipDomId: `ref-${refId}`,
  };
}

function formatMaybeField(
  value: DataFieldPrimitive,
  field: FieldDef | undefined,
): string {
  if (!field) return value === null ? "—" : String(value);
  return formatCellValue(value, field);
}

function groupFieldRefs(
  refs: readonly DocRefVm[],
): readonly DocFieldRefGroupVm[] {
  const groups = new Map<string, DocRefVm[]>();
  for (const ref of refs) {
    const key = `${ref.objectId}:${ref.fieldCode}`;
    groups.set(key, [...(groups.get(key) ?? []), ref]);
  }
  return Array.from(groups.values()).map((items) => {
    const first = items[0]!;
    const priority = items.find((item) => item.state !== "fresh") ?? first;
    return {
      fieldCode: first.fieldCode,
      fieldName: first.fieldName,
      valueText: first.valueText,
      count: items.length,
      state: priority.state,
      firstRefId: first.refId,
      confidenceLabel: priority.confidenceLabel,
    };
  });
}

export function countDocText(blocks: readonly DocBlock[]): number {
  return blocks.reduce((sum, block) => {
    if (block.kind === "h1" || block.kind === "h2")
      return sum + block.text.length;
    if (block.kind === "meta") return sum + block.items.join("").length;
    if (block.kind === "paragraph") {
      return (
        sum +
        block.inlines.reduce(
          (inlineSum, inline) =>
            inline.kind === "text" ? inlineSum + inline.text.length : inlineSum,
          0,
        )
      );
    }
    return (
      sum +
      block.title.length +
      block.rows.reduce((rowSum, row) => rowSum + row.label.length, 0)
    );
  }, 0);
}

function collectDocRefIds(blocks: readonly DocBlock[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (block.kind === "h1" && block.refId) ids.add(block.refId);
    if (block.kind === "paragraph") {
      for (const inline of block.inlines) {
        if (inline.kind === "ref") ids.add(inline.refId);
      }
    }
    if (block.kind === "dataTable") {
      for (const row of block.rows) ids.add(row.refId);
    }
  }
  return ids;
}
