import type { BiBarDef, KpiCardDef } from "../model/view-layer";
import type { ViewDef } from "../model/kernel";
import type { WorkspaceState } from "../state/workspace-store";
import type { RuleOutcome } from "../validation/rules";
import { traverseObjectSubtree } from "../model/object-subtree";

const terminalObjectStatuses = new Set(["archived", "deleted", "soft-deleted"]);

export interface BiBoardVm {
  readonly title: string;
  readonly sourceLabel: string;
  readonly emptyLabel: string;
  readonly kpis: readonly KpiCardDef[];
  readonly bars: readonly BiBarDef[];
  readonly barGroups: readonly {
    readonly id: string;
    readonly title: string;
    readonly bars: readonly BiBarDef[];
  }[];
}

export function buildBiBoardVm(
  workspace: WorkspaceState,
  view?: ViewDef,
  selection?: { readonly entityType: string; readonly entityId: string } | null,
  kernelResults: readonly RuleOutcome[] = [],
  kernelStatus: "idle" | "running" | "ready" | "error" = "idle",
  kernelStale = false,
): BiBoardVm {
  const kpiIds = Array.isArray(view?.config.kpiIds)
    ? new Set(view.config.kpiIds.map(String))
    : null;
  const metrics = configuredMetrics(
    workspace,
    view,
    selection,
    kernelResults,
    kernelStatus,
    kernelStale,
  );
  const barGroups = configuredBarGroups(workspace, view);
  const bars = barGroups?.[0]?.bars ?? configuredBars(workspace, view);
  return {
    title: String(view?.config.title ?? "指标概览"),
    sourceLabel: String(view?.config.sourceLabel ?? "当前工作空间"),
    emptyLabel: String(view?.config.emptyLabel ?? "暂无可展示数据"),
    kpis:
      metrics ??
      workspace.kpis.filter(
        (kpi) => kpi.visible && (!kpiIds || kpiIds.has(kpi.id)),
      ),
    bars: bars ?? workspace.biBars,
    barGroups:
      barGroups ??
      (bars
        ? [{ id: "default", title: String(view?.config.title ?? ""), bars }]
        : []),
  };
}

function configuredMetrics(
  workspace: WorkspaceState,
  view: ViewDef | undefined,
  selection:
    | { readonly entityType: string; readonly entityId: string }
    | null
    | undefined,
  results: readonly RuleOutcome[],
  kernelStatus: "idle" | "running" | "ready" | "error",
  kernelStale: boolean,
) {
  if (!Array.isArray(view?.config.metrics)) return null;
  return view.config.metrics.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const config = entry as Record<string, unknown>;
    if (typeof config.objectTypeCode !== "string") return [];
    if (config.kind === "field") {
      const selected =
        selection?.entityType === "object"
          ? workspace.objects.find(
              (object) =>
                object.id === selection.entityId &&
                object.objectTypeCode === config.objectTypeCode &&
                !terminalObjectStatuses.has(object.status),
            )
          : undefined;
      const fieldCode = String(config.fieldCode ?? "");
      const related = selected
        ? resolveMetricObjects(workspace, selected.id, config.relationPath)
        : [];
      const rawValues = (
        related.length > 0 ? related : selected ? [selected] : []
      )
        .map((object) => object.fields[fieldCode]?.value)
        .filter((value) => value !== null && value !== undefined)
        .map(String);
      const value = selected
        ? rawValues.length === 0
          ? "暂无派生值"
          : `${rawValues.join(" / ")}${typeof config.unit === "string" ? ` ${config.unit}` : ""}`
        : "暂无当前方案";
      return [
        {
          id: String(config.id ?? fieldCode),
          label: String(config.label ?? fieldCode),
          value,
          delta: "当前真实对象",
          deltaSign: "flat" as const,
          sourceLabel: String(config.sourceLabel ?? fieldCode),
          objectId: selected?.id,
          visible: true,
        },
      ];
    }
    if (config.kind === "validation") {
      const level = String(config.level ?? "UNCHECKED");
      const ready = kernelStatus === "ready" && !kernelStale;
      const plans = workspace.objects.filter(
        (object) =>
          object.objectTypeCode === config.objectTypeCode &&
          !terminalObjectStatuses.has(object.status),
      );
      const value = ready
        ? String(
            plans.filter((plan) =>
              validationMatches(
                plan.id,
                level,
                results,
                workspace,
                Array.isArray(config.scopeRelationTypeCodes)
                  ? config.scopeRelationTypeCodes.filter(
                      (item): item is string => typeof item === "string",
                    )
                  : [],
                typeof config.scopeDepth === "number" ? config.scopeDepth : 1,
              ),
            ).length,
          )
        : "未校验";
      return [
        {
          id: String(config.id ?? `${config.objectTypeCode}-${level}`),
          label: String(config.label ?? level),
          value,
          delta: ready ? "后端校验结果" : "数据已变更或尚未校验",
          deltaSign: "flat" as const,
          sourceLabel: String(config.sourceLabel ?? "CheckResult"),
          visible: true,
        },
      ];
    }
    if (config.kind !== "count") return [];
    const count = workspace.objects.filter(
      (object) =>
        object.objectTypeCode === config.objectTypeCode &&
        !terminalObjectStatuses.has(object.status),
    ).length;
    return [
      {
        id: String(config.id ?? config.objectTypeCode),
        label: String(config.label ?? config.objectTypeCode),
        value: String(count),
        delta: "当前工作空间记录数",
        deltaSign: "flat" as const,
        sourceLabel: String(config.sourceLabel ?? config.objectTypeCode),
        visible: true,
      },
    ];
  });
}

