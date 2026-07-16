import type { BiBarDef, KpiCardDef } from "../model/view-layer";
import type { ViewDef } from "../model/kernel";
import type { WorkspaceState } from "../state/workspace-store";

const terminalObjectStatuses = new Set(["archived", "deleted", "soft-deleted"]);

export interface BiBoardVm {
  readonly title: string;
  readonly sourceLabel: string;
  readonly emptyLabel: string;
  readonly kpis: readonly KpiCardDef[];
  readonly bars: readonly BiBarDef[];
}

export function buildBiBoardVm(
  workspace: WorkspaceState,
  view?: ViewDef,
): BiBoardVm {
  const kpiIds = Array.isArray(view?.config.kpiIds)
    ? new Set(view.config.kpiIds.map(String))
    : null;
  const metrics = configuredMetrics(workspace, view);
  const bars = configuredBars(workspace, view);
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
  };
}

function configuredMetrics(workspace: WorkspaceState, view?: ViewDef) {
  if (!Array.isArray(view?.config.metrics)) return null;
  return view.config.metrics.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const config = entry as Record<string, unknown>;
    if (config.kind !== "count" || typeof config.objectTypeCode !== "string")
      return [];
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

function configuredBars(workspace: WorkspaceState, view?: ViewDef) {
  const config = view?.config.recordSeries;
  if (!config || typeof config !== "object") return null;
  const { objectTypeCode, labelFieldCode, valueFieldCode } = config as Record<
    string,
    unknown
  >;
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
