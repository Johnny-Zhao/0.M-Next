import { describe, expect, it } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import { WorkspaceStore } from "../state/workspace-store";
import {
  buildTemplateViewModel,
  deriveConfigDocAvailability,
  matchesConstraint,
} from "./template-view-model";

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
