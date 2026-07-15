import { describe, expect, it } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import { WorkspaceStore } from "../state/workspace-store";
import { buildAnaViewModel } from "./ana-view-model";

describe("ana view model", () => {
  it("derives report copy and hidden dashboard exits", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    const workspace = store.getSnapshot();
    const report = workspace.anaReports[0]!;

    const vm = buildAnaViewModel(workspace, report);

    expect(vm.report.question).toContain("下降 2.1%");
    expect(vm.report.factors.map((factor) => factor.deltaText)).toEqual([
      "-3.4%",
      "-1.2%",
      "+2.5%",
      "-2.1%",
    ]);
    expect(vm.report.factorTitle).toBe("贡献度拆解");
    expect(vm.report.drillColumns.map((column) => column.label)).toEqual([
      "渠道",
      "客单价 Δ",
      "配件占比",
    ]);
    expect(vm.actions.map((action) => action.alreadyVisible)).toEqual([
      false,
      false,
    ]);
  });

  it("marks exits as already visible after KPI cards are revealed", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    store.setKpiVisible("kpi-ana-aov-net", true, "wangyun");
    store.setKpiVisible("kpi-ana-host", true, "wangyun");
    store.setKpiVisible("kpi-ana-accessory", true, "wangyun");
    const workspace = store.getSnapshot();

    const vm = buildAnaViewModel(workspace, workspace.anaReports[0]!);

    expect(vm.actions.map((action) => action.alreadyVisible)).toEqual([
      true,
      true,
    ]);
  });
});
