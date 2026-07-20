import type { AnaReport } from "../model/view-layer";
import type { WorkspaceState } from "../state/workspace-store";
import type { RuleOutcome } from "../validation/rules";
import {
  buildAnaComparison,
  readAnaComparisonConfig,
  type AnaComparisonVm,
} from "./ana-comparison";

export interface AnaActionVm {
  readonly id: string;
  readonly label: string;
  readonly kpiIds: readonly string[];
  readonly alreadyVisible: boolean;
}

export interface AnaViewModel {
  readonly report: AnaReport;
  readonly actions: readonly AnaActionVm[];
  readonly comparison: AnaComparisonVm | null;
}

export function buildAnaViewModel(
  workspace: WorkspaceState,
  report: AnaReport,
  comparisonConfig?: unknown,
  kernelResults: readonly RuleOutcome[] = [],
  kernelStatus: "idle" | "running" | "ready" | "error" = "idle",
): AnaViewModel {
  const config = readAnaComparisonConfig(comparisonConfig);
  return {
    report,
    comparison: config
      ? buildAnaComparison(workspace, config, kernelResults, kernelStatus)
      : null,
    actions: [
      {
        id: "child",
        label: report.childActionLabel,
        kpiIds: report.childKpiIds,
        alreadyVisible: report.childKpiIds.every((id) =>
          isKpiVisible(workspace, id),
        ),
      },
      {
        id: "pin",
        label: "钉到看板",
        kpiIds: [report.pinKpiId],
        alreadyVisible: isKpiVisible(workspace, report.pinKpiId),
      },
    ],
  };
}

function isKpiVisible(workspace: WorkspaceState, kpiId: string): boolean {
  return workspace.kpis.find((kpi) => kpi.id === kpiId)?.visible === true;
}
