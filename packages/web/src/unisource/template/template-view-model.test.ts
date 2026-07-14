import { describe, expect, it } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import { WorkspaceStore } from "../state/workspace-store";
import {
  buildTemplateViewModel,
  deriveConfigDocAvailability,
  matchesConstraint,
} from "./template-view-model";
import { resolveTemplateConfigDocHref } from "./template-canvas";

describe("template view model", () => {
  it("derives slot states, edges and the matching library for Z890", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed()).getSnapshot();
    const view = workspace.views.find(
      (candidate) => candidate.id === "view-build-z890-canvas",
    )!;

    const vm = buildTemplateViewModel(workspace, view, "slot-mainboard");

    expect(vm.pendingCount).toBe(3);
    expect(vm.totalCount).toBe(5);
    expect(vm.slots.map((slot) => [slot.slotId, slot.state])).toEqual([
      ["slot-cpu", "instantiated"],
      ["slot-psu", "instantiated"],
      ["slot-mainboard", "activated"],
      ["slot-memory", "empty"],
      ["slot-gpu", "empty"],
    ]);
    expect(
      vm.edges.find((edge) => edge.id === "slot-cpu-slot-mainboard")?.solid,
    ).toBe(false);
    expect(vm.library.matching).toBe(5);
    expect(
      vm.library.items.find((item) => item.objectId === "hw-mb-prime-b860m-a")
        ?.matchState,
    ).toBe("mismatch");
  });

  it("marks the B860 mATX binding as violated", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed()).getSnapshot();
    const view = workspace.views.find(
      (candidate) => candidate.id === "view-build-b860-canvas",
    )!;

    const vm = buildTemplateViewModel(workspace, view, "slot-mainboard");

    expect(
      vm.slots.find((slot) => slot.slotId === "slot-mainboard")?.state,
    ).toBe("violated");
  });

  it("exposes an unmatched slot binding as dangling", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed()).getSnapshot();
    const view = workspace.views.find(
      (candidate) => candidate.id === "view-build-z890-canvas",
    )!;
    const state = {
      ...workspace,
      slotBindings: workspace.slotBindings.map((binding) =>
        binding.exprId === view.exprId && binding.slotId === "slot-cpu"
          ? { ...binding, objectId: null, state: "dangling" as const }
          : binding,
      ),
    };

    const vm = buildTemplateViewModel(state, view, "slot-cpu");
    const slot = vm.slots.find((candidate) => candidate.slotId === "slot-cpu");

    expect(slot?.state).toBe("dangling");
    expect(slot?.violationReason).toBe("引用对象不存在");
  });

  it("shows mismatch candidates beyond mainboards", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed()).getSnapshot();
    const view = workspace.views.find(
      (candidate) => candidate.id === "view-build-z890-canvas",
    )!;

    const memoryVm = buildTemplateViewModel(workspace, view, "slot-memory");
    const gpuVm = buildTemplateViewModel(workspace, view, "slot-gpu");

    expect(
      memoryVm.library.items.find((item) => item.objectId === "hw-ram-ddr4-32")
        ?.matchState,
    ).toBe("mismatch");
    expect(
      gpuVm.library.items.find((item) => item.objectId === "hw-gpu-pcie4-4060")
        ?.matchState,
    ).toBe("mismatch");
  });

  it("resolves config doc targets from the current template expression", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed()).getSnapshot();

    expect(
      resolveTemplateConfigDocHref(
        workspace,
        "exp-build-z890",
        "tpl-install-v1",
      ),
    ).toBe("/expr/exp-build-z890-doc?form=doc");
    expect(
      resolveTemplateConfigDocHref(
        workspace,
        "exp-build-b860",
        "tpl-install-v1",
      ),
    ).toBe("/expr/exp-build-b860-doc?form=doc");
  });

  it("checks eq/gte/lte constraints and generation blockers", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed()).getSnapshot();
    const cpu = workspace.objects.find(
      (object) => object.id === "hw-cpu-ultra7-265k",
    )!;

    expect(
      matchesConstraint(cpu, { field: "cores", op: "gte", value: 16 }),
    ).toBe(true);
    expect(
      matchesConstraint(cpu, { field: "cores", op: "lte", value: 12 }),
    ).toBe(false);
    expect(
      deriveConfigDocAvailability({
        pendingCount: 1,
        errorCount: 0,
        canEdit: true,
      }).reason,
    ).toContain("未实例化");
    expect(
      deriveConfigDocAvailability({
        pendingCount: 0,
        errorCount: 1,
        canEdit: true,
      }).reason,
    ).toContain("校验错误");
  });
});
