import type { BiBarDef, KpiCardDef } from "../model/view-layer";
import type { ViewDef } from "../model/kernel";
import type { WorkspaceState } from "../state/workspace-store";

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
  return {
    title: String(view?.config.title ?? "指标概览"),
    sourceLabel: String(view?.config.sourceLabel ?? "当前工作空间"),
    emptyLabel: String(view?.config.emptyLabel ?? "暂无可展示数据"),
    kpis: workspace.kpis.filter(
      (kpi) => kpi.visible && (!kpiIds || kpiIds.has(kpi.id)),
    ),
    bars: workspace.biBars,
  };
}
