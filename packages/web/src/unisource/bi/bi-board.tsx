import { useWorkspaceSnapshot } from "../state/workspace-store";
import { selectionStore, useSelectionSnapshot } from "../state/selection-store";
import { useValidationSnapshot } from "../state/validation-store";
import { BarChart } from "./bar-chart";
import { buildBiBoardVm } from "./bi-view-model";
import { KpiCard } from "./kpi-card";

export function BiBoard({ viewId }: { readonly viewId: string }) {
  const workspace = useWorkspaceSnapshot();
  const selection = useSelectionSnapshot();
  const validation = useValidationSnapshot();
  const view = workspace.views.find(
    (candidate) => candidate.id === viewId && candidate.kind === "bi",
  );
  if (!view) return <p role="status">当前 BI 视图不可用。</p>;
  const vm = buildBiBoardVm(
    workspace,
    view,
    selection.current,
    validation.kernelResults,
    validation.kernelStatus,
    validation.kernelStale,
  );
  const selectObject = (objectId: string | undefined) => {
    if (objectId)
      selectionStore.set({ entityType: "object", entityId: objectId });
  };
  return (
    <section className="us-bi-board">
      <div className="us-bi-kpis">
        {vm.kpis.map((kpi) => (
          <KpiCard
            key={kpi.id}
            kpi={kpi}
            onSelect={() => selectObject(kpi.objectId)}
          />
        ))}
      </div>
      {vm.barGroups.length > 0 ? (
        vm.barGroups.map((group) => (
          <BarChart
            bars={group.bars}
            emptyLabel={vm.emptyLabel}
            key={group.id}
            onSelect={(bar) => selectObject(bar.objectId)}
            sourceLabel={vm.sourceLabel}
            title={group.title || vm.title}
          />
        ))
      ) : (
        <BarChart
          bars={vm.bars}
          emptyLabel={vm.emptyLabel}
          sourceLabel={vm.sourceLabel}
          title={vm.title}
        />
      )}
    </section>
  );
}