function resolveMetricObjects(
  workspace: WorkspaceState,
  objectId: string,
  relationPath: unknown,
): readonly WorkspaceState["objects"][number][] {
  if (!Array.isArray(relationPath) || relationPath.length === 0)
    return workspace.objects.filter((object) => object.id === objectId);
  let current = workspace.objects.filter((object) => object.id === objectId);
  for (const relationType of relationPath.slice(0, 5)) {
    if (typeof relationType !== "string") return [];
    const targetIds = new Set(
      workspace.relations
        .filter(
          (relation) =>
            relation.status === "active" &&
            relation.relationTypeCode === relationType &&
            current.some((object) => object.id === relation.sourceId),
        )
        .map((relation) => relation.targetId),
    );
    current = workspace.objects.filter(
      (object) =>
        targetIds.has(object.id) && !terminalObjectStatuses.has(object.status),
    );
  }
  return current;
}

function validationMatches(
  objectId: string,
  level: string,
  results: readonly RuleOutcome[],
  workspace: WorkspaceState,
  relationTypes: readonly string[],
  depth: number,
): boolean {
  const members =
    relationTypes.length === 0
      ? new Set([objectId])
      : (traverseObjectSubtree(workspace, objectId, relationTypes, depth)
          ?.objectIds ?? new Set([objectId]));
  const matches = results.filter(
    (result) =>
      result.target?.entityType === "object" &&
      members.has(result.target.entityId),
  );
  if (level === "BLOCK")
    return matches.some((result) => result.level === "error");
  if (level === "WARN")
    return matches.some((result) => result.level === "warning");
  if (level === "PASS")
    return !matches.some(
      (result) => result.level === "error" || result.level === "warning",
    );
  return matches.length === 0;
}

function configuredBarGroups(workspace: WorkspaceState, view?: ViewDef) {
  const config = view?.config.recordSeries;
  if (!Array.isArray(config)) return null;
  return config.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const value = entry as Record<string, unknown>;
    const bars = configuredBarsFromConfig(workspace, value);
    return bars
      ? [
          {
            id: String(value.id ?? index),
            title: String(value.title ?? ""),
            bars,
          },
        ]
      : [];
  });
}

function configuredBars(workspace: WorkspaceState, view?: ViewDef) {
  const config = view?.config.recordSeries;
  if (!config || typeof config !== "object") return null;
  return configuredBarsFromConfig(workspace, config as Record<string, unknown>);
}

function configuredBarsFromConfig(
  workspace: WorkspaceState,
  config: Record<string, unknown>,
) {
  const { objectTypeCode, labelFieldCode, valueFieldCode } = config;
  if (
    typeof objectTypeCode !== "string" ||
    typeof labelFieldCode !== "string" ||
    typeof valueFieldCode !== "string"
  )
    return [];
  const values = workspace.objects
    .filter(
      (object) =>
        object.objectTypeCode === objectTypeCode &&
        !terminalObjectStatuses.has(object.status),
    )
    .flatMap((object) => {
      const value = object.fields[valueFieldCode]?.value;
      return typeof value === "number" && Number.isFinite(value)
        ? [
            {
              label: String(object.fields[labelFieldCode]?.value ?? object.id),
              value,
            },
          ]
        : [];
    });
  const maximum = Math.max(...values.map((item) => item.value), 0);
  return values.map((item) => ({
    ...item,
    percent: maximum === 0 ? 0 : (item.value / maximum) * 100,
    tone: "mid" as const,
  }));
}
