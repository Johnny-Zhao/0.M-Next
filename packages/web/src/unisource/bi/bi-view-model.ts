import type { BiBarDef, KpiCardDef } from "../model/view-layer";
import type { WorkspaceState } from "../state/workspace-store";

export interface BiBoardVm {
  readonly kpis: readonly KpiCardDef[];
  readonly bars: readonly BiBarDef[];
}

export function buildBiBoardVm(workspace: WorkspaceState): BiBoardVm {
  return {
    kpis: workspace.kpis.filter((kpi) => kpi.visible),
    bars: workspace.biBars,
  };
}
