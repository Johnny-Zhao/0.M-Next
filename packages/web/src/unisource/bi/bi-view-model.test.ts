import { describe, expect, it } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import { WorkspaceStore } from "../state/workspace-store";
import { buildBiBoardVm } from "./bi-view-model";

describe("buildBiBoardVm", () => {
  it("derives visible KPI cards and bars", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    const workspace = store.getSnapshot();
    const view = workspace.views.find(
      (candidate) => candidate.id === "view-dashboard-bi",
    )!;

    const vm = buildBiBoardVm(workspace, view);

    expect(vm.title).toBe("各渠道销量 · 本月");
    expect(vm.sourceLabel).toBe("渠道销量表");
    expect(vm.kpis).toHaveLength(4);
    expect(vm.kpis.find((kpi) => kpi.aiAdded)?.id).toBe("kpi-active-channels");
    expect(vm.kpis.some((kpi) => kpi.id === "kpi-ana-aov-net")).toBe(false);
    expect(vm.bars.map((bar) => bar.tone)).toEqual([
      "high",
      "mid",
      "mid",
      "low",
      "low",
    ]);
  });

  it("hides AI KPI cards after undo", () => {
    const store = new WorkspaceStore(cloneDemoSeed());
    store.setKpiVisible("kpi-active-channels", false, "wangyun");

    expect(buildBiBoardVm(store.getSnapshot()).kpis).toHaveLength(3);
  });

  it("reveals analysis KPI cards when they are pinned", () => {
    const store = new WorkspaceStore(cloneDemoSeed());

    store.setKpiVisible("kpi-ana-aov-net", true, "wangyun");

    expect(
      buildBiBoardVm(store.getSnapshot()).kpis.map((kpi) => kpi.id),
    ).toContain("kpi-ana-aov-net");
  });

  it("reads configured record counts and raw values from the current workspace", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed()).getSnapshot();
    const vm = buildBiBoardVm(workspace, {
      id: "bi-current-data",
      exprId: "expr",
      kind: "bi",
      config: {
        metrics: [
          { kind: "count", objectTypeCode: "product_specs", label: "产品数" },
        ],
        recordSeries: {
          objectTypeCode: "product_specs",
          labelFieldCode: "name",
          valueFieldCode: "price",
        },
      },
    });

    expect(vm.kpis[0]).toMatchObject({ label: "产品数", value: "8" });
    expect(vm.bars[0]).toMatchObject({ label: "门锁 S3", value: 1199 });
  });
});
