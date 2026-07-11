import { describe, expect, it } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import { WorkspaceStore } from "../state/workspace-store";
import { buildImportViewModel } from "./import-view-model";

describe("buildImportViewModel", () => {
  it("derives steps, stats, skipped rows and confirm gating", () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed).getSnapshot();
    const changeSet = seed.changeSets.find(
      (item) => item.id === "changeset-ai-quote",
    );

    const vm = buildImportViewModel({ workspace, changeSet });

    expect(vm.steps.map((step) => step.state)).toEqual([
      "done",
      "done",
      "current",
      "todo",
    ]);
    expect(vm.addCount).toBe(1);
    expect(vm.changeCount).toBe(3);
    expect(vm.skipCount).toBe(1);
    expect(vm.canConfirm).toBe(false);
    expect(vm.disabledReason).toBe("低置信项需逐项确认");
  });

  it("enables confirm after low-confidence items are confirmed", () => {
    const seed = cloneDemoSeed();
    const workspace = new WorkspaceStore(seed).getSnapshot();
    const changeSet = seed.changeSets.find(
      (item) => item.id === "changeset-ai-quote",
    );

    const vm = buildImportViewModel({
      workspace,
      changeSet,
      confirmedIds: new Set(["ai-launch"]),
    });

    expect(vm.canConfirm).toBe(true);
    expect(vm.confirmableItemIds).toEqual(["ai-launch"]);
  });
});
