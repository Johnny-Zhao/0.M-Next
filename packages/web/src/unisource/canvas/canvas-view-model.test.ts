import { describe, expect, it } from "vitest";

import { cloneDemoSeed } from "../seed/demo-seed";
import { WorkspaceStore } from "../state/workspace-store";
import {
  buildCanvasViewModel,
  canvasNodeConfigFromVm,
  deriveGotoTargets,
  deriveMixedValue,
  initialCanvasRootObjectId,
  parseCanvasConfig,
  screenToCanvasPosition,
  selectedCanvasRootObjectId,
  upsertCanvasNodes,
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

  it("uses a selected configured root to render its bounded graph", () => {
    const workspace = new WorkspaceStore({
      ...cloneDemoSeed(),
      objects: [
        canvasObject("plan-a", "build_plan"),
        canvasObject("item-a", "build_plan_item"),
      ],
      relations: [
        canvasRelation(
          "contains-a",
          "build_plan_contains_item",
          "plan-a",
          "item-a",
        ),
      ],
    }).getSnapshot();
    const view = {
      id: "pc",
      exprId: "expr",
      kind: "canvas" as const,
      config: {
        selectionObjectTypeCode: "build_plan",
        selectionRelationTypeCodes: ["build_plan_contains_item"],
        selectionDepth: 2,
      },
    };

    const vm = buildCanvasViewModel(workspace, view, "plan-a");

    expect(vm.nodes.map((node) => node.objectId)).toEqual(["plan-a", "item-a"]);
    expect(vm.edges.map((edge) => edge.relationId)).toEqual(["contains-a"]);
  });

  it("locates a selected related object through its configured root", () => {
    const workspace = new WorkspaceStore({
      ...cloneDemoSeed(),
      objects: [
        canvasObject("plan-a", "build_plan"),
        canvasObject("item-a", "build_plan_item"),
      ],
      relations: [
        canvasRelation(
          "contains-a",
          "build_plan_contains_item",
          "plan-a",
          "item-a",
        ),
      ],
    }).getSnapshot();
    const view = {
      id: "pc",
      exprId: "expr",
      kind: "canvas" as const,
      config: {
        selectionObjectTypeCode: "build_plan",
        selectionRelationTypeCodes: ["build_plan_contains_item"],
      },
    };

    expect(
      buildCanvasViewModel(workspace, view, "item-a").nodes.map(
        (node) => node.objectId,
      ),
    ).toEqual(["plan-a", "item-a"]);
    expect(initialCanvasRootObjectId(workspace, view)).toBe("plan-a");
    expect(buildCanvasViewModel(workspace, view, "missing").nodes).toEqual([]);
  });

  it("keeps the active derived root when a non-root object is selected", () => {
    const { workspace, view } = selectedCanvasFixture();
    const activeRootId = initialCanvasRootObjectId(workspace, view);

    expect(selectedCanvasRootObjectId(workspace, view, "item-a")).toBeNull();
    expect(
      buildCanvasViewModel(workspace, view, activeRootId).nodes.map(
        (node) => node.objectId,
      ),
    ).toEqual(["plan-a", "item-a"]);
    expect(selectedCanvasRootObjectId(workspace, view, "plan-a")).toBe(
      "plan-a",
    );
  });

  it("overlays persisted layout and upserts a dragged derived node", () => {
    const { workspace, view } = selectedCanvasFixture();
    const vm = buildCanvasViewModel(workspace, view, "plan-a");
    const positioned = upsertCanvasNodes(
      [],
      vm.nodes.map(canvasNodeConfigFromVm),
      ["item-a"],
      (node) => ({ ...node, x: 333, y: 444 }),
    );
    const updated = {
      ...view,
      config: { ...view.config, nodes: positioned },
    };

    expect(positioned).toMatchObject([{ objectId: "item-a", x: 333, y: 444 }]);
    expect(
      buildCanvasViewModel(workspace, updated, "plan-a").nodes[1],
    ).toMatchObject({
      objectId: "item-a",
      x: 333,
      y: 444,
    });
  });
});

function selectedCanvasFixture() {
  const workspace = new WorkspaceStore({
    ...cloneDemoSeed(),
    objects: [
      canvasObject("plan-a", "build_plan"),
      canvasObject("item-a", "build_plan_item"),
    ],
    relations: [
      canvasRelation(
        "contains-a",
        "build_plan_contains_item",
        "plan-a",
        "item-a",
      ),
    ],
  }).getSnapshot();
  return {
    workspace,
    view: {
      id: "pc",
      exprId: "expr",
      kind: "canvas" as const,
      config: {
        selectionObjectTypeCode: "build_plan",
        selectionRelationTypeCodes: ["build_plan_contains_item"],
        selectionDepth: 2,
      },
    },
  };
}

function canvasObject(id: string, objectTypeCode: string) {
  return {
    id,
    objectTypeCode,
    status: "active" as const,
    version: 1,
    fields: {},
    createdBy: "wangyun" as const,
    createdAt: "2026-07-16T00:00:00Z",
    updatedBy: "wangyun" as const,
    updatedAt: "2026-07-16T00:00:00Z",
  };
}

function canvasRelation(
  id: string,
  relationTypeCode: string,
  sourceId: string,
  targetId: string,
) {
  return {
    id,
    relationTypeCode,
    sourceId,
    targetId,
    status: "active" as const,
    fields: {},
    version: 1,
    annotationIds: [],
  };
}
