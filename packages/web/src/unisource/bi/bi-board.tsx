import { useWorkspaceSnapshot } from "../state/workspace-store";
import { BarChart } from "./bar-chart";
import { buildBiBoardVm } from "./bi-view-model";
import { KpiCard } from "./kpi-card";

export function BiBoard() {
  const workspace = useWorkspaceSnapshot();
  const vm = buildBiBoardVm(workspace);
  return (
    <section className="us-bi-board">
      <div className="us-bi-kpis">
        {vm.kpis.map((kpi) => (
          <KpiCard key={kpi.id} kpi={kpi} />
        ))}
      </div>
      <BarChart bars={vm.bars} />
    </section>
  );
}
