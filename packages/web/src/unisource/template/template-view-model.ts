import type {
  DataFieldPrimitive,
  DataObject,
  FieldCode,
  SlotConstraint,
  SlotDef,
  ViewDef,
} from "../model/kernel";
import type { SlotBinding } from "../model/view-layer";
import type { WorkspaceState } from "../state/workspace-store";

export type SlotState =
  | "instantiated"
  | "activated"
  | "empty"
  | "violated"
  | "dangling";
export type LibraryMatchState = "match" | "mismatch" | "bound";

export interface TemplateSlotNodeConfig {
  readonly slotId: string;
  readonly x: number;
  readonly y: number;
  readonly w?: number;
  readonly h?: number;
}

export interface TemplateSlotVm {
  readonly id: string;
  readonly slotId: string;
  readonly bindingId: string;
  readonly label: string;
  readonly abstractType: string;
  readonly state: SlotState;
  readonly objectId: string | null;
  readonly objectName: string | null;
  readonly sourceLabel: string;
  readonly constraintText: string;
  readonly violationReason: string | null;
  readonly fields: readonly {
    readonly code: FieldCode;
    readonly label: string;
    readonly value: DataFieldPrimitive;
    readonly text: string;
  }[];
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface TemplateEdgeVm {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly label: string;
  readonly solid: boolean;
}

export interface LibraryItemVm {
  readonly objectId: string;
  readonly name: string;
  readonly specLine: string;
  readonly valueText: string;
  readonly group: string;
  readonly matchState: LibraryMatchState;
  readonly reason: string;
}

export interface TemplateLibraryVm {
  readonly title: string;
  readonly sourceLabel: string;
  readonly total: number;
  readonly matching: number;
  readonly groupCounts: readonly {
    readonly group: string;
    readonly count: number;
  }[];
  readonly items: readonly LibraryItemVm[];
  readonly footer: string;
}

export interface TemplateViewModel {
  readonly exprId: string;
  readonly viewId: string;
  readonly templateId: string;
  readonly templateName: string;
  readonly slots: readonly TemplateSlotVm[];
  readonly edges: readonly TemplateEdgeVm[];
  readonly pendingCount: number;
  readonly totalCount: number;
  readonly library: TemplateLibraryVm;
  readonly hint: string;
}

const defaultSize = { w: 224, h: 142 } as const;

export function buildTemplateViewModel(
  workspace: WorkspaceState,
  view: ViewDef,
  activeSlotId: string | null,
): TemplateViewModel {
  const templateId = String(view.config.templateId ?? "");
  const template = workspace.sceneTemplates.find(
    (candidate) => candidate.id === templateId,
  );
  if (!template) {
    return emptyTemplateVm(view, activeSlotId ?? "");
  }
  const slotNodes = parseTemplateSlotNodes(view, template.slots);
  const bindings = workspace.slotBindings.filter(
    (binding) =>
      binding.exprId === view.exprId && binding.templateId === template.id,
  );
  const effectiveActive =
    activeSlotId ??
    bindings.find((binding) => binding.objectId === null)?.slotId ??
    template.slots[0]?.id ??
    "";
  const slots = template.slots.map((slot) => {
    const binding = bindingForSlot(bindings, view.exprId, template.id, slot.id);
    const object = binding.objectId
      ? workspace.objects.find((candidate) => candidate.id === binding.objectId)
      : undefined;
    const violation = object ? firstConstraintViolation(object, slot) : null;
    const bindingDangling = binding.state === "dangling";
    const node = slotNodes.find((candidate) => candidate.slotId === slot.id);
    return {
      id: slot.id,
      slotId: slot.id,
      bindingId: binding.id,
      label: slot.label,
      abstractType: slot.abstractType,
      state: bindingDangling
        ? "dangling"
        : object
          ? violation
            ? "violated"
            : "instantiated"
          : slot.id === effectiveActive
            ? "activated"
            : "empty",
      objectId: object?.id ?? null,
      objectName: objectName(object),
      sourceLabel: bindingDangling
        ? "引用对象不存在"
        : object
          ? objectTypeName(workspace, object)
          : "模板槽位",
      constraintText: slotConstraintText(slot),
      violationReason: bindingDangling ? "引用对象不存在" : violation,
      fields: object ? shownFieldRows(workspace, object, slot.shownFields) : [],
      x: node?.x ?? 100,
      y: node?.y ?? 100,
      w: node?.w ?? defaultSize.w,
      h: node?.h ?? defaultSize.h,
    } satisfies TemplateSlotVm;
  });
  const librarySlot =
    template.slots.find((slot) => slot.id === effectiveActive) ??
    template.slots[0]!;
  return {
    exprId: view.exprId,
    viewId: view.id,
    templateId: template.id,
    templateName: template.name,
    slots,
    edges: deriveTemplateEdges(template.slots, slots, edgeLabels(view)),
    pendingCount: slots.filter((slot) => slot.objectId === null).length,
    totalCount: slots.length,
    library: buildLibraryVm(workspace, view, librarySlot, bindings),
    hint: String(
      view.config.hint ??
        "模板只保存抽象槽位；拖入数据源记录后，字段随工作空间更新。",
    ),
  };
}

export function parseTemplateSlotNodes(
  view: ViewDef,
  slots: readonly SlotDef[],
): readonly TemplateSlotNodeConfig[] {
  const raw = Array.isArray(view.config.slotNodes) ? view.config.slotNodes : [];
  const fallback = slots.map((slot, index) => ({
    slotId: slot.id,
    x: 120 + (index % 3) * 300,
    y: 96 + Math.floor(index / 3) * 190,
  }));
  return raw.length > 0 ? (raw as TemplateSlotNodeConfig[]) : fallback;
}

export function matchSlotConstraints(
  object: DataObject,
  slot: SlotDef,
): { readonly ok: boolean; readonly reason: string } {
  const violation = firstConstraintViolation(object, slot);
  return { ok: violation === null, reason: violation ?? "匹配约束" };
}

export function deriveConfigDocAvailability(params: {
  readonly pendingCount: number;
  readonly errorCount: number;
  readonly canEdit: boolean;
}): { readonly enabled: boolean; readonly reason: string } {
  if (!params.canEdit) return { enabled: false, reason: "只读成员不可生成" };
  if (params.pendingCount > 0) {
    return {
      enabled: false,
      reason: `仍有 ${params.pendingCount} 个槽位未实例化`,
    };
  }
  if (params.errorCount > 0) {
    return { enabled: false, reason: "存在校验错误,修复后可生成" };
  }
  return { enabled: true, reason: "可生成配置单" };
}

function emptyTemplateVm(view: ViewDef, templateId: string): TemplateViewModel {
  return {
    exprId: view.exprId,
    viewId: view.id,
    templateId,
    templateName: "未知模板",
    slots: [],
    edges: [],
    pendingCount: 0,
    totalCount: 0,
    library: {
      title: "库",
      sourceLabel: "当前工作空间",
      total: 0,
      matching: 0,
      groupCounts: [],
      items: [],
      footer: "点击或拖入槽位即可实例化。",
    },
    hint: "当前模板不可用。",
  };
}

function objectTypeName(workspace: WorkspaceState, object: DataObject): string {
  return (
    workspace.objectTypes.find((type) => type.code === object.objectTypeCode)
      ?.name ?? object.objectTypeCode
  );
}

function bindingForSlot(
  bindings: readonly SlotBinding[],
  exprId: string,
  templateId: string,
  slotId: string,
): SlotBinding {
  return (
    bindings.find((binding) => binding.slotId === slotId) ?? {
      id: `missing-${exprId}-${slotId}`,
      exprId,
      templateId,
      slotId,
      objectId: null,
      updatedBy: "wangyun",
      updatedAt: "",
    }
  );
}

function objectName(object: DataObject | undefined): string | null {
  return object ? String(object.fields.name?.value ?? object.id) : null;
}

function slotConstraintText(slot: SlotDef): string {
  return (slot.constraintLabels ?? slot.constraints.map(formatConstraint)).join(
    " · ",
  );
}

function firstConstraintViolation(
  object: DataObject,
  slot: SlotDef,
): string | null {
  for (const constraint of slot.constraints) {
    if (!matchesConstraint(object, constraint)) {
      return `${constraint.field} ${constraint.op} ${String(constraint.value)}`;
    }
  }
  return null;
}

export function matchesConstraint(
  object: DataObject,
  constraint: SlotConstraint,
): boolean {
  const raw = object.fields[constraint.field]?.value ?? null;
  if (constraint.op === "eq") return raw === constraint.value;
  if (typeof raw !== "number" || typeof constraint.value !== "number") {
    return false;
  }
  return constraint.op === "gte"
    ? raw >= constraint.value
    : raw <= constraint.value;
}

function formatConstraint(constraint: SlotConstraint): string {
  return `${constraint.field} ${constraint.op} ${String(constraint.value)}`;
}

function shownFieldRows(
  workspace: WorkspaceState,
  object: DataObject,
  shownFields: readonly FieldCode[],
): TemplateSlotVm["fields"] {
  const type = workspace.objectTypes.find(
    (candidate) => candidate.code === object.objectTypeCode,
  );
  return shownFields.map((code) => {
    const field = type?.fields.find((candidate) => candidate.code === code);
    const value = object.fields[code]?.value ?? null;
    return {
      code,
      label: field?.name ?? code,
      value,
      text: formatValue(value, field?.unit),
    };
  });
}

function deriveTemplateEdges(
  slots: readonly SlotDef[],
  slotVms: readonly TemplateSlotVm[],
  labels: Readonly<Record<string, string>>,
): readonly TemplateEdgeVm[] {
  const byId = new Map(slotVms.map((slot) => [slot.slotId, slot]));
  return slots.flatMap((slot) =>
    (slot.connectsTo ?? []).flatMap((targetId) => {
      const source = byId.get(slot.id);
      const target = byId.get(targetId);
      if (!source || !target) return [];
      return [
        {
          id: `${slot.id}-${targetId}`,
          source: slot.id,
          target: targetId,
          label: labels[`${slot.id}:${targetId}`] ?? "关联",
          solid: Boolean(source.objectId && target.objectId),
        },
      ];
    }),
  );
}

function edgeLabels(view: ViewDef): Readonly<Record<string, string>> {
  const labels = view.config.edgeLabels;
  return labels && typeof labels === "object" && !Array.isArray(labels)
    ? (labels as Readonly<Record<string, string>>)
    : {};
}

function buildLibraryVm(
  workspace: WorkspaceState,
  view: ViewDef,
  slot: SlotDef,
  bindings: readonly SlotBinding[],
): TemplateLibraryVm {
  const boundIds = new Set(
    bindings.flatMap((binding) => binding.objectId ?? []),
  );
  const sourceTypeCode = String(view.config.libraryObjectTypeCode ?? "");
  const categoryField = String(view.config.libraryCategoryFieldCode ?? "");
  const category = slot.constraints.find(
    (constraint) =>
      constraint.field === categoryField && constraint.op === "eq",
  )?.value;
  const objects = workspace.objects.filter(
    (object) =>
      object.objectTypeCode === sourceTypeCode &&
      (category === undefined ||
        object.fields[categoryField]?.value === category),
  );
  const objectType = workspace.objectTypes.find(
    (type) => type.code === sourceTypeCode,
  );
  const specFields = stringList(view.config.librarySpecFieldCodes);
  const valueFieldCode = String(view.config.libraryValueFieldCode ?? "");
  const groupFieldCode = String(view.config.libraryGroupFieldCode ?? "");
  const valueField = objectType?.fields.find(
    (field) => field.code === valueFieldCode,
  );
  const items = objects.map((object) => {
    const match = matchSlotConstraints(object, slot);
    const bound = boundIds.has(object.id);
    return {
      objectId: object.id,
      name: String(object.fields.name?.value ?? object.id),
      specLine: specFields
        .map((code) => object.fields[code]?.value)
        .filter(Boolean)
        .join(" · "),
      valueText: formatValue(
        object.fields[valueFieldCode]?.value ?? null,
        valueField?.unit,
      ),
      group: String(object.fields[groupFieldCode]?.value ?? "其他"),
      matchState: bound ? "bound" : match.ok ? "match" : "mismatch",
      reason: bound ? "已在图中" : match.reason,
    } satisfies LibraryItemVm;
  });
  const groupCounts = Array.from(
    items.reduce((map, item) => {
      map.set(item.group, (map.get(item.group) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  ).map(([group, count]) => ({ group, count }));
  return {
    title: `库 · ${slot.label}`,
    sourceLabel: `${objectType?.name ?? "当前数据源"} › ${slot.label}`,
    total: items.length,
    matching: items.filter((item) => item.matchState === "match").length,
    groupCounts,
    items,
    footer: String(view.config.libraryFooter ?? "点击或拖入槽位即可实例化。"),
  };
}

function stringList(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function formatValue(value: DataFieldPrimitive, unit?: string): string {
  if (typeof value === "number") {
    const formatted = value.toLocaleString("zh-CN");
    return unit === "CNY" ? `¥${formatted}` : formatted;
  }
  if (value === null || value === "") return "—";
  return String(value);
}
