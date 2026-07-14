import { describe, expect, it } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import { WorkspaceStore } from "../state/workspace-store";
import {
  buildCanvasViewModel,
  deriveGotoTargets,
  deriveMixedValue,
  parseCanvasConfig,
  screenToCanvasPosition,
} from "./canvas-view-model";

describe("canvas view model", () => {
  it("builds canvas nodes and active relation edges from the view config", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed()).getSnapshot();
    const view = workspace.views.find(
      (candidate) => candidate.id === "view-portal-canvas",
    )!;

    const vm = buildCanvasViewModel(workspace, view);

    expect(vm.nodes.map((node) => node.objectId)).toEqual([
      "prod-d2-pro",
      "prod-s3",
      "prod-e1",
      "prod-g2",
    ]);
    expect(vm.edges.map((edge) => edge.relationId)).toEqual([
      "rel-s3-g2-interconnect",
      "rel-d2pro-g2-interconnect",
      "rel-e1-g2-interconnect",
    ]);
    expect(vm.nodes[0]?.fields.map((field) => field.code)).toEqual([
      "price",
      "battery_months",
    ]);
    expect(vm.danglingRefs).toEqual([]);
  });

  it("filters dangling config entries and derives cross-form goto targets", () => {
    const workspace = new WorkspaceStore(cloneDemoSeed()).getSnapshot();
    const view = workspace.views.find(
      (candidate) => candidate.id === "view-portal-canvas",
    )!;
    const config = parseCanvasConfig({
      ...view,
      config: {
        nodes: [
          { objectId: "missing", x: 0, y: 0 },
          ...parseCanvasConfig(view).nodes,
        ],
        edges: [
          { relationId: "missing-rel" },
          ...parseCanvasConfig(view).edges,
        ],
      },
    });
    const vm = buildCanvasViewModel(workspace, {
      ...view,
      config: config as unknown as Record<string, unknown>,
    });

    expect(vm.nodes.some((node) => node.objectId === "missing")).toBe(false);
    expect(vm.edges.some((edge) => edge.relationId === "missing-rel")).toBe(
      false,
    );
    expect(vm.danglingRefs).toEqual([
      {
        id: "missing",
        kind: "object",
        message: "引用对象不存在",
      },
      {
        id: "missing-rel",
        kind: "relation",
        message: "引用关系不存在",
      },
    ]);
    expect(
      deriveGotoTargets(workspace, "prod-s3").map((target) => target.href),
    ).toContain("/source/product_specs?focus=prod-s3");
  });

  it("detects mixed values for multi-selection panels", () => {
    expect(deriveMixedValue([12, 12])).toBe(12);
    expect(deriveMixedValue([12, 14])).toBe("mixed");
    expect(deriveMixedValue([])).toBeNull();
  });

  it("converts screen drop coordinates to canvas coordinates", () => {
    expect(screenToCanvasPosition(480, 320, { left: 120, top: 80 })).toEqual({
      x: 360,
      y: 240,
    });
  });
});
