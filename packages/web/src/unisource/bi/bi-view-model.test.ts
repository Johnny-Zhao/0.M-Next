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
});
