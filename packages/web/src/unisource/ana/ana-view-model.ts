import type { AnaReport } from "../model/view-layer";
import type { WorkspaceState } from "../state/workspace-store";

export interface AnaActionVm {
  readonly id: string;
  readonly label: string;
  readonly kpiIds: readonly string[];
  readonly alreadyVisible: boolean;
}

export interface AnaViewModel {
  readonly report: AnaReport;
  readonly actions: readonly AnaActionVm[];
}

export function buildAnaViewModel(
  workspace: WorkspaceState,
  report: AnaReport,
): AnaViewModel {
  return {
    report,
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
