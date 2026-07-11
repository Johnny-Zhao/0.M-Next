import { describe, expect, it } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import { WorkspaceStore } from "../state/workspace-store";
import { buildBiBoardVm } from "./bi-view-model";

describe("buildBiBoardVm", () => {
  it("derives visible KPI cards and bars", () => {
    const store = new WorkspaceStore(cloneDemoSeed());

    const vm = buildBiBoardVm(store.getSnapshot());

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
});
