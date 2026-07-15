import { useWorkspaceSnapshot } from "../state/workspace-store";
import { BarChart } from "./bar-chart";
import { buildBiBoardVm } from "./bi-view-model";
import { KpiCard } from "./kpi-card";

export function BiBoard({ viewId }: { readonly viewId: string }) {
  const workspace = useWorkspaceSnapshot();
  const view = workspace.views.find(
    (candidate) => candidate.id === viewId && candidate.kind === "bi",
  );
  if (!view) return <p role="status">当前 BI 视图不可用。</p>;
  const vm = buildBiBoardVm(workspace, view);
  return (
    <section className="us-bi-board">
      <div className="us-bi-kpis">
        {vm.kpis.map((kpi) => (
          <KpiCard key={kpi.id} kpi={kpi} />
        ))}
      </div>
      <BarChart
        bars={vm.bars}
        emptyLabel={vm.emptyLabel}
        sourceLabel={vm.sourceLabel}
        title={vm.title}
      />
    </section>
  );
}
